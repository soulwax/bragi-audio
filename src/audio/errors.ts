export type AudioCodecErrorCode =
  | "invalid_pcm"
  | "invalid_wav"
  | "unsupported_codec"
  | "size_limit"
  | "decode_failed";

export class AudioCodecError extends Error {
  override readonly name = "AudioCodecError";
  constructor(
    readonly code: AudioCodecErrorCode,
    message: string,
  ) {
    super(message);
  }
}
