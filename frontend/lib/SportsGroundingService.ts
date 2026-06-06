export class GroundingFaultError extends Error {
  constructor(public context_summary: string, public type: string) {
    super(context_summary);
    this.name = 'GroundingFaultError';
  }
}

export interface SportsArtifactData {
  events: any[];
  _isStale?: boolean;
}

export class SportsGroundingService {
  private readonly CACHE_TTL = 300000; // 5 minutes in ms
  private readonly MAX_RETRIES = 3;

  public async fetchLiveSchedule(limit: number = 5): Promise<SportsArtifactData> {
    const cacheKey = `sports:mlb:schedule:limit:${limit}`;
    
    try {
      return await this.executeWithBackoff(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const response = await fetch(`/api/sports/mlb/schedule?limit=${limit}`, {
          signal: controller.signal as any,
          headers: { 'X-Clearspace-Client-Id': 'web' }
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Upstream returned ${response.status}`);
        }

        const data = await response.json();
        const artifactData: SportsArtifactData = { events: data.events || [] };
        
        // Save to cache
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({
            data: artifactData,
            expiresAt: Date.now() + this.CACHE_TTL
          }));
        } catch (e) {
          console.warn('Failed to write to session cache', e);
        }

        return artifactData;
      });
    } catch (error) {
      console.warn(`Grounding fault: ${error instanceof Error ? error.message : 'Unknown'}. Attempting cache fallback.`);
      
      // Attempt cache fallback
      try {
        const cachedStr = sessionStorage.getItem(cacheKey);
        if (cachedStr) {
          const cachedObj = JSON.parse(cachedStr);
          // We return the stale data even if expired because it's a hard fallback
          if (cachedObj && cachedObj.data) {
            return { ...cachedObj.data, _isStale: true };
          }
        }
      } catch (e) {
        console.warn('Failed to read from session cache', e);
      }
      
      throw new GroundingFaultError('A connection error occurred while querying live sports data.', 'SPORTS_ARTIFACT');
    }
  }

  private async executeWithBackoff<T>(operation: () => Promise<T>, attempt = 1): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= this.MAX_RETRIES) throw error;
      const delay = Math.min(100 * Math.pow(2, attempt), 2000);
      await new Promise(res => setTimeout(res, delay));
      return this.executeWithBackoff(operation, attempt + 1);
    }
  }
}

export const sportsGroundingService = new SportsGroundingService();
