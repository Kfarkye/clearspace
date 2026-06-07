async function fetchJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
}

async function analyze() {
  const eventId = '401815656';
  const pitcherId = '40917'; // Griffin Canning
  const batterId = '38904'; // Pete Alonso
  const teamId = '25'; // Padres

  // 1. Season Stats - Pitcher
  console.log("=== PITCHER SEASON STATS ===");
  const pitcherStats = await fetchJson(`http://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2026/types/2/athletes/${pitcherId}/statistics/0?lang=en&region=us`);
  if (pitcherStats?.splits?.categories) {
    pitcherStats.splits.categories.forEach(cat => {
      console.log(`\nCategory: ${cat.name}`);
      cat.stats.forEach(s => {
        console.log(`Key: ${s.name} | Display: ${s.displayName} | Abbr: ${s.abbreviation} | Val: ${s.value} | Desc: ${s.description}`);
      });
    });
  }

  // 2. Season Stats - Batter
  console.log("\n=== BATTER SEASON STATS ===");
  const batterStats = await fetchJson(`http://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2026/types/2/athletes/${batterId}/statistics/0?lang=en&region=us`);
  if (batterStats?.splits?.categories) {
    batterStats.splits.categories.forEach(cat => {
      console.log(`\nCategory: ${cat.name}`);
      cat.stats.forEach(s => {
        console.log(`Key: ${s.name} | Display: ${s.displayName} | Abbr: ${s.abbreviation} | Val: ${s.value} | Desc: ${s.description}`);
      });
    });
  }

  // 3. Team Stats
  console.log("\n=== TEAM STATS ===");
  const teamStats = await fetchJson(`http://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2026/types/2/teams/${teamId}/statistics/0?lang=en&region=us`);
  if (teamStats?.splits?.categories) {
    teamStats.splits.categories.forEach(cat => {
      console.log(`\nCategory: ${cat.name}`);
      cat.stats.forEach(s => {
        console.log(`Key: ${s.name} | Display: ${s.displayName} | Abbr: ${s.abbreviation} | Val: ${s.value} | Desc: ${s.description}`);
      });
    });
  }

  // 4. Boxscore (Live Game) Stats
  console.log("\n=== BOXSCORE STATS ===");
  const summary = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${eventId}`);
  if (summary?.boxscore?.players) {
    summary.boxscore.players[0].statistics.forEach(statBlock => {
      console.log(`\nBoxscore Type: ${statBlock.type}`);
      console.log(`Keys: ${statBlock.keys.join(', ')}`);
      console.log(`Labels: ${statBlock.labels.join(', ')}`);
      console.log(`Descriptions: ${statBlock.descriptions.join(', ')}`);
    });
  }
}

analyze().catch(console.error);
