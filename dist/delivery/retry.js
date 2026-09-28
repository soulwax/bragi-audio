/** Upstream statuses worth a second attempt on a safe read. */
export const TRANSIENT_READ_STATUSES = new Set([408, 500, 502, 503, 504]);
export const MAX_TRANSIENT_READ_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 100;
function abortReason(signal) {
    return signal.reason instanceof Error
        ? signal.reason
        : new DOMException("The request was aborted.", "AbortError");
}
function wait(ms, signal) {
    if (signal?.aborted)
        return Promise.reject(abortReason(signal));
    return new Promise((resolve, reject) => {
        const timer = setTimeout(done, ms);
        function done() {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }
        function onAbort() {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            reject(signal
                ? abortReason(signal)
                : new DOMException("The request was aborted.", "AbortError"));
        }
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
/**
 * Run `send` until it yields a non-transient response, retrying with exponential
 * backoff (100ms, 200ms, …). Only ever wrap idempotent requests: a retry re-sends
 * the whole thing.
 */
export async function withTransientRetry(send, options = {}) {
    const retries = options.retries ?? MAX_TRANSIENT_READ_RETRIES;
    if (!Number.isSafeInteger(retries) || retries < 0 || retries > 10)
        throw new RangeError("Invalid retry count");
    for (let attempt = 0;; attempt += 1) {
        if (options.signal?.aborted)
            throw abortReason(options.signal);
        try {
            const response = await send();
            if (!TRANSIENT_READ_STATUSES.has(response.status) ||
                attempt === retries) {
                return response;
            }
            // Release the socket: this body is being discarded for a retry.
            await response.body?.cancel().catch(() => undefined);
        }
        catch (reason) {
            if (attempt === retries ||
                options.signal?.aborted ||
                (reason instanceof DOMException && reason.name === "AbortError")) {
                throw reason;
            }
        }
        await wait(INITIAL_RETRY_DELAY_MS * 2 ** attempt, options.signal);
    }
}
//# sourceMappingURL=retry.js.map