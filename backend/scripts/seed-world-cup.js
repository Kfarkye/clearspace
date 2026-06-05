#!/usr/bin/env node
// ============================================================================
// World Cup 2026 — Full Data Seeder from TheDrip.to
//
// Scrapes the TheDrip.to homepage and all 12 group pages via Jina Reader,
// parses team/venue/match/odds data, and writes to Spanner world-cup-db.
//
// Usage: node --env-file=.env.local scripts/seed-world-cup.js
// ============================================================================

import { Spanner } from '@google-cloud/spanner';
import { v4 as uuid } from 'uuid';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = 'aura-governance-instance';
const DATABASE = process.env.WC_SPANNER_DATABASE || 'sports-db';

const client = new Spanner({ projectId: PROJECT });
const db = client.instance(INSTANCE).database(DATABASE);

// ── FLAG EMOJI MAP ──────────────────────────────────────────────────────────
const FLAGS = {
  MEX:'🇲🇽', KOR:'🇰🇷', RSA:'🇿🇦', CZE:'🇨🇿',
  SUI:'🇨🇭', CAN:'🇨🇦', QAT:'🇶🇦', BIH:'🇧🇦',
  BRA:'🇧🇷', MAR:'🇲🇦', SCO:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', HAI:'🇭🇹',
  USA:'🇺🇸', TUR:'🇹🇷', PAR:'🇵🇾', AUS:'🇦🇺',
  GER:'🇩🇪', ECU:'🇪🇨', CIV:'🇨🇮', CUR:'🇨🇼',
  NED:'🇳🇱', JPN:'🇯🇵', TUN:'🇹🇳', SWE:'🇸🇪',
  BEL:'🇧🇪', EGY:'🇪🇬', IRN:'🇮🇷', NZL:'🇳🇿',
  ESP:'🇪🇸', URU:'🇺🇾', KSA:'🇸🇦', CPV:'🇨🇻',
  FRA:'🇫🇷', SEN:'🇸🇳', NOR:'🇳🇴', IRQ:'🇮🇶',
  ARG:'🇦🇷', AUT:'🇦🇹', ALG:'🇩🇿', JOR:'🇯🇴',
  POR:'🇵🇹', COL:'🇨🇴', UZB:'🇺🇿', PAN:'🇵🇦',
  ENG:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', CRO:'🇭🇷', GHA:'🇬🇭', COD:'🇨🇩',
};

// ── ESPN CODE → NAME RESOLUTION ─────────────────────────────────────────────
const ESPN_CODE_MAP = {
  'mex': 'MEX', 'kor': 'KOR', 'rsa': 'RSA', 'cze': 'CZE',
  'sui': 'SUI', 'can': 'CAN', 'qat': 'QAT', 'bih': 'BIH',
  'bra': 'BRA', 'mar': 'MAR', 'sco': 'SCO', 'hai': 'HAI',
  'usa': 'USA', 'tur': 'TUR', 'par': 'PAR', 'aus': 'AUS',
  'ger': 'GER', 'ecu': 'ECU', 'civ': 'CIV', 'cur': 'CUR',
  'ned': 'NED', 'jpn': 'JPN', 'tun': 'TUN', 'swe': 'SWE',
  'bel': 'BEL', 'egy': 'EGY', 'irn': 'IRN', 'nzl': 'NZL',
  'esp': 'ESP', 'uru': 'URU', 'ksa': 'KSA', 'cpv': 'CPV',
  'fra': 'FRA', 'sen': 'SEN', 'nor': 'NOR', 'irq': 'IRQ',
  'arg': 'ARG', 'aut': 'AUT', 'alg': 'ALG', 'jor': 'JOR',
  'por': 'POR', 'col': 'COL', 'uzb': 'UZB', 'pan': 'PAN',
  'eng': 'ENG', 'cro': 'CRO', 'gha': 'GHA',
};

