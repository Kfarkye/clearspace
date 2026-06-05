#!/usr/bin/env node
// ============================================================================
// Scrape all 48 team pages from TheDrip.to
// Extracts: coach, qualifying record, WC history, tournament odds, 
//           multi-book group odds, match schedule with exact times
// Updates Spanner teams table + stores rich profile as JSON
// ============================================================================

import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const db = new Spanner({ projectId: PROJECT })
  .instance('aura-governance-instance')
  .database('world-cup-db');

// Team slug → team_code mapping
const TEAM_SLUGS = {
  'algeria': 'ALG', 'argentina': 'ARG', 'australia': 'AUS', 'austria': 'AUT',
  'belgium': 'BEL', 'bosnia-herz': 'BIH', 'brazil': 'BRA', 'canada': 'CAN',
  'cape-verde': 'CPV', 'colombia': 'COL', 'croatia': 'CRO', 'curacao': 'CUR',
  'czechia': 'CZE', 'dr-congo': 'COD', 'ecuador': 'ECU', 'egypt': 'EGY',
  'england': 'ENG', 'france': 'FRA', 'germany': 'GER', 'ghana': 'GHA',
  'haiti': 'HAI', 'iran': 'IRN', 'iraq': 'IRQ', 'ivory-coast': 'CIV',
  'japan': 'JPN', 'jordan': 'JOR', 'mexico': 'MEX', 'morocco': 'MAR',
  'netherlands': 'NED', 'new-zealand': 'NZL', 'norway': 'NOR', 'panama': 'PAN',
  'paraguay': 'PAR', 'portugal': 'POR', 'qatar': 'QAT', 'saudi-arabia': 'KSA',
  'scotland': 'SCO', 'senegal': 'SEN', 'south-africa': 'RSA', 'south-korea': 'KOR',
  'spain': 'ESP', 'sweden': 'SWE', 'switzerland': 'SUI', 'tunisia': 'TUN',
  'turkiye': 'TUR', 'united-states': 'USA', 'uruguay': 'URU', 'uzbekistan': 'UZB',
};

async function scrapeTeam(slug) {
  const url = `https://r.jina.ai/https://thedrip.to/teams/${slug}/`;
  const res = await fetch(url);
  const text = await res.text();
  return text;
}

