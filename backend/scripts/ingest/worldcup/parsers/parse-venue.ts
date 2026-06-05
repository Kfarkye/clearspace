// parser module: parse-venue.ts
import { Venue } from '../schemas/venue.schema.js';

interface RawVenue {
  name: string;
  city: string;
  state: string;
  country: string;
  capacity: number;
  latitude: number;
  longitude: number;
  timezone: string;
}

export function parseVenues(rawJson: string): Venue[] {
  const parsed = JSON.parse(rawJson);
  const rawVenues: RawVenue[] = parsed.venues || [];

  return rawVenues.map(v => {
    // Deterministic UUID / string ID based on venue name
    const venueId = `venue-${v.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    return {
      venue_id: venueId,
      name: v.name,
      city: v.city,
      state: v.state,
      country: v.country,
      capacity: v.capacity,
      latitude: v.latitude,
      longitude: v.longitude,
      timezone: v.timezone,
    };
  });
}