// ── ALL 48 TEAMS FROM THEDRIP HOMEPAGE ──────────────────────────────────────
const ALL_TEAMS = [
  // Group A (Host: Mexico)
  { code: 'MEX', name: 'Mexico', group: 'A', rank: 15, conf: 'CONCACAF', odds: -200 },
  { code: 'KOR', name: 'South Korea', group: 'A', rank: 22, conf: 'AFC', odds: 350 },
  { code: 'RSA', name: 'South Africa', group: 'A', rank: 58, conf: 'CAF', odds: 800 },
  { code: 'CZE', name: 'Czechia', group: 'A', rank: 36, conf: 'UEFA', odds: 500 },
  // Group B (Host: Canada)
  { code: 'SUI', name: 'Switzerland', group: 'B', rank: 19, conf: 'UEFA', odds: -110 },
  { code: 'CAN', name: 'Canada', group: 'B', rank: 38, conf: 'CONCACAF', odds: 250 },
  { code: 'QAT', name: 'Qatar', group: 'B', rank: 41, conf: 'AFC', odds: 600 },
  { code: 'BIH', name: 'Bosnia & Herzegovina', group: 'B', rank: 52, conf: 'UEFA', odds: 700 },
  // Group C
  { code: 'BRA', name: 'Brazil', group: 'C', rank: 5, conf: 'CONMEBOL', odds: -300 },
  { code: 'MAR', name: 'Morocco', group: 'C', rank: 14, conf: 'CAF', odds: 400 },
  { code: 'SCO', name: 'Scotland', group: 'C', rank: 42, conf: 'UEFA', odds: 1000 },
  { code: 'HAI', name: 'Haiti', group: 'C', rank: 87, conf: 'CONCACAF', odds: 5000 },
  // Group D (Host: USA)
  { code: 'USA', name: 'United States', group: 'D', rank: 16, conf: 'CONCACAF', odds: -150 },
  { code: 'TUR', name: 'Türkiye', group: 'D', rank: 28, conf: 'UEFA', odds: 300 },
  { code: 'PAR', name: 'Paraguay', group: 'D', rank: 50, conf: 'CONMEBOL', odds: 800 },
  { code: 'AUS', name: 'Australia', group: 'D', rank: 24, conf: 'AFC', odds: 600 },
  // Group E
  { code: 'GER', name: 'Germany', group: 'E', rank: 11, conf: 'UEFA', odds: -250 },
  { code: 'ECU', name: 'Ecuador', group: 'E', rank: 30, conf: 'CONMEBOL', odds: 400 },
  { code: 'CIV', name: 'Ivory Coast', group: 'E', rank: 39, conf: 'CAF', odds: 600 },
  { code: 'CUR', name: 'Curaçao', group: 'E', rank: 109, conf: 'CONCACAF', odds: 8000 },
  // Group F
  { code: 'NED', name: 'Netherlands', group: 'F', rank: 7, conf: 'UEFA', odds: -120 },
  { code: 'JPN', name: 'Japan', group: 'F', rank: 13, conf: 'AFC', odds: 200 },
  { code: 'TUN', name: 'Tunisia', group: 'F', rank: 34, conf: 'CAF', odds: 800 },
  { code: 'SWE', name: 'Sweden', group: 'F', rank: 48, conf: 'UEFA', odds: 900 },
  // Group G
  { code: 'BEL', name: 'Belgium', group: 'G', rank: 6, conf: 'UEFA', odds: -200 },
  { code: 'EGY', name: 'Egypt', group: 'G', rank: 33, conf: 'CAF', odds: 500 },
  { code: 'IRN', name: 'Iran', group: 'G', rank: 20, conf: 'AFC', odds: 400 },
  { code: 'NZL', name: 'New Zealand', group: 'G', rank: 93, conf: 'OFC', odds: 3000 },
  // Group H
  { code: 'ESP', name: 'Spain', group: 'H', rank: 2, conf: 'UEFA', odds: -400 },
  { code: 'URU', name: 'Uruguay', group: 'H', rank: 12, conf: 'CONMEBOL', odds: 300 },
  { code: 'KSA', name: 'Saudi Arabia', group: 'H', rank: 56, conf: 'AFC', odds: 1200 },
  { code: 'CPV', name: 'Cape Verde', group: 'H', rank: 68, conf: 'CAF', odds: 2500 },
  // Group I
  { code: 'FRA', name: 'France', group: 'I', rank: 2, conf: 'UEFA', odds: -500 },
  { code: 'SEN', name: 'Senegal', group: 'I', rank: 21, conf: 'CAF', odds: 500 },
  { code: 'NOR', name: 'Norway', group: 'I', rank: 46, conf: 'UEFA', odds: 800 },
  { code: 'IRQ', name: 'Iraq', group: 'I', rank: 55, conf: 'AFC', odds: 3000 },
  // Group J
  { code: 'ARG', name: 'Argentina', group: 'J', rank: 1, conf: 'CONMEBOL', odds: -600 },
  { code: 'AUT', name: 'Austria', group: 'J', rank: 25, conf: 'UEFA', odds: 600 },
  { code: 'ALG', name: 'Algeria', group: 'J', rank: 31, conf: 'CAF', odds: 800 },
  { code: 'JOR', name: 'Jordan', group: 'J', rank: 62, conf: 'AFC', odds: 5000 },
  // Group K
  { code: 'POR', name: 'Portugal', group: 'K', rank: 4, conf: 'UEFA', odds: -350 },
  { code: 'COL', name: 'Colombia', group: 'K', rank: 10, conf: 'CONMEBOL', odds: 350 },
  { code: 'UZB', name: 'Uzbekistan', group: 'K', rank: 53, conf: 'AFC', odds: 2000 },
  { code: 'COD', name: 'DR Congo', group: 'K', rank: 60, conf: 'CAF', odds: 2500 },
  // Group L
  { code: 'ENG', name: 'England', group: 'L', rank: 8, conf: 'UEFA', odds: -300 },
  { code: 'CRO', name: 'Croatia', group: 'L', rank: 9, conf: 'UEFA', odds: 350 },
  { code: 'GHA', name: 'Ghana', group: 'L', rank: 65, conf: 'CAF', odds: 1500 },
  { code: 'PAN', name: 'Panama', group: 'L', rank: 43, conf: 'CONCACAF', odds: 2500 },
];

