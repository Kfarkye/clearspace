// Media resolution is NOT IMPLEMENTED.
//
// The previous version returned a hardcoded YouTube ID for every query, which
// would have shipped a fake result. Until a real resolver exists (YouTube Data
// API: search, official-channel verification, quota handling), this returns a
// structured not-implemented error so callers can handle it explicitly rather
// than render a fabricated video.
export class MediaLane {
  constructor(db, writeTrace) {
    this.db = db;
    this.writeTrace = writeTrace;
  }
  async resolveMedia(intentQuery, routeId) {
    if (this.writeTrace) this.writeTrace('MEDIA_RESOLVE_NOT_IMPLEMENTED', { routeId, intentQuery });
    return {
      error: 'NOT_IMPLEMENTED',
      message: 'Media resolution is not implemented yet. No video is returned.',
      intent: intentQuery
    };
  }
}
