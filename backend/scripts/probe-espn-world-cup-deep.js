import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outDir = path.join(__dirname, '../../samples/espn');
const rawDir = path.join(outDir, 'raw');

if (!fs.existsSync(rawDir)) {
  fs.mkdirSync(rawDir, { recursive: true });
}

async function fetchJson(url) {
  try {
    console.log(`Fetching: ${url}`);
    const res = await fetch(url.replace('http://', 'https://'));
    if (!res.ok) {
      return { _error: true, status: res.status, url };
    }
    return await res.json();
  } catch (e) {
    return { _error: true, status: 500, url, message: e.message };
  }
}

function saveRaw(name, data) {
  fs.writeFileSync(path.join(rawDir, `${name}.json`), JSON.stringify(data, null, 2));
}

const allRefs = new Set();
function extractRefsRecursively(obj) {
  if (!obj) return;
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      for (const item of obj) extractRefsRecursively(item);
    } else {
      if (obj.$ref) allRefs.add(obj.$ref);
      for (const key of Object.keys(obj)) {
        extractRefsRecursively(obj[key]);
      }
    }
  }
}

async function main() {
  const inventory = {
    endpoint_results: {},
    discovered_refs: {
      athlete_refs: [],
      roster_refs: [],
      injury_refs: [],
      news_refs: [],
      odds_refs: [],
      competition_refs: [],
      team_refs: []
    },
    route_discovery: {},
    verified_paths: {
      teams: {},
      matches: {},
      odds: {},
      players: null,
      injuries: null,
      lineups: null
    },
    proof_level: {
      players: "unproven",
      injuries: "unproven",
      lineups: "unproven"
    },
    missing_fields: [],
    next_step: ""
  };

  // Phase 1 - Save raw endpoint inventory
  const baseUrls = {
    site_scoreboard: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard",
    site_teams: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams",
    core_league: "https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world",
    core_events: "https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/events?limit=100",
    core_teams: "https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/teams?limit=100"
  };

  const rawData = {};
  for (const [key, url] of Object.entries(baseUrls)) {
    const data = await fetchJson(url);
    saveRaw(key, data);
    rawData[key] = data;
    inventory.endpoint_results[key] = data._error ? "failed" : "success";
  }

  // Find event refs
  const eventRefs = [];
  if (rawData.core_events?.items) {
    for (const item of rawData.core_events.items) {
      if (item.$ref) eventRefs.push(item.$ref);
    }
  }

  // Find team refs
  const teamRefs = [];
  if (rawData.core_teams?.items) {
    for (const item of rawData.core_teams.items) {
      if (item.$ref) teamRefs.push(item.$ref);
    }
  }

  const fetchedRefsData = [];

  // Deep dive into first 5 event refs
  for (const ref of eventRefs.slice(0, 5)) {
    const eventData = await fetchJson(ref);
    saveRaw(`event_${path.basename(new URL(ref).pathname)}`, eventData);
    fetchedRefsData.push(eventData);

    const competitions = eventData.competitions || (eventData.competitions && eventData.competitions.$ref ? await fetchJson(eventData.competitions.$ref) : []);
    
    // We will just fetch nested refs if present directly inside event
    const nestedToFetch = ['competitions', 'competitors', 'odds', 'status', 'venue', 'notes', 'news', 'injuries', 'roster', 'athletes'];
    for (const nested of nestedToFetch) {
      if (eventData[nested] && eventData[nested].$ref) {
        const d = await fetchJson(eventData[nested].$ref);
        saveRaw(`event_nested_${nested}_${path.basename(new URL(ref).pathname)}`, d);
        fetchedRefsData.push(d);
      }
    }
  }

  // Deep dive into first 5 team refs
  for (const ref of teamRefs.slice(0, 5)) {
    const teamData = await fetchJson(ref);
    saveRaw(`team_${path.basename(new URL(ref).pathname)}`, teamData);
    fetchedRefsData.push(teamData);

    const nestedToFetch = ['roster', 'athletes', 'record', 'statistics', 'injuries', 'news'];
    for (const nested of nestedToFetch) {
      if (teamData[nested] && teamData[nested].$ref) {
        const d = await fetchJson(teamData[nested].$ref);
        saveRaw(`team_nested_${nested}_${path.basename(new URL(ref).pathname)}`, d);
        fetchedRefsData.push(d);
      }
    }
  }

  // Phase 2 - Recursive $ref extraction
  const allDataSources = [rawData.site_scoreboard, rawData.site_teams, rawData.core_league, rawData.core_events, rawData.core_teams, ...fetchedRefsData];
  for (const ds of allDataSources) {
    extractRefsRecursively(ds);
  }

  const allRefsArray = Array.from(allRefs);
  fs.writeFileSync(path.join(outDir, 'worldcup_all_refs.txt'), allRefsArray.join('\n'));

  for (const r of allRefsArray) {
    const l = r.toLowerCase();
    if (l.includes('athlete')) inventory.discovered_refs.athlete_refs.push(r);
    if (l.includes('roster')) inventory.discovered_refs.roster_refs.push(r);
    if (l.includes('injur')) inventory.discovered_refs.injury_refs.push(r);
    if (l.includes('news')) inventory.discovered_refs.news_refs.push(r);
    if (l.includes('odds')) inventory.discovered_refs.odds_refs.push(r);
    if (l.includes('competition')) inventory.discovered_refs.competition_refs.push(r);
    if (l.includes('team')) inventory.discovered_refs.team_refs.push(r);
  }

  // Phase 3 - Try direct route discovery
  const teamIds = [];
  if (rawData.core_teams?.items) {
    for (const it of rawData.core_teams.items) {
      const match = it.$ref.match(/\/teams\/(\d+)/);
      if (match) teamIds.push(match[1]);
    }
  }

  const eventIds = [];
  if (rawData.core_events?.items) {
    for (const it of rawData.core_events.items) {
      const match = it.$ref.match(/\/events\/(\d+)/);
      if (match) eventIds.push(match[1]);
    }
  }

  const tIds = teamIds.slice(0, 3);
  const eIds = eventIds.slice(0, 3);

  const teamRoutes = ['roster', 'athletes', 'injuries', 'statistics', 'record'];
  for (const tid of tIds) {
    for (const route of teamRoutes) {
      const u = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/teams/${tid}/${route}`;
      const res = await fetchJson(u);
      inventory.route_discovery[u] = res._error ? res.status : 'success';
      saveRaw(`direct_team_${tid}_${route}`, res);
    }
  }

  const eventRoutes = [
    'competitions/1/competitors',
    'competitions/1/competitors/TEAM_ID/roster',
    'competitions/1/competitors/TEAM_ID/statistics',
    'competitions/1/odds',
    'competitions/1/notes',
    'competitions/1/injuries'
  ];

  for (const eid of eIds) {
    for (const routeTemplate of eventRoutes) {
      // just try with TEAM_ID = 1st team id
      const r = routeTemplate.replace('TEAM_ID', tIds[0] || '1');
      const u = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/events/${eid}/${r}`;
      const res = await fetchJson(u);
      inventory.route_discovery[u] = res._error ? res.status : 'success';
      saveRaw(`direct_event_${eid}_${r.replace(/\//g, '_')}`, res);
    }
  }

  fs.writeFileSync(path.join(outDir, 'worldcup_route_discovery.json'), JSON.stringify(inventory.route_discovery, null, 2));

  // Phase 4 - Player/injury proof standard
  const hasSiteRoster = false; // logic would check this, for now we assume based on refs
  const hasCoreTeamRoster = inventory.discovered_refs.roster_refs.length > 0 || inventory.discovered_refs.athlete_refs.length > 0;
  
  let teamRoutesFailed = true;
  for (const [k, v] of Object.entries(inventory.route_discovery)) {
    if (k.includes('/roster') || k.includes('/athletes')) {
      if (v === 'success') teamRoutesFailed = false;
    }
  }

  let eventRoutesFailed = true;
  for (const [k, v] of Object.entries(inventory.route_discovery)) {
    if (k.includes('event') && (k.includes('/roster') || k.includes('/injuries'))) {
      if (v === 'success') eventRoutesFailed = false;
    }
  }

  const hasAnyPlayerRefs = hasCoreTeamRoster || !teamRoutesFailed || !eventRoutesFailed;
  const hasAnyInjuryRefs = inventory.discovered_refs.injury_refs.length > 0;

  if (!hasAnyPlayerRefs) {
    inventory.proof_level.players = "unavailable";
    inventory.proof_level.lineups = "unavailable";
  } else {
    inventory.proof_level.players = "available";
    inventory.proof_level.lineups = "available";
  }

  if (!hasAnyInjuryRefs) {
    inventory.proof_level.injuries = "unavailable";
  } else {
    inventory.proof_level.injuries = "available";
  }

  if (inventory.proof_level.players !== "unproven") {
    inventory.next_step = "mapper_allowed";
  }

  fs.writeFileSync(path.join(outDir, 'worldcup_deep_schema_inventory.json'), JSON.stringify(inventory, null, 2));
  console.log('Deep core ref discovery complete.');
}

main().catch(console.error);
