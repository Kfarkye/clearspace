// pipeline module: validate.ts
import { teamSchema } from '../schemas/team.schema.js';
import { playerSchema } from '../schemas/player.schema.js';
import { matchSchema } from '../schemas/match.schema.js';
import { venueSchema } from '../schemas/venue.schema.js';
import { oddsSchema } from '../schemas/odds.schema.js';
import { NormalizedEntity } from './normalize.js';

export function executeValidate(entities: NormalizedEntity[]): NormalizedEntity[] {
  console.log('🔄 [Pipeline: Validate] Checking entities against Zod schemas...');

  const validEntities: NormalizedEntity[] = [];
  let errorCount = 0;

  for (const entity of entities) {
    let schema;
    switch (entity.entityType) {
      case 'team':
        schema = teamSchema;
        break;
      case 'player':
        schema = playerSchema;
        break;
      case 'match':
        schema = matchSchema;
        break;
      case 'venue':
        schema = venueSchema;
        break;
      case 'odds':
        schema = oddsSchema;
        break;
      default:
        console.warn(`  ⚠ Unknown entity type: ${entity.entityType}`);
        continue;
    }

    const result = schema.safeParse(entity.fields);

    if (result.success) {
      validEntities.push(entity);
    } else {
      errorCount++;
      console.error(`  ❌ [Schema Error] Invalid ${entity.entityType} (ID: ${entity.entityId}):`);
      console.error(JSON.stringify(result.error.format(), null, 2));
    }
  }

  console.log(`✅ [Pipeline: Validate] Checked ${entities.length} entities. Valid: ${validEntities.length}, Invalid: ${errorCount}`);
  return validEntities;
}
