import { AudioCodecError } from "./errors.js";
/** Native browser decoding of a complete file, resampled to the supplied context. */
export async function decodeAudio(bytes, options) {
    options.signal?.throwIfAborted();
    const limit = options.maxInputBytes ?? 128 * 1024 * 1024;
    if (!Number.isSafeInteger(limit) || limit <= 0 || bytes.byteLength > limit)
        throw new AudioCodecError("size_limit", "Encoded audio exceeds the byte limit");
    if (bytes.byteLength === 0)
        throw new AudioCodecError("decode_failed", "Encoded audio is empty");
    // Native decode detaches its input: copy only the view, preserving caller bytes.
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    let decoded;
    try {
        decoded = await options.context.decodeAudioData(copy.buffer);
    }
    catch {
        options.signal?.throwIfAborted();
        throw new AudioCodecError("decode_failed", "The browser could not decode this audio");
    }
    // Native decoding cannot be interrupted. An aborted result is never returned.
    options.signal?.throwIfAborted();
    return decoded;
}
//# sourceMappingURL=decode.js.map