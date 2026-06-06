import { Spanner } from '@google-cloud/spanner';

export interface BetRecord {
  betId: string;
  gameId: string;
  recommendedSide: 'home' | 'away';
  oddsTaken: number;
  edgeSource: string;
  timestamp: string;
}

export interface OutcomeRecord {
  betId: string;
  closingLineValue: number | null;
  outcome: 'WIN' | 'LOSS' | 'PUSH';
}

export interface CalibrationMetrics {
  totalBets: number;
  winRate: number;
  clvBeatenPercentage: number;
  roiPercentage: number;
  confidenceMultiplier: number;
}

export class CalibrationEngine {
  private spanner: Spanner;
  private instanceId: string;
  private databaseId: string;

  constructor(projectId: string, instanceId: string, databaseId: string) {
    this.spanner = new Spanner({ projectId });
    this.instanceId = instanceId;
    this.databaseId = databaseId;
  }

  private getDatabase() {
    // Ensures proper session pool management to prevent connection exhaustion
    return this.spanner.instance(this.instanceId).database(this.databaseId, {
      min: 10,
      max: 100,
    });
  }

  /**
   * Logs a recommended +EV bet into the RecommendedBets table.
   * Utilizes Spanner Mutations for optimal write throughput.
   */
  public async recordRecommendation(record: BetRecord): Promise<void> {
    const db = this.getDatabase();
    const table = db.table('RecommendedBets');
    
    try {
      await table.insert({
        BetId: record.betId,
        GameId: record.gameId,
        RecommendedSide: record.recommendedSide,
        OddsTaken: record.oddsTaken,
        EdgeSource: record.edgeSource,
        Timestamp: Spanner.timestamp(record.timestamp),
      });
    } catch (error) {
      console.error('[CalibrationEngine] Spanner insertion failed:', error);
      throw new Error(\`Failed to record bet recommendation: \${(error as Error).message}\`);
    }
  }

  /**
   * Settles the outcome of a bet. Writes to the BetOutcomes table,
   * which is INTERLEAVED IN PARENT RecommendedBets for strict data locality and query performance.
   */
  public async settleOutcome(outcomeRecord: OutcomeRecord): Promise<void> {
    const db = this.getDatabase();
    const table = db.table('BetOutcomes');

    try {
      // Using bulk mutations for high performance
      await table.insertOrUpdate({
        BetId: outcomeRecord.betId,
        Outcome: outcomeRecord.outcome,
        ClosingLineValue: outcomeRecord.closingLineValue,
        SettledTimestamp: Spanner.timestamp(new Date().toISOString()),
      });
    } catch (error) {
      console.error(\`[CalibrationEngine] Spanner update failed for BetId \${outcomeRecord.betId}:\`, error);
      throw new Error(\`Failed to settle bet outcome: \${(error as Error).message}\`);
    }
  }

  /**
   * Dynamically calculates the LLM's confidence multiplier based on historical ROI
   * and CLV-beating frequency. Uses an optimized JOIN against interleaved tables.
   */
  public async getCalibrationMetrics(edgeSource: string, lookbackDays: number = 30): Promise<CalibrationMetrics> {
    const db = this.getDatabase();
    
    // Spanner SQL query leveraging data locality from interleaved tables (BetOutcomes IN RecommendedBets)
    const query = {
      sql: \`
        SELECT 
          COUNT(r.BetId) as totalBets,
          COUNTIF(o.Outcome = 'WIN') as wins,
          COUNTIF(o.Outcome = 'LOSS') as losses,
          COUNTIF(o.ClosingLineValue < r.OddsTaken) as clvBeaten
        FROM RecommendedBets r
        JOIN BetOutcomes o ON r.BetId = o.BetId
        WHERE r.EdgeSource = @edgeSource
          AND r.Timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @lookbackDays DAY)
      \`,
      params: {
        edgeSource,
        lookbackDays,
      },
    };

    try {
      const [rows] = await db.run(query);
      if (!rows || rows.length === 0) {
        return { totalBets: 0, winRate: 0, clvBeatenPercentage: 0, roiPercentage: 0, confidenceMultiplier: 1.0 };
      }
      
      const data = rows[0].toJSON();
      const totalResolved = data.wins + data.losses;
      if (totalResolved === 0) {
        return { totalBets: 0, winRate: 0, clvBeatenPercentage: 0, roiPercentage: 0, confidenceMultiplier: 1.0 };
      }

      const winRate = data.wins / totalResolved;
      const clvBeatenPercentage = data.clvBeaten / totalResolved;
      
      // Calculate a flat unit ROI assuming 1U flat betting and average odds of +100 for normalization
      const unitsWon = data.wins; 
      const unitsLost = data.losses;
      const roiPercentage = ((unitsWon - unitsLost) / totalResolved) * 100;

      // Calibration Algorithm: 
      // If consistently beating CLV and profitable, increase confidence weight (up to 1.25x).
      // If bleeding units and missing CLV, penalize the model confidence (down to 0.75x).
      let confidenceMultiplier = 1.0;
      if (roiPercentage > 5 && clvBeatenPercentage > 0.60) {
        confidenceMultiplier = 1.25;
      } else if (roiPercentage < -5) {
        confidenceMultiplier = 0.75;
      }

      return {
        totalBets: data.totalBets,
        winRate,
        clvBeatenPercentage,
        roiPercentage,
        confidenceMultiplier
      };
    } catch (error) {
      console.error('[CalibrationEngine] Spanner query failed. Failing gracefully with baseline weight:', error);
      return { totalBets: 0, winRate: 0, clvBeatenPercentage: 0, roiPercentage: 0, confidenceMultiplier: 1.0 };
    }
  }
}
