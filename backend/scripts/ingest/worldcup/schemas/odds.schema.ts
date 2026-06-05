import { z } from 'zod';

export const oddsSchema = z.object({
  match_id: z.string().uuid().or(z.string().min(1)),
  odds_id: z.string().uuid().or(z.string().min(1)),
  market_type: z.string().min(2).max(128),
  team_code: z.string().min(2).max(10).optional().nullable(),
  source: z.string().min(2).max(128),
  american_odds: z.number().int().optional(),
  implied_probability: z.number().optional(),
  fetched_at: z.string(),
});

export type Odds = z.infer<typeof oddsSchema>;
