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

interface CachedEntry<T> {
  value: T;
  fetchedAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 5;

export class StreamPreloader<T> {
  private readonly cache = new Map<string, CachedEntry<T>>();
  private readonly inflight = new Map<string, Promise<T | null>>();
  private readonly load: (trackId: string) => Promise<T | null>;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  /** Bumped by `clear()` so requests started before it cannot repopulate the cache. */
  private generation = 0;

  constructor(options: StreamPreloaderOptions<T>) {
    this.load = options.load;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
    this.now = options.now ?? Date.now;
  }

  /** Start resolving a track unless a fresh entry or a request already exists. */
  preload(trackId: string): void {
    if (!trackId) return;
    const existing = this.cache.get(trackId);
    if (existing && !this.isExpired(existing)) return;
    if (this.inflight.has(trackId)) return;

    const generation = this.generation;
    const promise = new Promise<T | null>((resolve) => {
      resolve(this.load(trackId));
    })
      .then((value) => {
        if (generation !== this.generation) return null;
        if (value != null) this.store(trackId, value);
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
  consume(trackId: string): T | null {
    const cached = this.cache.get(trackId);
    if (!cached) return null;
    this.cache.delete(trackId);
    return this.isExpired(cached) ? null : cached.value;
  }

  /** Take a cached entry, or wait for one that is being resolved, else `null`. */
  async getOrAwait(trackId: string): Promise<T | null> {
    const consumed = this.consume(trackId);
    if (consumed != null) return consumed;

    const pending = this.inflight.get(trackId);
    if (!pending) return null;
    const result = await pending;
    if (result != null) this.cache.delete(trackId);
    return result;
  }

  /** Forget everything. Requests already in flight settle into nothing. */
  clear(): void {
    this.generation += 1;
    this.cache.clear();
    this.inflight.clear();
  }

  private isExpired(entry: CachedEntry<T>): boolean {
    return this.now() - entry.fetchedAt > this.ttlMs;
  }

  private store(trackId: string, value: T): void {
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(trackId, { value, fetchedAt: this.now() });
  }
}
