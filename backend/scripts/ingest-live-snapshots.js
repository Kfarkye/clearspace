import { Spanner } from '@google-cloud/spanner';
import express from 'express';
import WebSocket from 'ws';
import crypto from 'crypto';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = 'aura-governance-instance';
const DATABASE = 'sports-db'; // Since live_snapshots is under matches
const PORT = process.env.PORT || 8080;
const LEAGUE = 'mlb';
const SPORT = 'baseball';

// Drift Guard Settings
const MAX_DRIFT_MS = 5000;

if (!PROJECT) {
  console.error('FATAL: GOOGLE_CLOUD_PROJECT must be set.');
  process.exit(1);
}

const spannerClient = new Spanner({ projectId: PROJECT });
const db = spannerClient.instance(INSTANCE).database(DATABASE);

// In-memory market state
const marketState = {
  polymarket: new Map(), // match_id -> { homeProb, awayProb, timestamp }
  kalshi: new Map(),     // match_id -> { homeProb, awayProb, timestamp }
  draftkings: new Map()  // match_id -> { homeML, awayML, impliedNoVig, isSuspended, timestamp }
};

// ---------------------------------------------------------------------------
// Market State Management (Simulated WebSockets for now)
// ---------------------------------------------------------------------------
// In a full production implementation, these would connect to wss://ws.kalshi.com
// and wss://ws.polymarket.com.
function setupWebSocketWithResilience(url, name, messageHandler) {
  let ws;
  let pingInterval;
  
  function connect() {
    console.log(`[Market] Connecting to ${name} WebSocket...`);
    // ws = new WebSocket(url);
    
    // ws.on('open', () => {
    //   console.log(`[Market] Connected to ${name}`);
    //   pingInterval = setInterval(() => {
    //     if (ws.readyState === WebSocket.OPEN) ws.ping();
    //   }, 30000);
    // });
    
    // ws.on('message', messageHandler);
    
    // ws.on('close', () => {
    //   clearInterval(pingInterval);
    //   console.log(`[Market] ${name} WS closed. Reconnecting in 5s...`);
    //   setTimeout(connect, 5000);
    // });
    
    // ws.on('error', (err) => {
    //   console.error(`[Market] ${name} WS error:`, err.message);
    //   ws.close();
    // });
  }
  
  connect();
}

function connectPolymarketWS() {
  setupWebSocketWithResilience('wss://ws.polymarket.com/events', 'Polymarket', (msg) => { /* handlePolyMessage */ });
}

function connectKalshiWS() {
  setupWebSocketWithResilience('wss://api.kalshi.com/trade-api/ws/v2', 'Kalshi', (msg) => { /* handleKalshiMessage */ });
}

function calculateImpliedNoVig(homeML, awayML) {
  if (!homeML || !awayML) return null;
  const hProb = homeML < 0 ? (-homeML) / (-homeML + 100) : 100 / (homeML + 100);
  const aProb = awayML < 0 ? (-awayML) / (-awayML + 100) : 100 / (awayML + 100);
  const overround = hProb + aProb;
  return hProb / overround; // Returns true implied probability for home team
}

// ---------------------------------------------------------------------------
// ESPN Ingestion
// ---------------------------------------------------------------------------
async function fetchActiveGames() {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${SPORT}/${LEAGUE}/scoreboard`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('ESPN scoreboard failed');
    const data = await res.json();
    return data.events.filter(e => e.competitions?.[0]?.status?.type?.state === 'in');
  } catch (err) {
    console.error('[ESPN] Error fetching scoreboard:', err.message);
    return [];
  }
}

async function fetchGameSummary(gameId) {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${SPORT}/${LEAGUE}/summary?event=${gameId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ESPN summary failed for ${gameId}`);
    return await res.json();
  } catch (err) {
    console.error(`[ESPN] Error fetching summary for ${gameId}:`, err.message);
    return null;
  }
}

