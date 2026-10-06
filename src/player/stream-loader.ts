/** Fetch and validate application-owned stream metadata, never media bytes. */
export interface StreamFailure {
  reason: string;
  requiresAuth: boolean;
}

export type StreamLoadResult<T> =
  | { ok: true; data: T }
  | ({ ok: false; status: number | null } & StreamFailure);

export interface StreamLoaderOptions<T> {
  url: (trackId: string) => string;
  /** Whitelist the fields safe to keep in player state. */
  parse: (body: unknown) => T | null;
  parseError?: (body: unknown, status: number) => StreamFailure;
  fetch?: typeof fetch;
  maxResponseBytes?: number;
}

export class StreamLoader<T> {
  constructor(private readonly options: StreamLoaderOptions<T>) {}

  async load(
    trackId: string,
    signal?: AbortSignal,
  ): Promise<StreamLoadResult<T>> {
    let status: number | null = null;
    try {
      signal?.throwIfAborted();
      const response = await (this.options.fetch ?? fetch)(
        this.options.url(trackId),
        { signal: signal ?? null },
      );
      status = response.status;
      const limit = this.options.maxResponseBytes ?? 64 * 1024;
      if (!Number.isSafeInteger(limit) || limit <= 0)
        throw new RangeError("Invalid response limit");
      const reader = response.body?.getReader();
      let body: unknown = null;
      if (reader) {
        const chunks: Uint8Array[] = [];
        let total = 0;
        try {
          for (;;) {
            signal?.throwIfAborted();
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > limit)
              throw new RangeError("Stream metadata exceeds limit");
            chunks.push(value);
          }
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        } catch {
          await reader.cancel().catch(() => undefined);
        } finally {
          reader.releaseLock();
        }
      }
      signal?.throwIfAborted();
      if (!response.ok) {
        const failure = this.options.parseError?.(body, status) ?? {
          reason: `http_${String(status)}`,
          requiresAuth: status === 401 || status === 403,
        };
        return { ok: false, status, ...failure };
      }
      const data = this.options.parse(body);
      return data === null
        ? { ok: false, status, reason: "invalid_response", requiresAuth: false }
        : { ok: true, data };
    } catch {
      return {
        ok: false,
        status,
        reason: signal?.aborted ? "aborted" : "network_error",
        requiresAuth: false,
      };
    }
  }
}
