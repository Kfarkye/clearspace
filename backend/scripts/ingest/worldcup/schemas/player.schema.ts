import { z } from 'zod';

export const playerSchema = z.object({
  team_code: z.string().min(2).max(10),
  player_id: z.string().uuid().or(z.string().min(1)),
  name: z.string().min(2).max(256),
  jersey_number: z.number().int().optional(),
  position: z.string().optional(),
  age: z.number().int().optional(),
  club: z.string().optional(),
  is_captain: z.boolean().optional(),
});

export type Player = z.infer<typeof playerSchema>;
