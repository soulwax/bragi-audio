/**
 * Look-ahead cache for per-track stream information, so the next track can
 * start without a round trip. Each entry is handed out once: a consumer takes
 * it at the moment it switches sources.
 */
export interface StreamPreloaderOptions<T> {
    /** Resolve stream information for a track; `null` (or a rejection) means none. */
    load: (trackId: string) => Promise<T | null>;
    /** How long a preloaded entry stays usable. Defaults to five minutes. */
    ttlMs?: number;
    /** Most entries kept; the oldest is evicted first. Defaults to five. */
    maxEntries?: number;
    /** Clock, injectable for tests. */
    now?: () => number;
}
export declare class StreamPreloader<T> {
    private readonly cache;
    private readonly inflight;
    private readonly load;
    private readonly ttlMs;
    private readonly maxEntries;
    private readonly now;
    /** Bumped by `clear()` so requests started before it cannot repopulate the cache. */
    private generation;
    constructor(options: StreamPreloaderOptions<T>);
    /** Start resolving a track unless a fresh entry or a request already exists. */
    preload(trackId: string): void;
    /** Take a fresh cached entry, if any. */
    consume(trackId: string): T | null;
    /** Take a cached entry, or wait for one that is being resolved, else `null`. */
    getOrAwait(trackId: string): Promise<T | null>;
    /** Forget everything. Requests already in flight settle into nothing. */
    clear(): void;
    private isExpired;
    private store;
}
//# sourceMappingURL=preloader.d.ts.map