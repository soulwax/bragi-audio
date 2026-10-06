import { AudioCodecError } from "./errors.js";

export interface DecodeAudioOptions {
  /** Caller owns the context; this API creates no graph or playback node. */
  context: Pick<BaseAudioContext, "decodeAudioData">;
  maxInputBytes?: number;
  signal?: AbortSignal;
}

/** Native browser decoding of a complete file, resampled to the supplied context. */
export async function decodeAudio(
  bytes: Uint8Array,
  options: DecodeAudioOptions,
): Promise<AudioBuffer> {
  options.signal?.throwIfAborted();
  const limit = options.maxInputBytes ?? 128 * 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit <= 0 || bytes.byteLength > limit)
    throw new AudioCodecError(
      "size_limit",
      "Encoded audio exceeds the byte limit",
    );
  if (bytes.byteLength === 0)
    throw new AudioCodecError("decode_failed", "Encoded audio is empty");
  // Native decode detaches its input: copy only the view, preserving caller bytes.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  let decoded: AudioBuffer;
  try {
    decoded = await options.context.decodeAudioData(copy.buffer);
  } catch {
    options.signal?.throwIfAborted();
    throw new AudioCodecError(
      "decode_failed",
      "The browser could not decode this audio",
    );
  }
  // Native decoding cannot be interrupted. An aborted result is never returned.
  options.signal?.throwIfAborted();
  return decoded;
}
