import { z } from 'zod';

export const fieldProvenanceSchema = z.object({
  sourceUrl: z.string().url().or(z.string().min(1)),
  sourceName: z.string().min(2),
  fetchedAt: z.string(),
  parserVersion: z.string(),
  confidence: z.number().min(0).max(1),
  status: z.enum(['verified', 'enriched', 'inferred', 'manual']),
});

export const entityProvenanceSchema = z.record(fieldProvenanceSchema);

export type FieldProvenance = z.infer<typeof fieldProvenanceSchema>;
export type EntityProvenance = z.infer<typeof entityProvenanceSchema>;
