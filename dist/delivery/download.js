import { DeliveryError } from "./errors.js";
import { withTransientRetry } from "./retry.js";
/** A cancellable, byte-bounded GET using Web Fetch, including Range/206 responses. */
export async function fetchAudioStream(source, options = {}) {
    const limit = options.maxBytes ?? 128 * 1024 * 1024;
    if (!Number.isSafeInteger(limit) || limit < 1)
        throw new RangeError("Invalid download limit");
    const abort = new AbortController();
    const signal = options.signal
        ? AbortSignal.any([options.signal, abort.signal])
        : abort.signal;
    const response = await withTransientRetry(() => (options.fetchImpl ?? fetch)(source, {
        headers: new Headers(options.headers),
        signal,
        redirect: "follow",
    }), { signal });
    if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new DeliveryError(`Audio fetch failed with status ${String(response.status)}`);
    }
    const declared = response.headers.get("content-length");
    if (declared !== null &&
        (!/^\d+$/.test(declared) ||
            !Number.isSafeInteger(Number(declared)) ||
            Number(declared) > limit)) {
        await response.body?.cancel().catch(() => undefined);
        throw new DeliveryError("Audio exceeds the download byte limit");
    }
    const reader = response.body?.getReader();
    if (!reader)
        throw new DeliveryError("Audio response has no body");
    let total = 0;
    const body = new ReadableStream({
        async pull(controller) {
            try {
                signal.throwIfAborted();
                const { done, value } = await reader.read();
                signal.throwIfAborted();
                if (done) {
                    controller.close();
                    reader.releaseLock();
                    return;
                }
                total += value.byteLength;
                if (total > limit)
                    throw new DeliveryError("Audio exceeds the download byte limit");
                controller.enqueue(value);
            }
            catch (cause) {
                abort.abort();
                await reader.cancel().catch(() => undefined);
                reader.releaseLock();
                controller.error(cause);
            }
        },
        async cancel(reason) {
            abort.abort(reason);
            await reader.cancel(reason).catch(() => undefined);
            reader.releaseLock();
        },
    });
    return new Response(body, {
        status: response.status,
        headers: response.headers,
    });
}
/** Download permitted audio into memory. No filesystem or browser-save side effect. */
export async function downloadAudio(source, options = {}) {
    const response = await fetchAudioStream(source, options);
    return new Uint8Array(await response.arrayBuffer());
}
//# sourceMappingURL=download.js.map