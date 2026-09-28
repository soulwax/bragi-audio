/**
 * Look-ahead cache for per-track stream information, so the next track can
 * start without a round trip. Each entry is handed out once: a consumer takes
 * it at the moment it switches sources.
 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 5;
export class StreamPreloader {
    cache = new Map();
    inflight = new Map();
    load;
    ttlMs;
    maxEntries;
    now;
    /** Bumped by `clear()` so requests started before it cannot repopulate the cache. */
    generation = 0;
    constructor(options) {
        this.load = options.load;
        this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
        this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
        this.now = options.now ?? Date.now;
    }
    /** Start resolving a track unless a fresh entry or a request already exists. */
    preload(trackId) {
        if (!trackId)
            return;
        const existing = this.cache.get(trackId);
        if (existing && !this.isExpired(existing))
            return;
        if (this.inflight.has(trackId))
            return;
        const generation = this.generation;
        const promise = new Promise((resolve) => {
            resolve(this.load(trackId));
        })
            .then((value) => {
            if (generation !== this.generation)
                return null;
            if (value != null)
                this.store(trackId, value);
            return value ?? null;
        })
            .catch(() => null)
            .finally(() => {
            if (this.inflight.get(trackId) === promise)
                this.inflight.delete(trackId);
        });
        this.inflight.set(trackId, promise);
    }
    /** Take a fresh cached entry, if any. */
    consume(trackId) {
        const cached = this.cache.get(trackId);
        if (!cached)
            return null;
        this.cache.delete(trackId);
        return this.isExpired(cached) ? null : cached.value;
    }
    /** Take a cached entry, or wait for one that is being resolved, else `null`. */
    async getOrAwait(trackId) {
        const consumed = this.consume(trackId);
        if (consumed != null)
            return consumed;
        const pending = this.inflight.get(trackId);
        if (!pending)
            return null;
        const result = await pending;
        if (result != null)
            this.cache.delete(trackId);
        return result;
    }
    /** Forget everything. Requests already in flight settle into nothing. */
    clear() {
        this.generation += 1;
        this.cache.clear();
        this.inflight.clear();
    }
    isExpired(entry) {
        return this.now() - entry.fetchedAt > this.ttlMs;
    }
    store(trackId, value) {
        if (this.cache.size >= this.maxEntries) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined)
                this.cache.delete(oldest);
        }
        this.cache.set(trackId, { value, fetchedAt: this.now() });
    }
}
//# sourceMappingURL=preloader.js.map