// ── ALL 16 VENUES ───────────────────────────────────────────────────────────
const ALL_VENUES = [
  { id: uuid(), name: 'Estadio Azteca', city: 'Mexico City', state: 'CDMX', country: 'MX', capacity: 87523, lat: 19.3029, lng: -99.1505, tz: 'America/Mexico_City' },
  { id: uuid(), name: 'Estadio BBVA', city: 'Monterrey', state: 'NL', country: 'MX', capacity: 53500, lat: 25.6697, lng: -100.2447, tz: 'America/Monterrey' },
  { id: uuid(), name: 'Estadio Akron', city: 'Guadalajara', state: 'JAL', country: 'MX', capacity: 49850, lat: 20.6810, lng: -103.4626, tz: 'America/Mexico_City' },
  { id: uuid(), name: 'BMO Field', city: 'Toronto', state: 'ON', country: 'CA', capacity: 30000, lat: 43.6335, lng: -79.4186, tz: 'America/Toronto' },
  { id: uuid(), name: 'BC Place', city: 'Vancouver', state: 'BC', country: 'CA', capacity: 54500, lat: 49.2768, lng: -123.1118, tz: 'America/Vancouver' },
  { id: 'b02752bd-2063-41d0-a237-81f56ec12bc6', name: 'SoFi Stadium', city: 'Inglewood', state: 'CA', country: 'US', capacity: 70240, lat: 33.9534, lng: -118.339, tz: 'America/Los_Angeles' },
  { id: '7dd26f35-0e0a-445a-a32e-638cf8ef0eb6', name: 'Mercedes-Benz Stadium', city: 'Atlanta', state: 'GA', country: 'US', capacity: 75000, lat: 33.7553, lng: -84.4006, tz: 'America/New_York' },
  { id: '0251d3e3-426a-435f-afd8-53d19d732537', name: 'Lincoln Financial Field', city: 'Philadelphia', state: 'PA', country: 'US', capacity: 69176, lat: 39.9008, lng: -75.1675, tz: 'America/New_York' },
  { id: '0a6936a1-9afb-4b1d-8f04-909884a212bd', name: 'Lumen Field', city: 'Seattle', state: 'WA', country: 'US', capacity: 68740, lat: 47.5952, lng: -122.3316, tz: 'America/Los_Angeles' },
  { id: uuid(), name: 'MetLife Stadium', city: 'East Rutherford', state: 'NJ', country: 'US', capacity: 82500, lat: 40.8128, lng: -74.0742, tz: 'America/New_York' },
  { id: uuid(), name: 'AT&T Stadium', city: 'Arlington', state: 'TX', country: 'US', capacity: 80000, lat: 32.7473, lng: -97.0945, tz: 'America/Chicago' },
  { id: uuid(), name: 'Hard Rock Stadium', city: 'Miami Gardens', state: 'FL', country: 'US', capacity: 64767, lat: 25.9580, lng: -80.2389, tz: 'America/New_York' },
  { id: uuid(), name: 'NRG Stadium', city: 'Houston', state: 'TX', country: 'US', capacity: 72220, lat: 29.6847, lng: -95.4107, tz: 'America/Chicago' },
  { id: uuid(), name: 'Arrowhead Stadium', city: 'Kansas City', state: 'MO', country: 'US', capacity: 76416, lat: 39.0489, lng: -94.4839, tz: 'America/Chicago' },
  { id: uuid(), name: 'Gillette Stadium', city: 'Foxborough', state: 'MA', country: 'US', capacity: 65878, lat: 42.0909, lng: -71.2643, tz: 'America/New_York' },
  { id: uuid(), name: 'Geodis Park', city: 'Nashville', state: 'TN', country: 'US', capacity: 30000, lat: 36.1304, lng: -86.7659, tz: 'America/Chicago' },
];

