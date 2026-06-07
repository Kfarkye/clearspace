import { Spanner } from '@google-cloud/spanner';
async function run() {
  const spanner = new Spanner({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829' });
  const instance = spanner.instance('clearspace');
  const database = instance.database('clearspace-db');
  const [operation] = await database.updateSchema({
    statements: [
      'DROP TABLE MlbOddsHistory',
      `CREATE TABLE MlbOddsHistory (
        EventId STRING(64) NOT NULL,
        SnapshotId STRING(128) NOT NULL,
        Provider STRING(64) NOT NULL,
        SnapshotType STRING(32),
        OverUnder FLOAT64,
        Spread FLOAT64,
        HomeMoneyLine FLOAT64,
        AwayMoneyLine FLOAT64,
        FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true)
      ) PRIMARY KEY (EventId, SnapshotId), INTERLEAVE IN PARENT MlbGames ON DELETE CASCADE`
    ],
  });
  console.log('Waiting for schema update...');
  await operation.promise();
  console.log('Schema updated.');
  await database.close();
}
run().catch(console.error);