function parseTeamPage(markdown, slug) {
  const code = TEAM_SLUGS[slug];
  const profile = { team_code: code, slug };

  // ── COACH ──────────────────────────────────────────────────────
  // Pattern 1: "Coach: Name" in hero section
  const coachMatch = markdown.match(/Coach:\s*([A-Za-zÀ-ÿ\u0100-\u017F'. -]+)/);
  if (coachMatch) profile.manager = coachMatch[1].trim();
  
  // Pattern 2: "Managed by Name" in FAQ section
  if (!profile.manager) {
    const managedMatch = markdown.match(/[Mm]anaged by\s+([A-Za-zÀ-ÿ\u0100-\u017F'. -]+?)[\.,]/);
    if (managedMatch) profile.manager = managedMatch[1].trim();
  }

  // ── WORLD CUP HISTORY ─────────────────────────────────────────
  const historyParts = [];
  const championMatch = markdown.match(/(\d+)×\s*World\s*Champion/i);
  if (championMatch) historyParts.push(`${championMatch[1]}× World Champion`);
  
  // "One World Cup title (2010)" style
  const titleMatch = markdown.match(/(\w+)\s+World Cup title[s]?\s*\(([^)]+)\)/i);
  if (titleMatch && !championMatch) historyParts.push(`World Cup Champion (${titleMatch[2]})`);

  const runnerUpMatch = markdown.match(/(\d{4})\s*Runner-Up/i);
  if (runnerUpMatch) historyParts.push(`${runnerUpMatch[1]} Runner-Up`);

  if (markdown.includes('Host Nation')) historyParts.push('Host Nation');
  if (markdown.includes('WC Debut')) historyParts.push('World Cup Debut');

  // European Championships count
  const euroMatch = markdown.match(/(\w+)\s+European Championships?\s*\(([^)]+)\)/i);
  if (euroMatch) historyParts.push(`Euro Champion (${euroMatch[2]})`);

  if (historyParts.length > 0) profile.world_cup_history = historyParts.join('; ');

  // ── WC HISTORY TABLE ───────────────────────────────────────────
  // Parse: | Year | Result | GP | W | D | L | GF-GA |
  const historyRows = [];
  const tableRowRegex = /\|\s*(\d{4})\s*\|\s*([^|]+)\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+-\d+)\s*\|/g;
  let tr;
  while ((tr = tableRowRegex.exec(markdown)) !== null) {
    historyRows.push({
      year: parseInt(tr[1]),
      result: tr[2].trim(),
      gp: parseInt(tr[3]),
      w: parseInt(tr[4]),
      d: parseInt(tr[5]),
      l: parseInt(tr[6]),
      gfGa: tr[7].trim(),
    });
  }
  if (historyRows.length > 0) profile.wc_history_table = historyRows;

  // ── ALL-TIME WC RECORD ─────────────────────────────────────────
  // "27 Matches" "15-7-5 W-D-L" "47-27 GF-GA" "54.9% Avg Possession"
  const allTimeMatch = markdown.match(/(\d+)\n\nMatches\n\n(\d+-\d+-\d+)\n\nW-D-L\n\n(\d+-\d+)\n\nGF-GA\n\n([\d.]+%)\n\nAvg Possession/);
  if (allTimeMatch) {
    profile.wc_all_time = {
      matches: parseInt(allTimeMatch[1]),
      record: allTimeMatch[2],
      gfGa: allTimeMatch[3],
      avgPossession: allTimeMatch[4],
    };
  }

  // ── QUALIFYING RECORD ──────────────────────────────────────────
  // "5-1-0 Record" "21 Goals For" "2 Goals Against" "70.4% Possession"
  const qualMatch = markdown.match(/(\d+-\d+-\d+)\n\nRecord\n\n(\d+)\n\nGoals For\n\n(\d+)\n\nGoals Against\n\n([\d.]+%)\n\nPossession/);
  if (qualMatch) {
    profile.qualifying = {
      record: qualMatch[1],
      goalsFor: parseInt(qualMatch[2]),
      goalsAgainst: parseInt(qualMatch[3]),
      possession: qualMatch[4],
    };
  }

  // Qualifying blurb
  const qualBlurb = markdown.match(/qualified through\s+(\w+)\s+with\s+\*\*([^*]+)\*\*[^.]*\./i);
  if (qualBlurb) {
    profile.qualifying = profile.qualifying || {};
    profile.qualifying.confederation = qualBlurb[1];
    profile.qualifying.summary = qualBlurb[0].replace(/\*\*/g, '');
  }

  // ── GROUP WINNER ODDS (MULTI-BOOK) ─────────────────────────────
  // First team card shows: "-400\n\n80.0%\n\nDK -400 MGM -380 FD -420"
  // The team's own odds are always the first set after their name+image
  const teamNameEscaped = slug.replace(/-/g, '[ -]');
  
  // Find the odds right after this team's image/name block
  // Pattern: team logo → name → FIFA line → odds → implied% → books
  const oddsBlockRegex = new RegExp(
    `${profile.team_code === TEAM_SLUGS[slug] ? '' : ''}` +
    `([-+]\\d+)\\n\\n([\\d.]+%)\\n\\n(DK\\s*[-+]\\d+(?:\\s+MGM\\s*[-+]\\d+)?(?:\\s+FD\\s*[-+]\\d+)?)`,
    'i'
  );
  const oddsBlock = markdown.match(oddsBlockRegex);
  if (oddsBlock) {
    const mainOdds = parseInt(oddsBlock[1]);
    profile.group_winner_odds = mainOdds;
    profile.implied_probability = oddsBlock[2];
    
    // Parse multi-book
    const books = {};
    const bookRegex = /(DK|MGM|FD)\s*([-+]\d+)/g;
    let bm;
    while ((bm = bookRegex.exec(oddsBlock[3])) !== null) {
      const bookName = bm[1] === 'DK' ? 'DraftKings' : bm[1] === 'MGM' ? 'BetMGM' : 'FanDuel';
      books[bookName] = parseInt(bm[2]);
    }
    if (Object.keys(books).length > 0) profile.group_odds_by_book = books;
  }

  // ── TOURNAMENT WINNER ODDS ─────────────────────────────────────
  // "DraftKings\n\n+450\n\n18.2%\n\nBetMGM\n\n+450..."
  const tourneyBooks = {};
  const tourneyRegex = /(DraftKings|BetMGM|FanDuel)\n\n([+-]\d+)\n\n([\d.]+%)/g;
  let tm;
  while ((tm = tourneyRegex.exec(markdown)) !== null) {
    tourneyBooks[tm[1]] = { odds: parseInt(tm[2]), implied: tm[3] };
  }
  if (Object.keys(tourneyBooks).length > 0) {
    profile.tournament_odds_by_book = tourneyBooks;
    // Use DraftKings as primary
    if (tourneyBooks.DraftKings) {
      profile.tournament_odds = String(tourneyBooks.DraftKings.odds);
    }
  }

  // ── LOGO URL ───────────────────────────────────────────────────
  const logoMatch = markdown.match(/https:\/\/a\.espncdn\.com\/i\/teamlogos\/countries\/500\/[a-z]+\.png/);
  if (logoMatch) profile.logo_url = logoMatch[0];

  // ── MATCH SCHEDULE ─────────────────────────────────────────────
  const matches = [];
  // Pattern: "vs\n\nOpponent\n\nDay, Month Date\n\nVenue, City\n\nTime ET"
  const schedParts = markdown.split(/Group Stage/i);
  if (schedParts.length > 1) {
    const schedSection = schedParts[1];
    const matchRegex = /([A-Z][a-z]+,\s*[A-Z][a-z]+\s*\d+)\n\n([^,\n]+,\s*[A-Za-z ]+)\n\n(\d+:\d+\s*[AP]M\s*ET)/g;
    let mm;
    while ((mm = matchRegex.exec(schedSection)) !== null) {
      matches.push({ date: mm[1].trim(), venue: mm[2].trim(), time: mm[3].trim() });
    }
  }
  if (matches.length > 0) profile.schedule = matches;

  return profile;
}

async function main() {
  console.log('🌎 Scraping all 48 team pages from TheDrip.to...\n');
  
  const slugs = Object.keys(TEAM_SLUGS);
  const profiles = [];
  
  // Scrape one at a time to guarantee full content
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    try {
      const md = await scrapeTeam(slug);
      const profile = parseTeamPage(md, slug);
      
      const parts = [];
      parts.push(profile.manager ? `Coach: ${profile.manager}` : 'no coach');
      if (profile.qualifying) parts.push(`Qual: ${profile.qualifying.record || '?'}`);
      if (profile.tournament_odds) parts.push(`Tourney: ${profile.tournament_odds}`);
      if (profile.wc_history_table) parts.push(`${profile.wc_history_table.length} WC appearances`);
      parts.push(`odds: ${profile.group_winner_odds || '-'}`);
      
      console.log(`  [${i+1}/48] ✓ ${slug} → ${parts.join(' | ')}`);
      profiles.push(profile);
    } catch (err) {
      console.error(`  [${i+1}/48] ✗ ${slug}: ${err.message}`);
    }
    
    // 1.5s delay between requests
    if (i < slugs.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n📊 Scraped ${profiles.length} team profiles`);
  
  // Stats
  const withCoach = profiles.filter(p => p.manager).length;
  const withQual = profiles.filter(p => p.qualifying).length;
  const withTourney = profiles.filter(p => p.tournament_odds).length;
  const withHistory = profiles.filter(p => p.wc_history_table).length;
  console.log(`   Coaches: ${withCoach} | Qualifying: ${withQual} | Tournament odds: ${withTourney} | WC history: ${withHistory}`);

  // Update Spanner
  console.log('\n💾 Updating teams table in Spanner...');
  
  const table = db.table('teams');
  let updated = 0;
  
  for (const p of profiles) {
    const row = {
      team_code: p.team_code,
      updated_at: new Date().toISOString(),
    };
    
    if (p.manager) row.manager = p.manager;
    if (p.world_cup_history) row.world_cup_history = p.world_cup_history;
    if (p.logo_url) row.logo_url = p.logo_url;
    if (p.group_winner_odds !== undefined) row.group_winner_odds = p.group_winner_odds;
    if (p.implied_probability) {
      const pct = parseFloat(p.implied_probability) / 100;
      row.implied_probability = Spanner.numeric(pct.toFixed(4));
    }
    if (p.tournament_odds) row.tournament_odds = p.tournament_odds;
    
    // Store the full rich profile as JSON in key_players column (repurposed as profile_json)
    const richProfile = {};
    if (p.qualifying) richProfile.qualifying = p.qualifying;
    if (p.wc_history_table) richProfile.wcHistory = p.wc_history_table;
    if (p.wc_all_time) richProfile.wcAllTime = p.wc_all_time;
    if (p.group_odds_by_book) richProfile.groupOddsByBook = p.group_odds_by_book;
    if (p.tournament_odds_by_book) richProfile.tournamentOddsByBook = p.tournament_odds_by_book;
    if (p.schedule) richProfile.schedule = p.schedule;
    
    if (Object.keys(richProfile).length > 0) {
      row.key_players = JSON.stringify(richProfile);
    }

    try {
      await table.update(row);
      updated++;
    } catch (err) {
      console.error(`  ✗ Failed to update ${p.team_code}: ${err.message}`);
    }
  }

  console.log(`  ✓ Updated ${updated}/${profiles.length} teams\n`);

  // Verify
  const [rows] = await db.run({ 
    sql: `SELECT team_code, name, manager, world_cup_history, group_winner_odds, tournament_odds, key_players
          FROM teams WHERE manager IS NOT NULL ORDER BY fifa_ranking LIMIT 10` 
  });
  console.log('📋 Sample enriched teams:');
  rows.forEach(r => {
    const t = r.toJSON();
    const profile = t.key_players ? JSON.parse(t.key_players) : {};
    const qual = profile.qualifying ? ` | Qual: ${profile.qualifying.record}` : '';
    const wc = profile.wcHistory ? ` | ${profile.wcHistory.length} WC` : '';
    const tourney = t.tournament_odds ? ` | Tourney: ${t.tournament_odds}` : '';
    console.log(`  ${t.team_code} | ${t.name} | ${t.manager} | ${t.world_cup_history || '-'}${qual}${wc}${tourney}`);
  });

  await db.close();
  console.log('\n✅ Done');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
