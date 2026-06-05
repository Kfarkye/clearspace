// parser module: parse-odds.ts
import { Odds } from '../schemas/odds.schema.js';

interface RawFuturesOdds {
  team_code: string;
  group_winner_dk: number;
  outright_winner_dk: number;
  outright_winner_fd: number;
  outright_winner_mgm: number;
}

function calculateImpliedProbability(odds: number): number {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

export function parseOdds(rawJson: string): Odds[] {
  const parsed = JSON.parse(rawJson);
  const rawFutures: RawFuturesOdds[] = parsed.futures || [];
  const fetchedAt = parsed.fetched_at || new Date().toISOString();

  const oddsList: Odds[] = [];

  const GROUP_MAP: Record<string, string> = {
    MEX: 'A', KOR: 'A', RSA: 'A', CZE: 'A',
    SUI: 'B', CAN: 'B', QAT: 'B', BIH: 'B',
    BRA: 'C', MAR: 'C', SCO: 'C', HAI: 'C',
    USA: 'D', TUR: 'D', PAR: 'D', AUS: 'D',
    GER: 'E', ECU: 'E', CIV: 'E', CUR: 'E',
    NED: 'F', JPN: 'F', TUN: 'F', SWE: 'F',
    BEL: 'G', EGY: 'G', IRN: 'G', NZL: 'G',
    ESP: 'H', URU: 'H', KSA: 'H', CPV: 'H',
    FRA: 'I', SEN: 'I', NOR: 'I', IRQ: 'I',
    ARG: 'J', AUT: 'J', ALG: 'J', JOR: 'J',
    POR: 'K', COL: 'K', UZB: 'K', COD: 'K',
    ENG: 'L', CRO: 'L', GHA: 'L', PAN: 'L',
  };

  const FIRST_MATCH_BY_GROUP: Record<string, string> = {
    A: 'match-2026-no-1',
    B: 'match-2026-no-7',
    C: 'match-2026-no-13',
    D: 'match-2026-no-19',
    E: 'match-2026-no-25',
    F: 'match-2026-no-31',
    G: 'match-2026-no-37',
    H: 'match-2026-no-43',
    I: 'match-2026-no-49',
    J: 'match-2026-no-55',
    K: 'match-2026-no-61',
    L: 'match-2026-no-67',
  };

  rawFutures.forEach(f => {
    const group = GROUP_MAP[f.team_code] || 'A';
    const firstMatchId = FIRST_MATCH_BY_GROUP[group] || 'match-2026-no-1';

    // 1. Group Winner (DraftKings)
    const gwDkProb = calculateImpliedProbability(f.group_winner_dk);
    oddsList.push({
      match_id: firstMatchId,
      odds_id: `odds-gw-dk-${f.team_code}`,
      market_type: 'futures_group_winner',
      team_code: f.team_code,
      source: 'draftkings',
      american_odds: f.group_winner_dk,
      implied_probability: gwDkProb,
      fetched_at: fetchedAt,
    });

    // 2. Outright Winner (DraftKings)
    const owDkProb = calculateImpliedProbability(f.outright_winner_dk);
    oddsList.push({
      match_id: 'match-2026-no-104', // Map outrights to the Final Match
      odds_id: `odds-ow-dk-${f.team_code}`,
      market_type: 'outright_winner',
      team_code: f.team_code,
      source: 'draftkings',
      american_odds: f.outright_winner_dk,
      implied_probability: owDkProb,
      fetched_at: fetchedAt,
    });

    // 3. Outright Winner (FanDuel)
    const owFdProb = calculateImpliedProbability(f.outright_winner_fd);
    oddsList.push({
      match_id: 'match-2026-no-104',
      odds_id: `odds-ow-fd-${f.team_code}`,
      market_type: 'outright_winner',
      team_code: f.team_code,
      source: 'fanduel',
      american_odds: f.outright_winner_fd,
      implied_probability: owFdProb,
      fetched_at: fetchedAt,
    });

    // 4. Outright Winner (BetMGM)
    const owMgmProb = calculateImpliedProbability(f.outright_winner_mgm);
    oddsList.push({
      match_id: 'match-2026-no-104',
      odds_id: `odds-ow-mgm-${f.team_code}`,
      market_type: 'outright_winner',
      team_code: f.team_code,
      source: 'betmgm',
      american_odds: f.outright_winner_mgm,
      implied_probability: owMgmProb,
      fetched_at: fetchedAt,
    });
  });

  return oddsList;
}
