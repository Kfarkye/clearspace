// source module: thedrip-team-profiles.ts
// Fetches team profiles, qualifying stats, history, and futures from TheDrip.to

export interface RawTeamProfile {
  team_code: string;
  slug: string;
  markdown: string;
  fetched_at: string;
}

const TEAM_SLUGS: Record<string, string> = {
  ALG: 'algeria', ARG: 'argentina', AUS: 'australia', AUT: 'austria',
  BEL: 'belgium', BIH: 'bosnia-herz', BRA: 'brazil', CAN: 'canada',
  CPV: 'cape-verde', COL: 'colombia', CRO: 'croatia', CUR: 'curacao',
  CZE: 'czechia', COD: 'dr-congo', ECU: 'ecuador', EGY: 'egypt',
  ENG: 'england', FRA: 'france', GER: 'germany', GHA: 'ghana',
  HAI: 'haiti', IRN: 'iran', IRQ: 'iraq', CIV: 'ivory-coast',
  JPN: 'japan', JOR: 'jordan', MEX: 'mexico', MAR: 'morocco',
  NED: 'netherlands', NZL: 'new-zealand', NOR: 'norway', PAN: 'panama',
  PAR: 'paraguay', POR: 'portugal', QAT: 'qatar', KSA: 'saudi-arabia',
  SCO: 'scotland', SEN: 'senegal', RSA: 'south-africa', KOR: 'south-korea',
  ESP: 'spain', SWE: 'sweden', SUI: 'switzerland', TUN: 'tunisia',
  TUR: 'turkiye', USA: 'united-states', URU: 'uruguay', UZB: 'uzbekistan'
};

// Mock data generator for quick test runs
function getMockMarkdown(code: string, slug: string): string {
  const managers: Record<string, string> = {
    USA: 'Mauricio Pochettino',
    BRA: 'Dorival Júnior',
    MEX: 'Javier Aguirre',
    ENG: 'Thomas Tuchel',
    FRA: 'Didier Deschamps',
    ARG: 'Lionel Scaloni',
    GHA: 'Otto Addo',
  };

  const manager = managers[code] || 'Head Coach';

  return `
# World Cup Profile: ${slug.toUpperCase()}
Coach: ${manager}

### Qualification Record
5-1-2 Record
18 Goals For
6 Goals Against
65.4% Possession
Qualified through CONMEBOL with **2nd place finish**.

### Tournament History
| Year | Result | GP | W | D | L | GF-GA |
| 2022 | Quarter-Finals | 5 | 3 | 1 | 1 | 8-3 |
| 2018 | Champions | 7 | 6 | 1 | 0 | 14-6 |
27
Matches
15-7-5
W-D-L
47-27
GF-GA
54.9%
Avg Possession

### Group Stage Odds
-400
80.0%
DK -400 MGM -380 FD -420

### Outright Winner Odds
DraftKings
+450
18.2%
BetMGM
+450
18.2%
FanDuel
+420
19.2%

### Team Logo URL
https://a.espncdn.com/i/teamlogos/countries/500/${slug.substring(0, 3)}.png

### Match Schedule
Group Stage matches:
Monday, June 15
SoFi Stadium, Los Angeles
08:00 PM ET
  `;
}

export async function fetchRawData(limitToRealScrapeCodes: string[] = []): Promise<string> {
  const profiles: RawTeamProfile[] = [];
  const entries = Object.entries(TEAM_SLUGS);

  for (const [code, slug] of entries) {
    const shouldScrapeReal = limitToRealScrapeCodes.includes(code);

    if (shouldScrapeReal) {
      try {
        console.log(`  [Scrape] Fetching real data for ${code} (${slug})...`);
        const url = `https://r.jina.ai/https://thedrip.to/teams/${slug}/`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const markdown = await res.text();
        profiles.push({
          team_code: code,
          slug,
          markdown,
          fetched_at: new Date().toISOString(),
        });
      } catch (err: any) {
        console.warn(`  [Scrape WARNING] Failed real scrape for ${code}: ${err.message}. Falling back to mock.`);
        profiles.push({
          team_code: code,
          slug,
          markdown: getMockMarkdown(code, slug),
          fetched_at: new Date().toISOString(),
        });
      }
    } else {
      // Use mock generator for speed and stability in development
      profiles.push({
        team_code: code,
        slug,
        markdown: getMockMarkdown(code, slug),
        fetched_at: new Date().toISOString(),
      });
    }

    // Small delay if we did a real fetch to be polite
    if (shouldScrapeReal) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return JSON.stringify({
    source: 'TheDrip.to scraped profiles via Jina Reader',
    fetched_at: new Date().toISOString(),
    profiles,
  });
}
