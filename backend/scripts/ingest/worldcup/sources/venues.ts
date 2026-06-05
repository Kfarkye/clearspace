// source module: venues.ts
// Returns raw canonical venue data (stadium facts, capacities, locations)

export interface RawVenue {
  name: string;
  city: string;
  state: string;
  country: string;
  capacity: number;
  latitude: number;
  longitude: number;
  timezone: string;
}

export async function fetchRawData(): Promise<string> {
  const venues: RawVenue[] = [
    { name: 'Estadio Azteca', city: 'Mexico City', state: 'CDMX', country: 'MX', capacity: 87523, latitude: 19.3029, longitude: -99.1505, timezone: 'America/Mexico_City' },
    { name: 'Estadio BBVA', city: 'Monterrey', state: 'NL', country: 'MX', capacity: 53500, latitude: 25.6697, longitude: -100.2447, timezone: 'America/Monterrey' },
    { name: 'Estadio Akron', city: 'Guadalajara', state: 'JAL', country: 'MX', capacity: 49850, latitude: 20.6810, longitude: -103.4626, timezone: 'America/Mexico_City' },
    { name: 'BMO Field', city: 'Toronto', state: 'ON', country: 'CA', capacity: 30000, latitude: 43.6335, longitude: -79.4186, timezone: 'America/Toronto' },
    { name: 'BC Place', city: 'Vancouver', state: 'BC', country: 'CA', capacity: 54500, latitude: 49.2768, longitude: -123.1118, timezone: 'America/Vancouver' },
    { name: 'SoFi Stadium', city: 'Inglewood', state: 'CA', country: 'US', capacity: 70240, latitude: 33.9534, longitude: -118.339, timezone: 'America/Los_Angeles' },
    { name: 'Mercedes-Benz Stadium', city: 'Atlanta', state: 'GA', country: 'US', capacity: 75000, latitude: 33.7553, longitude: -84.4006, timezone: 'America/New_York' },
    { name: 'Lincoln Financial Field', city: 'Philadelphia', state: 'PA', country: 'US', capacity: 69176, latitude: 39.9008, longitude: -75.1675, timezone: 'America/New_York' },
    { name: 'Lumen Field', city: 'Seattle', state: 'WA', country: 'US', capacity: 68740, latitude: 47.5952, longitude: -122.3316, timezone: 'America/Los_Angeles' },
    { name: 'MetLife Stadium', city: 'East Rutherford', state: 'NJ', country: 'US', capacity: 82500, latitude: 40.8128, longitude: -74.0742, timezone: 'America/New_York' },
    { name: 'AT&T Stadium', city: 'Arlington', state: 'TX', country: 'US', capacity: 80000, latitude: 32.7473, longitude: -97.0945, timezone: 'America/Chicago' },
    { name: 'Hard Rock Stadium', city: 'Miami Gardens', state: 'FL', country: 'US', capacity: 64767, latitude: 25.9580, longitude: -80.2389, timezone: 'America/New_York' },
    { name: 'NRG Stadium', city: 'Houston', state: 'TX', country: 'US', capacity: 72220, latitude: 29.6847, longitude: -95.4107, timezone: 'America/Chicago' },
    { name: 'Arrowhead Stadium', city: 'Kansas City', state: 'MO', country: 'US', capacity: 76416, latitude: 39.0489, longitude: -94.4839, timezone: 'America/Chicago' },
    { name: 'Gillette Stadium', city: 'Foxborough', state: 'MA', country: 'US', capacity: 65878, latitude: 42.0909, longitude: -71.2643, timezone: 'America/New_York' },
    { name: 'Geodis Park', city: 'Nashville', state: 'TN', country: 'US', capacity: 30000, latitude: 36.1304, longitude: -86.7659, timezone: 'America/Chicago' },
  ];

  return JSON.stringify({
    source: 'Official Stadium Registry',
    fetched_at: new Date().toISOString(),
    venues,
  });
}
