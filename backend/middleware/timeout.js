/**
 * Request Timeout Middleware
 * Enforces a strict upper bound on all request lifecycles to prevent
 * 504 Gateway Timeouts from Cloud Run's reverse proxy (default 300s).
 * 
 * This fires BEFORE the proxy timeout, giving the server a chance to
 * return a structured 504 instead of a raw connection drop.
 */

/**
 * @param {number} timeoutMs - Maximum allowed request duration in ms.
 *   Cloud Run default is 300s; we set this well below to respond gracefully.
 * @returns {import('express').RequestHandler}
 */
export function requestTimeoutMiddleware(timeoutMs = 25000) {
  return (req, res, next) => {
    // Skip health probes — they must always be fast and never timeout-wrapped
    if (req.path.startsWith('/health/')) return next();

    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        console.error(`[TIMEOUT] ${req.method} ${req.originalUrl} exceeded ${timeoutMs}ms`);
        res.status(504).json({
          error: 'Gateway Timeout',
          message: 'The upstream operation exceeded the maximum allowed time.',
          code: 'ERR_504_TIMEOUT',
          path: req.originalUrl,
        });
      }
    }, timeoutMs);

    // Clean up timer when the response finishes or the client disconnects
    res.on('finish', () => clearTimeout(timeoutId));
    res.on('close', () => clearTimeout(timeoutId));

    next();
  };
}
