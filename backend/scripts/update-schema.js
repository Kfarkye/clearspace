import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = 'aura-governance-instance';
const DATABASES = ['sports-db', 'world-cup-db'];

if (!PROJECT) {
  console.error('❌ GOOGLE_CLOUD_PROJECT environment variable is required.');
  process.exit(1);
}

const client = new Spanner({ projectId: PROJECT });

const statements = [
  "ALTER TABLE odds ADD COLUMN line NUMERIC",
  "ALTER TABLE odds ADD COLUMN source_url STRING(MAX)",
  `CREATE TABLE team_power_ratings (
    league_id   STRING(32) NOT NULL,
    team_code   STRING(10) NOT NULL,
    rating_id   STRING(36) NOT NULL,
    rating      NUMERIC NOT NULL,
    source      STRING(128),
    updated_at  TIMESTAMP,
    created_at  TIMESTAMP OPTIONS (allow_commit_timestamp = true),
  ) PRIMARY KEY(league_id, team_code, rating_id),
    INTERLEAVE IN PARENT teams ON DELETE CASCADE`,
  `CREATE TABLE team_trends (
    league_id   STRING(32) NOT NULL,
    team_code   STRING(10) NOT NULL,
    trend_id    STRING(36) NOT NULL,
    trend_type  STRING(128) NOT NULL,
    wins        INT64,
    losses      INT64,
    pushes      INT64,
    percentage  NUMERIC,
    source      STRING(128),
    updated_at  TIMESTAMP,
  ) PRIMARY KEY(league_id, team_code, trend_id),
    INTERLEAVE IN PARENT teams ON DELETE CASCADE`,
  `CREATE TABLE injury_news (
    league_id   STRING(32) NOT NULL,
    team_code   STRING(10) NOT NULL,
    injury_id   STRING(36) NOT NULL,
    player_name STRING(256) NOT NULL,
    position    STRING(64),
    status      STRING(64) NOT NULL,
    description STRING(MAX),
    updated_at  TIMESTAMP,
  ) PRIMARY KEY(league_id, team_code, injury_id),
    INTERLEAVE IN PARENT teams ON DELETE CASCADE`,
  `CREATE TABLE lineup_projections (
    league_id            STRING(32) NOT NULL,
    match_id             STRING(36) NOT NULL,
    lineup_id            STRING(36) NOT NULL,
    team_code            STRING(10) NOT NULL,
    player_name          STRING(256) NOT NULL,
    position             STRING(64),
    is_projected_starter BOOL,
    updated_at           TIMESTAMP,
  ) PRIMARY KEY(league_id, match_id, lineup_id),
    INTERLEAVE IN PARENT matches ON DELETE CASCADE`,
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

async function applyDdl(databaseName) {
  console.log(`\n🚀 Applying DDL updates to database: ${databaseName}...`);
  const db = client.instance(INSTANCE).database(databaseName);
  
  for (const stmt of statements) {
    try {
      const [operation] = await db.updateSchema([stmt]);
      await operation.promise();
      console.log(`   ✅ Success: ${stmt.substring(0, 50)}...`);
    } catch (err) {
      if (
        err.message.includes('Duplicate') ||
        err.message.includes('already exists') ||
        err.message.includes('Altering table') ||
        err.message.includes('exists') ||
        err.message.includes('already has')
      ) {
        console.log(`   ⚠️ Skipped (already applied): ${stmt.substring(0, 50)}...`);
      } else {
        console.error(`   ❌ Failed: ${stmt.substring(0, 50)}... Error:`, err.message);
        throw err;
      }
    }
  }
  console.log(`   ✅ All applicable schema updates applied on ${databaseName}`);
}

async function main() {
  try {
    for (const dbName of DATABASES) {
      await applyDdl(dbName);
    }
    console.log('\n🎉 All DDL updates processed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Execution failed:', err);
    process.exit(1);
  }
}

main();
