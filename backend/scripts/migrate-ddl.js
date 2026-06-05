import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = 'aura-governance-instance';
const DATABASE = 'world-cup-db';

async function main() {
  if (!PROJECT) {
    console.error('❌ GOOGLE_CLOUD_PROJECT is required');
    process.exit(1);
  }
  const client = new Spanner({ projectId: PROJECT });
  const db = client.instance(INSTANCE).database(DATABASE);

  console.log('Running schema DDL migrations on Spanner...');
  const statements = [
    `CREATE TABLE historical_matches (
      league_id      STRING(32) NOT NULL,
      team_code      STRING(10) NOT NULL,
      match_id       STRING(36) NOT NULL,
      match_date     TIMESTAMP NOT NULL,
      competition    STRING(128) NOT NULL,
      opponent_code  STRING(10) NOT NULL,
      venue_type     STRING(16) NOT NULL,
      goals_for      INT64 NOT NULL,
      goals_against  INT64 NOT NULL,
      result         STRING(8) NOT NULL,
      source_url     STRING(512) NOT NULL,
      source_name    STRING(128) NOT NULL,
      fetched_at     TIMESTAMP NOT NULL,
      created_at     TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp = true),
    ) PRIMARY KEY(league_id, team_code, match_id),
      INTERLEAVE IN PARENT teams ON DELETE CASCADE`,

    `CREATE TABLE team_historical_snapshots (
      league_id          STRING(32) NOT NULL,
      team_code          STRING(10) NOT NULL,
      period             STRING(32) NOT NULL,
      fifa_rank          INT64,
      elo_rating         INT64,
      form_5             STRING(10),
      form_10            STRING(10),
      goals_for_avg      NUMERIC,
      goals_against_avg  NUMERIC,
      clean_sheet_rate   NUMERIC,
      over_2_5_rate      NUMERIC,
      btts_rate          NUMERIC,
      win_rate           NUMERIC,
      updated_at         TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp = true),
    ) PRIMARY KEY(league_id, team_code, period),
      INTERLEAVE IN PARENT teams ON DELETE CASCADE`
  ];

  try {
    const [operation] = await db.updateSchema(statements);
    console.log('Waiting for migration operation to complete...');
    await operation.promise();
    console.log('✅ Spanner schema migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

main();
