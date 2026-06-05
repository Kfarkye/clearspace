import { z } from 'zod';

export const matchSchema = z.object({
  match_id: z.string().uuid().or(z.string().min(1)),
  group_letter: z.string().length(1),
  match_number: z.number().int().optional(),
  home_team_code: z.string().min(2).max(10),
  away_team_code: z.string().min(2).max(10),
  venue_id: z.string().uuid().or(z.string().min(1)).optional(),
  kickoff: z.string(), // Allowing general date formats that normalize to ISO
  stage: z.string().optional(),
  status: z.string().optional(),
  home_score: z.number().int().optional(),
  away_score: z.number().int().optional(),
});

export type Match = z.infer<typeof matchSchema>;
