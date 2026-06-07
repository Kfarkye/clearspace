import { Spanner } from '@google-cloud/spanner';
async function run() {
  const spanner = new Spanner({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829' });
  const instance = spanner.instance('clearspace');
  const database = instance.database('clearspace-db');
  
  try {
    await database.runTransactionAsync(async (transaction) => {
      transaction.upsert('MlbOddsHistory', [{
        EventId: "401815647",
        SnapshotId: "401815647_DraftKings_open",
        Provider: "DraftKings",
        SnapshotType: "open",
        OverUnder: Spanner.float(8.5),
        Spread: Spanner.float(-1.5),
        HomeMoneyLine: Spanner.float(-150),
        AwayMoneyLine: Spanner.float(130),
        FetchedAt: "spanner.commit_timestamp()"
      }]);
      await transaction.commit();
    });
    console.log("Success");
  } catch (err) {
    console.error(err);
  } finally {
    await database.close();
  }
}
run();
