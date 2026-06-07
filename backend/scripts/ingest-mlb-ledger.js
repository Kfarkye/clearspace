import { Spanner } from '@google-cloud/spanner';
import fetch from 'node-fetch';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const instanceId = process.env.SPANNER_INSTANCE || 'clearspace';
const databaseId = process.env.SPANNER_DATABASE || 'clearspace-db';

const spanner = new Spanner({ projectId });
const instance = spanner.instance(instanceId);
const database = instance.database(databaseId);

async function resolveRef(url, timeout = 5000) {
  if (!url) return null;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    clearTimeout(id);
    return null;
  }
}

function stringifySafe(obj) {
  if (!obj) return null;
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'number') {
      // Avoid Spanner round-trip error for floats
      if (!Number.isInteger(value)) {
         return Number(value.toFixed(4));
      }
    }
    return value;
  });
}

export async function ingestMlbEvent(eventId, mode = 'live') {
  console.log(`[Ingest] Starting ingestion for event: ${eventId} in mode: ${mode}`);
  const eventUrl = `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/${eventId}?lang=en&region=us`;
  const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${eventId}`;
  
  const [eventData, summaryData] = await Promise.all([
    resolveRef(eventUrl),
    resolveRef(summaryUrl)
  ]);

  if (!eventData || !eventData.competitions || eventData.competitions.length === 0) {
    throw new Error('Event or competition not found');
  }

  const compObj = eventData.competitions[0];
  const compUrl = compObj.$ref || `http://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/${eventId}/competitions/${eventId}?lang=en&region=us`;
  const compData = await resolveRef(compUrl);

  const fetchedAt = new Date().toISOString();
  // Extract dates and season
  const startTimeStrRaw = compData.date || eventData.date || new Date().toISOString();
  const startTimeObj = new Date(startTimeStrRaw);
  const gameDateStr = startTimeObj.toISOString().substring(0, 10);
  const seasonYear = eventData.season?.year || summaryData?.header?.season?.year || new Date().getFullYear();

  // Prepare MlbGames
  const mlbGamesRow = {
    EventId: eventId,
    CompetitionId: compData.id,
    Venue: compData.venue?.fullName || 'Unknown',
    Status: compData.status?.type?.description || eventData.status?.type?.description || 'Unknown',
    GameDate: gameDateStr,
    StartTime: startTimeObj,
    Season: parseInt(seasonYear, 10),
    FetchedAt: 'spanner.commit_timestamp()'
  };

  if (summaryData?.boxscore?.teams) {
    for (const t of summaryData.boxscore.teams) {
      if (t.homeAway === 'home') {
        mlbGamesRow.HomeTeamId = t.team.id;
        mlbGamesRow.HomeTeamName = t.team.displayName;
        mlbGamesRow.HomeTeamAbbr = t.team.abbreviation;
      } else {
        mlbGamesRow.AwayTeamId = t.team.id;
        mlbGamesRow.AwayTeamName = t.team.displayName;
        mlbGamesRow.AwayTeamAbbr = t.team.abbreviation;
      }
    }
  }

  if (summaryData?.header?.competitions?.[0]?.competitors) {
    for (const c of summaryData.header.competitions[0].competitors) {
      if (c.homeAway === 'home') mlbGamesRow.HomeScore = parseInt(c.score || '0', 10);
      else mlbGamesRow.AwayScore = parseInt(c.score || '0', 10);
    }
  }

  if (summaryData?.situation) {
    mlbGamesRow.CurrentInning = summaryData.situation.lastPlay?.period?.displayValue || null;
    mlbGamesRow.SituationBalls = summaryData.situation.balls || 0;
    mlbGamesRow.SituationStrikes = summaryData.situation.strikes || 0;
    mlbGamesRow.SituationOuts = summaryData.situation.outs || 0;
    mlbGamesRow.CurrentPitcherId = summaryData.situation.pitcher?.playerId?.toString() || null;
    mlbGamesRow.CurrentBatterId = summaryData.situation.batter?.playerId?.toString() || null;
    mlbGamesRow.LastPlayId = summaryData.situation.lastPlay?.id || null;
    
    const runners = [];
    if (summaryData.situation.onFirst) runners.push('1st');
    if (summaryData.situation.onSecond) runners.push('2nd');
    if (summaryData.situation.onThird) runners.push('3rd');
      SituationRunnersOnBase: stringifySafe(runners)
  }

  mlbGamesRow.RawJson = JSON.stringify(compData);

  const rowsByTable = {
    MlbGames: [mlbGamesRow],
    MlbSourceReceipts: [],
    MlbPlayByPlay: [],
    MlbWinProbability: [],
    MlbBoxscorePitching: [],
    MlbBoxscoreBatting: [],
    MlbOddsHistory: [],
    MlbInjuries: [],
    MlbAthleteSeasonStats: [],
    MlbGameConditions: [],
    MlbGameStandings: [],
    MlbSeasonSeries: []
  };

  // Helper to add row and strip undefined
  const addRow = (table, row) => {
    Object.keys(row).forEach(k => row[k] === undefined && delete row[k]);
    rowsByTable[table].push(row);
  };

  // Receipts
  addRow('MlbSourceReceipts', {
    EventId: eventId,
    ReceiptId: 'core-event',
    Url: eventUrl,
    RawJson: stringifySafe(eventData),
    FetchedAt: 'spanner.commit_timestamp()'
  });
  addRow('MlbSourceReceipts', {
    EventId: eventId,
    ReceiptId: 'core-comp',
    Url: compUrl,
    RawJson: stringifySafe(compData),
    FetchedAt: 'spanner.commit_timestamp()'
  });
  if (summaryData) {
    addRow('MlbSourceReceipts', {
      EventId: eventId,
      ReceiptId: 'site-summary',
      Url: summaryUrl,
      RawJson: stringifySafe(summaryData),
      FetchedAt: 'spanner.commit_timestamp()'
    });
    
    // Conditions
    const weather = summaryData.gameInfo?.weather || {};
    const venueInfo = summaryData.gameInfo?.venue || {};
    let coreVenue = {};
    if (venueInfo.id) {
      try {
        coreVenue = await resolveRef(`http://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/venues/${venueInfo.id}?lang=en&region=us`);
      } catch (e) {}
    }
    
    addRow('MlbGameConditions', {
      EventId: eventId,
      Venue: venueInfo.fullName || coreVenue?.fullName || compData.venue?.fullName || 'Unknown',
      City: venueInfo.address?.city || coreVenue?.address?.city,
      State: venueInfo.address?.state || coreVenue?.address?.state,
      Temperature: weather.temperature,
      Condition: weather.conditionId,
      WindSpeed: weather.gust,
      WindDirection: weather.windDirection, // Not in API payload but as placeholder
      Humidity: weather.humidity,
      Precipitation: weather.precipitation,
      RoofType: coreVenue?.indoor ? 'Indoor' : 'Outdoor',
      Surface: coreVenue?.grass ? 'Grass' : (coreVenue?.grass === false ? 'Artificial' : null),
      RawJson: stringifySafe({ summaryWeather: weather, venue: venueInfo, coreVenue }),
      FetchedAt: 'spanner.commit_timestamp()'
    });

    // Standings
    if (summaryData.standings && summaryData.standings.groups && summaryData.standings.groups[0] && summaryData.standings.groups[0].standings && summaryData.standings.groups[0].standings.entries) {
      summaryData.standings.groups[0].standings.entries.forEach(entry => {
        let wins, losses, winPct, gamesBehind, streak;
        entry.stats.forEach(s => {
          if (s.name === 'wins') wins = s.value;
          if (s.name === 'losses') losses = s.value;
          if (s.name === 'winPercent') winPct = s.value;
          if (s.name === 'gamesBehind') gamesBehind = s.value;
          if (s.name === 'streak') streak = s.displayValue;
        });
        
        addRow('MlbGameStandings', {
          EventId: eventId,
          TeamId: entry.id,
          TeamName: entry.team,
          TeamAbbr: entry.abbreviation,
          LeagueRank: entry.leagueWinPercentRank,
          DivisionRank: entry.playoffSeed, // Approximation if division rank isn't explicit
          Wins: wins,
          Losses: losses,
          WinPct: winPct ? Spanner.float(winPct) : null,
          GamesBack: gamesBehind ? Spanner.float(gamesBehind) : null,
          Streak: streak,
          RawJson: stringifySafe(entry),
          FetchedAt: 'spanner.commit_timestamp()'
        });
      });
    }

    // Season Series
    if (summaryData.seasonseries && summaryData.seasonseries.length > 0) {
      summaryData.seasonseries.forEach((series, idx) => {
        addRow('MlbSeasonSeries', {
          EventId: eventId,
          SeriesId: series.id || ('series-' + idx),
          HomeTeamId: null, // Hard to extract without deep dive
          AwayTeamId: null,
          Summary: series.summary || series.description,
          HomeWins: null,
          AwayWins: null,
          GamesPlayed: series.events ? series.events.filter(e => e.status === 'post').length : null,
          GamesRemaining: series.events ? series.events.filter(e => e.status === 'pre').length : null,
          PreviousGamesJson: series.events ? stringifySafe(series.events) : null,
          RawJson: stringifySafe(series),
          FetchedAt: 'spanner.commit_timestamp()'
        });
      });
    }
  }

  // Play By Play
  if (summaryData?.plays) {
    for (const p of summaryData.plays) {
      addRow('MlbPlayByPlay', {
        EventId: eventId,
        PlayId: p.id || String(Date.now() + Math.random()),
        Period: p.period?.displayValue || p.period?.number?.toString(),
        PlayText: p.text || p.type?.text,
        HomeScore: p.homeScore || 0,
        AwayScore: p.awayScore || 0,
        Wallclock: p.wallclock ? new Date(p.wallclock) : null,
        RawJson: stringifySafe(p),
        FetchedAt: 'spanner.commit_timestamp()'
      });
    }
  }

  // Win Probability
  if (summaryData?.winprobability && Array.isArray(summaryData.winprobability)) {
    // DO NOT SORT BY STRING PLAYID.
    // ESPN winprobability array is chronological. We process in the exact order provided.
    const sortedPlays = summaryData.winprobability;

    let previousHomeWP = 0.5; // Baseline start state (50%)

    for (const item of sortedPlays) {
      const playId = item.playId;
      const currentHomeWP = item.homeWinPercentage || 0;
      const swing = Math.abs(currentHomeWP - previousHomeWP);
      
      // Find play description from summary if available
      let playDescription = '';
      if (summaryData?.plays && playId) {
        const matchingPlay = summaryData.plays.find(p => String(p.id) === String(playId));
        if (matchingPlay) {
          playDescription = matchingPlay.text || matchingPlay.type?.text || '';
        }
      }

      addRow('MlbWinProbability', {
        EventId: eventId,
        PlayId: String(playId || Date.now() + Math.random()),
        HomeWinPercentage: Spanner.float(currentHomeWP),
        AwayWinPercentage: Spanner.float(item.awayWinPercentage || 0),
        TiePercentage: Spanner.float(item.tiePercentage || 0),
        ProbabilitySwing: Spanner.float(parseFloat(swing.toFixed(4))),
        PlayDescription: playDescription,
        RawJson: stringifySafe(item),
        FetchedAt: 'spanner.commit_timestamp()'
      });

      previousHomeWP = currentHomeWP;
    }
  }

  // Boxscore Pitching / Batting
  if (summaryData?.boxscore?.players) {
    for (const teamTeam of summaryData.boxscore.players) {
      const teamId = teamTeam.team?.id;
      for (const statBlock of teamTeam.statistics || []) {
        const isPitching = statBlock.type === 'pitching';
        const isBatting = statBlock.type === 'batting';
        if (!isPitching && !isBatting) continue;

        for (const ath of statBlock.athletes || []) {
          const stats = ath.stats || [];
          const athId = ath.athlete?.id;
          if (!athId) continue;
          
          if (isPitching) {
            // [IP, H, R, ER, BB, K, HR, PC-ST, ERA, PC]
            addRow('MlbBoxscorePitching', {
              EventId: eventId,
              AthleteId: athId,
              TeamId: teamId,
              Name: ath.athlete?.displayName,
              Starter: !!ath.starter,
              InningsPitched: stats[0] || '0',
              Hits: parseInt(stats[1] || '0', 10),
              Runs: parseInt(stats[2] || '0', 10),
              EarnedRuns: parseInt(stats[3] || '0', 10),
              Walks: parseInt(stats[4] || '0', 10),
              Strikeouts: parseInt(stats[5] || '0', 10),
              PitchCount: stats[9] || '0',
              RawJson: stringifySafe(ath),
              FetchedAt: 'spanner.commit_timestamp()'
            });
          } else if (isBatting) {
            // [AB, R, H, RBI, BB, K, LOB, AVG, OBP, SLG] typically but format changes. We'll map standard ones.
            addRow('MlbBoxscoreBatting', {
              EventId: eventId,
              AthleteId: athId,
              TeamId: teamId,
              Name: ath.athlete?.displayName,
              Starter: !!ath.starter,
              AtBats: parseInt(stats[0] || '0', 10),
              Runs: parseInt(stats[1] || '0', 10),
              Hits: parseInt(stats[2] || '0', 10),
              RBIs: parseInt(stats[3] || '0', 10),
              HomeRuns: 0, // In raw JSON, this requires reading the notes or deeper play log
              Walks: parseInt(stats[4] || '0', 10),
              Strikeouts: parseInt(stats[5] || '0', 10),
              StolenBases: 0,
              RawJson: stringifySafe(ath),
              FetchedAt: 'spanner.commit_timestamp()'
            });
          }
        }
      }
    }
  }

  // Injuries
  if (summaryData?.injuries) {
    for (const teamInj of summaryData.injuries) {
      const teamId = teamInj.team?.id;
      for (const inj of teamInj.injuries || []) {
        const athId = inj.athlete?.id;
        if (!athId) continue;
        addRow('MlbInjuries', {
          EventId: eventId,
          AthleteId: athId,
          TeamId: teamId,
          Name: inj.athlete?.displayName,
          Status: inj.status,
          Notes: inj.details || inj.shortComment,
          RawJson: stringifySafe(inj),
          FetchedAt: 'spanner.commit_timestamp()'
        });
      }
    }
  }

  // Odds
  if (compData.odds && compData.odds.$ref) {
    const oddsData = await resolveRef(compData.odds.$ref);
    if (oddsData?.items) {
      const fetchTimestamp = Date.now();
      for (const item of oddsData.items) {
        const provider = item.provider?.name || 'Unknown';
        
        // Sometimes it requires resolving the item itself if it has $ref
        const oddObj = item.$ref ? await resolveRef(item.$ref) : item;
        if (!oddObj) continue;

        const types = [];
        if (oddObj.open) types.push('open');
        if (oddObj.current) types.push('current');
        if (oddObj.close) types.push('close');

        // If no types are found, we could default to 'current' or something, but usually they exist.
        if (types.length === 0) types.push('current');

        for (const snapshotType of types) {
          const snapshotId = mode === 'backfill' 
            ? `${eventId}_${provider}_${snapshotType}`
            : `${eventId}_${provider}_${fetchTimestamp}`;

          const data = oddObj[snapshotType] || {};
          const homeOdds = oddObj.homeTeamOdds?.[snapshotType] || {};
          const awayOdds = oddObj.awayTeamOdds?.[snapshotType] || {};

          const overUnder = data.total?.alternateDisplayValue;
          const spread = homeOdds.pointSpread?.alternateDisplayValue;
          const homeML = homeOdds.moneyLine?.american;
          const awayML = awayOdds.moneyLine?.american;

          addRow('MlbOddsHistory', {
            EventId: String(eventId),
            SnapshotId: String(snapshotId),
            Provider: String(provider),
            SnapshotType: String(mode === 'backfill' ? snapshotType : 'live'),
            OverUnder: overUnder ? Spanner.float(parseFloat(overUnder)) : null,
            Spread: spread ? Spanner.float(parseFloat(spread)) : null,
            HomeMoneyLine: homeML ? Spanner.float(parseFloat(homeML)) : null,
            AwayMoneyLine: awayML ? Spanner.float(parseFloat(awayML)) : null,
            FetchedAt: 'spanner.commit_timestamp()'
          });
        }
      }
    }
  }

  // Pitcher Season Stats
  if (compData.competitors) {
    for (const cRef of compData.competitors) {
      if (!cRef.$ref) continue;
      const c = await resolveRef(cRef.$ref);
      if (!c || !c.probables) continue;
      
      for (const p of c.probables) {
        if (!p.athlete?.$ref) continue;
        const athData = await resolveRef(p.athlete.$ref);
        if (!athData || !athData.id) continue;
        
        const statRef = `http://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2026/types/2/athletes/${athData.id}/statistics/0?lang=en&region=us`;
        const statsData = await resolveRef(statRef);
        if (statsData) {
          addRow('MlbAthleteSeasonStats', {
            EventId: eventId,
            AthleteId: athData.id,
            Type: 'pitching',
            RawJson: stringifySafe(statsData),
            FetchedAt: 'spanner.commit_timestamp()'
          });
        }
      }
    }
  }

  const rowCount = Object.values(rowsByTable).reduce((acc, rows) => acc + rows.length, 0);
  console.log(`[Ingest] Writing ${rowCount} rows across ${Object.keys(rowsByTable).length} tables to Spanner...`);

  await database.runTransactionAsync(async (transaction) => {
    for (const [table, rows] of Object.entries(rowsByTable)) {
      if (rows.length > 0) {
        for (const row of rows) {
          if (!row.EventId && table !== 'MlbFantasyPlayerSnapshot') {
            console.error(`Row in ${table} missing EventId:`, row);
          }
          if (table === 'MlbOddsHistory' && !row.SnapshotId) {
            console.error(`Row in ${table} missing SnapshotId:`, row);
          }
        }
        transaction.upsert(table, rows);
      }
    }
    await transaction.commit();
  });
  console.log(`[Ingest] Successfully ingested event: ${eventId}`);
}

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const eventId = process.argv[2] || '401815656';
  const mode = process.argv[3] || 'live';
  ingestMlbEvent(eventId, mode).catch(err => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });
}
