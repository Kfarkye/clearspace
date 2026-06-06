import { Spanner } from '@google-cloud/spanner';

const spanner = new Spanner({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
const database = spanner.instance(process.env.SPANNER_INSTANCE_ID || 'aura-core').database(process.env.SPANNER_DATABASE_ID || 'sports-ledger');

export interface MarketOdds {
  homeAmerican: number;
  awayAmerican: number;
}

export interface EVMetrics {
  trueHomeProb: number;
  trueAwayProb: number;
  vigPercentage: number;
}

export interface BetEvaluation {
  isPositiveEV: boolean;
  evPercentage: number;
  recommendedBet: 'home' | 'away' | 'pass';
  trueProbability: number;
}

export class EVMapper {
  /**
   * Retrieves the sharp consensus line from Spanner using bounded staleness (15 seconds)
   * to optimize read latency while maintaining mathematically sound TrueTime consistency.
   */
  public static async getSharpConsensusLine(gameId: string): Promise<MarketOdds | null> {
    const query = {
      sql: \`SELECT OddsPayload FROM LiveOddsState WHERE GameId = @gameId\`,
      params: { gameId },
    };

    try {
      // Execute read with exact staleness boundary for extremely fast global reads
      const [rows] = await database.run(query, { exactStaleness: 15 });
      if (!rows || rows.length === 0) return null;
      
      const payloadStr = rows[0].toJSON().OddsPayload;
      if (!payloadStr) return null;
      
      const payload = JSON.parse(payloadStr);
      return {
        homeAmerican: payload.homeAmerican,
        awayAmerican: payload.awayAmerican
      };
    } catch (error) {
      console.warn(\`[EVMapper] Failed to retrieve consensus line for \${gameId}, falling back to secondary models.\`, error);
      return null;
    }
  }

  /**
   * Converts American odds to implied probability (0-1).
   */
  public static americanToImplied(american: number): number {
    if (american === 0) throw new Error('American odds cannot be exactly 0.');
    if (american > 0) {
      return 100 / (american + 100);
    } else {
      return Math.abs(american) / (Math.abs(american) + 100);
    }
  }

  /**
   * Converts implied probability to American odds.
   */
  public static impliedToAmerican(implied: number): number {
    if (implied <= 0 || implied >= 1) throw new Error('Probability must be between 0 and 1 exclusive.');
    if (implied > 0.5) {
      return -Math.round((implied / (1 - implied)) * 100);
    } else {
      return Math.round(((1 - implied) / implied) * 100);
    }
  }

  /**
   * Removes the vig (juice) using the multiplicative method from a two-way market,
   * calculating the "True" probability of each side based on the sharp reference market.
   */
  public static removeVigMultiplicative(sharpMarket: MarketOdds): EVMetrics {
    const rawHomeProb = this.americanToImplied(sharpMarket.homeAmerican);
    const rawAwayProb = this.americanToImplied(sharpMarket.awayAmerican);
    
    const totalImplied = rawHomeProb + rawAwayProb;
    const vigPercentage = totalImplied - 1.0;

    return {
      trueHomeProb: rawHomeProb / totalImplied,
      trueAwayProb: rawAwayProb / totalImplied,
      vigPercentage
    };
  }

  /**
   * Evaluates a retail book's line against the sharp consensus true probability.
   * Calculates the +EV (Expected Value) edge.
   */
  public static evaluateBet(retailAmerican: number, trueProbability: number): BetEvaluation {
    const retailPayoutMultiplier = retailAmerican > 0 
      ? (retailAmerican / 100) 
      : (100 / Math.abs(retailAmerican));

    // Expected Value = (Probability of Win * Payout Multiplier) - (Probability of Loss * 1)
    const probLoss = 1 - trueProbability;
    const ev = (trueProbability * retailPayoutMultiplier) - probLoss;

    return {
      isPositiveEV: ev > 0,
      evPercentage: ev,
      recommendedBet: ev > 0 ? 'home' : 'pass', // Default context, overridden in calculateEdge
      trueProbability
    };
  }

  /**
   * Top-level pipeline method to execute the quantitative EV calculation.
   * Cross-references retail odds against the sharp consensus line.
   */
  public static async calculateEdge(gameId: string, retailMarket: MarketOdds): Promise<{ home: BetEvaluation; away: BetEvaluation } | null> {
    const sharpConsensus = await this.getSharpConsensusLine(gameId);
    
    if (!sharpConsensus) {
      console.warn(\`[EVMapper] Cannot calculate EV edge without sharp consensus for \${gameId}\`);
      return null;
    }

    const trueMetrics = this.removeVigMultiplicative(sharpConsensus);

    const homeEvaluation = this.evaluateBet(retailMarket.homeAmerican, trueMetrics.trueHomeProb);
    homeEvaluation.recommendedBet = homeEvaluation.isPositiveEV ? 'home' : 'pass';

    const awayEvaluation = this.evaluateBet(retailMarket.awayAmerican, trueMetrics.trueAwayProb);
    awayEvaluation.recommendedBet = awayEvaluation.isPositiveEV ? 'away' : 'pass';

    return {
      home: homeEvaluation,
      away: awayEvaluation
    };
  }
}
