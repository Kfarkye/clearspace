import { z } from 'zod';

export const teamSchema = z.object({
  team_code: z.string().min(2).max(10),
  name: z.string().min(2).max(256),
  group_letter: z.string().length(1),
  fifa_ranking: z.number().int().optional(),
  confederation: z.string().optional(),
  flag_emoji: z.string().optional(),
  manager: z.string().optional(),
  formation: z.string().optional(),
  playing_style: z.string().optional(),
  key_players: z.any().optional(),
  world_cup_history: z.string().optional(),
  nickname: z.string().optional(),
  logo_url: z.string().optional(),
  is_placeholder: z.boolean().optional(),
});

export type Team = z.infer<typeof teamSchema>;
