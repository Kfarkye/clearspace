// source module: espn-team-logos.ts
// Maps and retrieves team logo URLs from ESPN CDN

export interface RawLogoMapping {
  team_code: string;
  logo_url: string;
}

export async function fetchRawData(): Promise<string> {
  const mappings: RawLogoMapping[] = [
    { team_code: 'USA', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/usa.png' },
    { team_code: 'MEX', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/mex.png' },
    { team_code: 'CAN', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/can.png' },
    { team_code: 'BRA', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/bra.png' },
    { team_code: 'ARG', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/arg.png' },
    { team_code: 'ENG', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/eng.png' },
    { team_code: 'FRA', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/fra.png' },
    { team_code: 'GER', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/ger.png' },
    { team_code: 'ESP', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/esp.png' },
    { team_code: 'POR', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/por.png' },
    { team_code: 'ITA', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/ita.png' },
    { team_code: 'NED', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/ned.png' },
    { team_code: 'BEL', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/bel.png' },
    { team_code: 'CRO', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/cro.png' },
    { team_code: 'URU', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/uru.png' },
    { team_code: 'COL', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/col.png' },
    { team_code: 'SEN', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/sen.png' },
    { team_code: 'MAR', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/mar.png' },
    { team_code: 'JPN', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/jpn.png' },
    { team_code: 'KOR', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/kor.png' },
    { team_code: 'AUS', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/aus.png' },
    { team_code: 'ECU', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/ecu.png' },
    { team_code: 'SUI', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/sui.png' },
    { team_code: 'CZE', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/cze.png' },
    { team_code: 'RSA', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/rsa.png' },
    { team_code: 'QAT', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/qat.png' },
    { team_code: 'BIH', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/bih.png' },
    { team_code: 'SCO', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/sco.png' },
    { team_code: 'HAI', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/hai.png' },
    { team_code: 'TUR', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/tur.png' },
    { team_code: 'PAR', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/par.png' },
    { team_code: 'CIV', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/civ.png' },
    { team_code: 'CUR', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/cur.png' },
    { team_code: 'TUN', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/tun.png' },
    { team_code: 'SWE', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/swe.png' },
    { team_code: 'EGY', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/egy.png' },
    { team_code: 'IRN', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/irn.png' },
    { team_code: 'NZL', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/nzl.png' },
    { team_code: 'KSA', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/ksa.png' },
    { team_code: 'CPV', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/cpv.png' },
    { team_code: 'NOR', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/nor.png' },
    { team_code: 'IRQ', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/irq.png' },
    { team_code: 'AUT', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/aut.png' },
    { team_code: 'ALG', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/alg.png' },
    { team_code: 'JOR', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/jor.png' },
    { team_code: 'UZB', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/uzb.png' },
    { team_code: 'COD', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/cod.png' },
    { team_code: 'GHA', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/gha.png' },
    { team_code: 'PAN', logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/pan.png' },
  ];

  return JSON.stringify({
    source: 'ESPN CDN Logo Mapping',
    fetched_at: new Date().toISOString(),
    mappings,
  });
}