const VENUE_BY_NAME = new Map(ALL_VENUES.map(v => [v.name, v.id]));

function impliedProb(odds) {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

async function seed() {
  console.log('🏟️  World Cup 2026 Full Seeder (Multi-League Compatible)');
  console.log(`   Project:  ${PROJECT}`);
  console.log(`   Instance: ${INSTANCE}`);
  console.log(`   Database: ${DATABASE}`);
  console.log('');

  // 1. Delete existing data (clean slate)
  console.log('🗑️  Clearing existing data...');
  await db.runTransactionAsync(async txn => {
    await txn.runUpdate({ sql: 'DELETE FROM prediction_prices WHERE TRUE' });
    await txn.runUpdate({ sql: 'DELETE FROM edges WHERE TRUE' });
    await txn.runUpdate({ sql: 'DELETE FROM odds WHERE TRUE' });
    await txn.runUpdate({ sql: 'DELETE FROM matches WHERE TRUE' });
    await txn.runUpdate({ sql: 'DELETE FROM players WHERE TRUE' });
    await txn.runUpdate({ sql: 'DELETE FROM teams WHERE TRUE' });
    await txn.runUpdate({ sql: 'DELETE FROM venues WHERE TRUE' });
    await txn.runUpdate({ sql: 'DELETE FROM leagues WHERE TRUE' });
    await txn.commit();
  });
  console.log('   ✓ Cleared all tables');

  // 2. Insert Leagues Registry Row for World Cup
  console.log('\n🏆 Inserting World Cup league registry...');
  await db.table('leagues').insert({
    league_id: 'WORLD_CUP',
    sport_type: 'soccer',
    display_name: 'FIFA World Cup 2026',
    current_season: '2026',
    created_at: Spanner.COMMIT_TIMESTAMP,
  });
  console.log('   ✓ League WORLD_CUP registered');

  // 3. Insert venues
  console.log(`\n🏟️  Inserting ${ALL_VENUES.length} venues...`);
  const venueRows = ALL_VENUES.map(v => ({
    venue_id: v.id,
    name: v.name,
    city: v.city,
    state: v.state,
    country: v.country,
    capacity: v.capacity,
    latitude: Spanner.numeric(String(v.lat)),
    longitude: Spanner.numeric(String(v.lng)),
    timezone: v.tz,
    created_at: Spanner.COMMIT_TIMESTAMP,
  }));
  
  await db.table('venues').insert(venueRows);
  console.log(`   ✓ ${ALL_VENUES.length} venues inserted`);

  // 4. Insert all 48 teams (under WORLD_CUP league_id)
  console.log(`\n⚽ Inserting ${ALL_TEAMS.length} teams...`);
  const teamRows = ALL_TEAMS.map(t => ({
    league_id: 'WORLD_CUP',
    team_code: t.code,
    name: t.name,
    group_letter: t.group,
    fifa_ranking: t.rank,
    confederation: t.conf,
    flag_emoji: FLAGS[t.code] || '🏳️',
    created_at: Spanner.COMMIT_TIMESTAMP,
  }));

  const seen = new Set();
  const uniqueTeams = teamRows.filter(t => {
    if (seen.has(t.team_code)) return false;
    seen.add(t.team_code);
    return true;
  });

  await db.table('teams').insert(uniqueTeams);
  console.log(`   ✓ ${uniqueTeams.length} teams inserted`);

  // 5. Generate matches for all 12 groups
  console.log('\n📅 Generating match schedule...');
  
  const GROUP_DATES = {
    'A': ['2026-06-11', '2026-06-15', '2026-06-19', '2026-06-19', '2026-06-26', '2026-06-26'],
    'B': ['2026-06-12', '2026-06-16', '2026-06-20', '2026-06-20', '2026-06-26', '2026-06-26'],
    'C': ['2026-06-13', '2026-06-17', '2026-06-21', '2026-06-21', '2026-06-27', '2026-06-27'],
    'D': ['2026-06-13', '2026-06-13', '2026-06-18', '2026-06-18', '2026-06-23', '2026-06-23'],
    'E': ['2026-06-13', '2026-06-17', '2026-06-21', '2026-06-21', '2026-06-27', '2026-06-27'],
    'F': ['2026-06-14', '2026-06-18', '2026-06-22', '2026-06-22', '2026-06-27', '2026-06-27'],
    'G': ['2026-06-14', '2026-06-18', '2026-06-22', '2026-06-22', '2026-06-27', '2026-06-27'],
    'H': ['2026-06-15', '2026-06-19', '2026-06-23', '2026-06-23', '2026-06-26', '2026-06-26'],
    'I': ['2026-06-16', '2026-06-20', '2026-06-24', '2026-06-24', '2026-06-27', '2026-06-27'],
    'J': ['2026-06-16', '2026-06-20', '2026-06-24', '2026-06-24', '2026-06-27', '2026-06-27'],
    'K': ['2026-06-14', '2026-06-18', '2026-06-22', '2026-06-22', '2026-06-27', '2026-06-27'],
    'L': ['2026-06-14', '2026-06-18', '2026-06-22', '2026-06-22', '2026-06-27', '2026-06-27'],
  };

  const GROUP_VENUES = {
    'A': ['Estadio Azteca', 'Estadio BBVA', 'Estadio Akron', 'Estadio Azteca', 'Estadio BBVA', 'Estadio Azteca'],
    'B': ['BC Place', 'BMO Field', 'BC Place', 'BMO Field', 'BC Place', 'BMO Field'],
    'C': ['MetLife Stadium', 'Hard Rock Stadium', 'MetLife Stadium', 'Hard Rock Stadium', 'MetLife Stadium', 'Hard Rock Stadium'],
    'D': ['SoFi Stadium', 'Mercedes-Benz Stadium', 'Mercedes-Benz Stadium', 'SoFi Stadium', 'Lincoln Financial Field', 'SoFi Stadium'],
    'E': ['AT&T Stadium', 'NRG Stadium', 'AT&T Stadium', 'NRG Stadium', 'AT&T Stadium', 'NRG Stadium'],
    'F': ['MetLife Stadium', 'Gillette Stadium', 'MetLife Stadium', 'Gillette Stadium', 'MetLife Stadium', 'Gillette Stadium'],
    'G': ['Hard Rock Stadium', 'NRG Stadium', 'Hard Rock Stadium', 'NRG Stadium', 'Hard Rock Stadium', 'NRG Stadium'],
    'H': ['Arrowhead Stadium', 'Geodis Park', 'Arrowhead Stadium', 'Geodis Park', 'Arrowhead Stadium', 'Geodis Park'],
    'I': ['AT&T Stadium', 'SoFi Stadium', 'AT&T Stadium', 'SoFi Stadium', 'AT&T Stadium', 'SoFi Stadium'],
    'J': ['MetLife Stadium', 'Hard Rock Stadium', 'MetLife Stadium', 'Hard Rock Stadium', 'MetLife Stadium', 'Hard Rock Stadium'],
    'K': ['Lincoln Financial Field', 'Lumen Field', 'Lincoln Financial Field', 'Lumen Field', 'Lincoln Financial Field', 'Lumen Field'],
    'L': ['Gillette Stadium', 'Arrowhead Stadium', 'Gillette Stadium', 'Arrowhead Stadium', 'Gillette Stadium', 'Arrowhead Stadium'],
  };

  const allMatches = [];
  const groups = {};
  for (const t of ALL_TEAMS) {
    if (!groups[t.group]) groups[t.group] = [];
    if (!groups[t.group].find(x => x.code === t.code)) {
      groups[t.group].push(t);
    }
  }

  for (const [groupLetter, teams] of Object.entries(groups)) {
    if (teams.length < 4) continue;

    const dates = GROUP_DATES[groupLetter];
    const venues = GROUP_VENUES[groupLetter];

    const fixtures = [
      [0, 3], [1, 2], // MD1
      [0, 2], [3, 1], // MD2
      [0, 1], [2, 3], // MD3
    ];

    const kickoffTimes = ['01:00:00', '16:00:00', '22:00:00', '01:00:00', '01:00:00', '01:00:00'];

    fixtures.forEach(([h, a], i) => {
      const matchId = uuid();
      const venueId = VENUE_BY_NAME.get(venues[i]) || VENUE_BY_NAME.get('MetLife Stadium');

      allMatches.push({
        league_id: 'WORLD_CUP',
        match_id: matchId,
        group_letter: groupLetter,
        match_number: i + 1,
        home_team_code: teams[h].code,
        away_team_code: teams[a].code,
        venue_id: venueId,
        kickoff: new Date(`${dates[i]}T${kickoffTimes[i]}Z`).toISOString(),
        stage: 'group',
        status: 'scheduled',
        created_at: Spanner.COMMIT_TIMESTAMP,
        updated_at: Spanner.COMMIT_TIMESTAMP,
      });
    });

    console.log(`   ✓ Group ${groupLetter}: ${teams.map(t => t.code).join(', ')} → 6 matches`);
  }

  // 6. Insert matches
  console.log(`\n📅 Inserting ${allMatches.length} matches...`);
  const matchesTable = db.table('matches');
  for (let i = 0; i < allMatches.length; i += 20) {
    const batch = allMatches.slice(i, i + 20);
    await matchesTable.insert(batch);
  }
  console.log(`   ✓ ${allMatches.length} matches inserted`);

  // 7. Insert odds for all teams (championship futures)
  const teamOddsMap = new Map();
  for (const team of ALL_TEAMS) {
    if (!teamOddsMap.has(team.code)) {
      teamOddsMap.set(team.code, team);
    }
  }

  const firstMatchPerGroup = {};
  for (const m of allMatches) {
    if (!firstMatchPerGroup[m.group_letter]) {
      firstMatchPerGroup[m.group_letter] = m.match_id;
    }
  }

  const finalOdds = [];
  for (const [code, team] of teamOddsMap) {
    const matchId = firstMatchPerGroup[team.group];
    if (!matchId || !team.odds) continue;
    finalOdds.push({
      league_id: 'WORLD_CUP',
      match_id: matchId,
      odds_id: uuid(),
      market_type: 'futures_group_winner',
      team_code: code,
      source: 'draftkings',
      american_odds: team.odds,
      implied_probability: Spanner.numeric(impliedProb(team.odds).toFixed(4)),
      fetched_at: new Date().toISOString(),
      created_at: Spanner.COMMIT_TIMESTAMP,
    });
  }

  console.log(`\n💰 Inserting ${finalOdds.length} odds entries...`);
  const oddsTable = db.table('odds');
  for (let i = 0; i < finalOdds.length; i += 20) {
    const batch = finalOdds.slice(i, i + 20);
    await oddsTable.insert(batch);
  }
  console.log(`   ✓ ${finalOdds.length} odds inserted`);

  console.log('\n' + '═'.repeat(60));
  console.log('✅ SEED COMPLETE');
  console.log(`   Teams:   ${uniqueTeams.length}`);
  console.log(`   Venues:  ${ALL_VENUES.length}`);
  console.log(`   Matches: ${allMatches.length}`);
  console.log(`   Odds:    ${finalOdds.length}`);
  console.log('═'.repeat(60));

  await db.close();
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
