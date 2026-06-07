import fetch from 'node-fetch';

async function run() {
  for (let m = 9; m <= 10; m++) {
    const month = m.toString().padStart(2, '0');
    for (let d = 1; d <= 31; d++) {
      if (m === 9 && d < 15) continue; // Skip early Sept
      if (m === 10 && d > 5) break;    // Stop early Oct
      const dateStr = `2026${month}${d.toString().padStart(2, '0')}`;
      try {
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`);
        const data = await res.json();
        const numEvents = data.events?.length || 0;
        if (numEvents > 0) {
          console.log(`${dateStr}: ${numEvents} games`);
        }
      } catch (e) {
        console.log(`Error on ${dateStr}`);
      }
    }
  }
}

run();
