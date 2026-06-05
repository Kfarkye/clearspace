import { z } from 'zod';

export const venueSchema = z.object({
  venue_id: z.string().uuid().or(z.string().min(1)),
  name: z.string().min(2).max(256),
  city: z.string().min(2).max(256),
  state: z.string().optional(),
  country: z.string().min(2).max(256),
  capacity: z.number().int().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  timezone: z.string().optional(),
});

export type Venue = z.infer<typeof venueSchema>;
