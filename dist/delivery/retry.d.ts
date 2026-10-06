/** Upstream statuses worth a second attempt on a safe read. */
export declare const TRANSIENT_READ_STATUSES: Set<number>;
export declare const MAX_TRANSIENT_READ_RETRIES = 2;
export interface TransientRetryOptions {
    /** Attempts after the first. Pass `0` to disable (e.g. for unsafe methods). */
    retries?: number;
    /** Caller's abort signal — an aborted request is never retried. */
    signal?: AbortSignal | null;
}
/**
 * Run `send` until it yields a non-transient response, retrying with exponential
 * backoff (100ms, 200ms, …). Only ever wrap idempotent requests: a retry re-sends
 * the whole thing.
 */
export declare function withTransientRetry(send: () => Promise<Response>, options?: TransientRetryOptions): Promise<Response>;
//# sourceMappingURL=retry.d.ts.map