export interface ResilientFetchOptions extends RequestInit {
  timeoutMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
}

export class UpstreamTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamTimeoutError';
  }
}

/**
 * Enterprise-grade fetch wrapper with strict timeouts and exponential backoff.
 * Designed to prevent 504 Gateway Timeouts from cascading into system failures.
 */
export async function fetchWithResilience(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 4000,
    maxRetries = 3,
    baseBackoffMs = 500,
    ...fetchOptions
  } = options;

  let lastError: Error | unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Fast-fail on 4xx client errors (no retry needed)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client Error: ${response.status} ${response.statusText}`);
      }

      // Throw on 5xx to trigger the retry block
      if (!response.ok) {
        throw new Error(`Upstream Error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      lastError = error;

      const isAbortError = error.name === 'AbortError';
      
      // Do not retry client errors
      if (error.message?.startsWith('Client Error')) {
        throw error;
      }

      if (attempt < maxRetries) {
        // Exponential backoff with full jitter to prevent thundering herd
        const maxDelay = baseBackoffMs * Math.pow(2, attempt);
        const jitteredDelay = Math.floor(Math.random() * maxDelay);
        await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
      } else {
        if (isAbortError) {
          throw new UpstreamTimeoutError(`Request to ${url} timed out after ${timeoutMs}ms across ${maxRetries} retries.`);
        }
      }
    }
  }

  throw new Error(`Fetch failed after ${maxRetries} retries. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