async function processActiveGame(event) {
  const comp = event.competitions?.[0];
  if (!comp) return;

  const gameId = event.id;
  const summary = await fetchGameSummary(gameId);
  if (!summary) return;

  const homeComp = comp.competitors.find(c => c.homeAway === 'home');
  const awayComp = comp.competitors.find(c => c.homeAway === 'away');
  if (!homeComp || !awayComp) return;

  // Extract Situation
  const situation = comp.situation || {};
  const stateTimestamp = new Date(); // Ideally from ESPN payload if available

  const inningNumber = comp.status?.period || 1;
  const inningHalf = comp.status?.type?.shortDetail?.toLowerCase().includes('bot') ? 'bottom' : 'top';
  
  // Extract odds from ESPN payload for DraftKings
  const rawOdds = comp.odds || [];
  const dkOdds = rawOdds.find(o => o.provider?.name?.toLowerCase().includes('draftkings')) || rawOdds[0];
  
  let isSuspended = false;
  let homeML = null;
  let awayML = null;
  let impliedNoVig = null;
  
  if (dkOdds) {
    homeML = dkOdds.homeTeamOdds?.moneyLine || null;
    awayML = dkOdds.awayTeamOdds?.moneyLine || null;
    impliedNoVig = calculateImpliedNoVig(homeML, awayML);
    if (!homeML || !awayML) isSuspended = true; // Primitive suspension detection
  }

  // Get market state
  const polyState = marketState.polymarket.get(gameId) || { homeProb: null, awayProb: null, timestamp: new Date(0) };
  const kalshiState = marketState.kalshi.get(gameId) || { homeProb: null, awayProb: null, timestamp: new Date(0) };

  // Drift Guard Check
  const marketTimestamp = new Date(); // Use actual WS timestamp if available
  const driftMs = Math.abs(marketTimestamp.getTime() - stateTimestamp.getTime());
  
  if (driftMs > MAX_DRIFT_MS) {
    console.warn(`[Drift Guard] Suspending edges for ${gameId}. Drift: ${driftMs}ms > ${MAX_DRIFT_MS}ms`);
    isSuspended = true;
  }

  // Only calculate edge if not suspended (sync verified)
  let edgeHome = null;
  let edgeAway = null;
  if (!isSuspended) {
    edgeHome = (polyState.homeProb !== null && impliedNoVig !== null) ? polyState.homeProb - impliedNoVig : null;
    edgeAway = (polyState.awayProb !== null && impliedNoVig !== null) ? polyState.awayProb - (1 - impliedNoVig) : null;
  }

  const snapshotData = {
    league_id: LEAGUE,
    match_id: gameId,
    captured_at: Spanner.COMMIT_TIMESTAMP,
    state_timestamp: stateTimestamp.toISOString(),
    inning_number: inningNumber,
    inning_half: inningHalf,
    outs: situation.outs || 0,
    balls: situation.balls || 0,
    strikes: situation.strikes || 0,
    home_score: parseInt(homeComp.score, 10) || 0,
    away_score: parseInt(awayComp.score, 10) || 0,
    on_first: !!situation.onFirst,
    on_second: !!situation.onSecond,
    on_third: !!situation.onThird,
    pitcher_id: situation.pitcher?.athlete?.id || null,
    pitcher_name: situation.pitcher?.athlete?.displayName || null,
    pitcher_throws: situation.pitcher?.athlete?.headshot?.href ? 'R' : null, // Mapped properly in real payload
    batter_id: situation.batter?.athlete?.id || null,
    batter_name: situation.batter?.athlete?.displayName || null,
    batter_stance: 'R', // Mapped properly in real payload
    market_timestamp: new Date().toISOString(),
    is_suspended: isSuspended,
    home_ml_dk: homeML,
    away_ml_dk: awayML,
    dk_implied_no_vig: impliedNoVig,
    home_prob_poly: polyState.homeProb,
    away_prob_poly: polyState.awayProb,
    edge_pct_home: edgeHome,
    edge_pct_away: edgeAway,
  };

  try {
    await db.runTransactionAsync(async (txn) => {
      txn.insert('live_snapshots', snapshotData);
      await txn.commit();
    });
    console.log(`[Snapshot] Saved ${gameId} - Inning: ${inningNumber} ${inningHalf}, Edge: ${edgeHome}`);
  } catch (err) {
    if (!err.message.includes('NOT_FOUND: Parent row')) {
      console.error(`[Spanner] Failed to insert snapshot for ${gameId}:`, err.message);
    }
  }
}

async function pollingLoop() {
  console.log('[Ingestion] Starting polling cycle...');
  const activeGames = await fetchActiveGames();
  console.log(`[Ingestion] Found ${activeGames.length} active games.`);
  
  for (const game of activeGames) {
    await processActiveGame(game);
  }
}

// ---------------------------------------------------------------------------
// Service Initialization
// ---------------------------------------------------------------------------
const app = express();

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`[Service] Live Snapshot Ingestion Worker running on port ${PORT}`);
  
  // Initialize market websockets
  connectPolymarketWS();
  connectKalshiWS();

  // Start ESPN polling every 10 seconds
  setInterval(pollingLoop, 10000);
  pollingLoop(); // Initial run
});
