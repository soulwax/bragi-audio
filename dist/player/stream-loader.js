export class StreamLoader {
    options;
    constructor(options) {
        this.options = options;
    }
    async load(trackId, signal) {
        let status = null;
        try {
            signal?.throwIfAborted();
            const response = await (this.options.fetch ?? fetch)(this.options.url(trackId), { signal: signal ?? null });
            status = response.status;
            const limit = this.options.maxResponseBytes ?? 64 * 1024;
            if (!Number.isSafeInteger(limit) || limit <= 0)
                throw new RangeError("Invalid response limit");
            const reader = response.body?.getReader();
            let body = null;
            if (reader) {
                const chunks = [];
                let total = 0;
                try {
                    for (;;) {
                        signal?.throwIfAborted();
                        const { done, value } = await reader.read();
                        if (done)
                            break;
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
                    body = JSON.parse(new TextDecoder().decode(bytes));
                }
                catch {
                    await reader.cancel().catch(() => undefined);
                }
                finally {
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
        }
        catch {
            return {
                ok: false,
                status,
                reason: signal?.aborted ? "aborted" : "network_error",
                requiresAuth: false,
            };
        }
    }
}
//# sourceMappingURL=stream-loader.js.map