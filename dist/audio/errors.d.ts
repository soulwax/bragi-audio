export type AudioCodecErrorCode = "invalid_pcm" | "invalid_wav" | "unsupported_codec" | "size_limit" | "decode_failed";
export declare class AudioCodecError extends Error {
    readonly code: AudioCodecErrorCode;
    readonly name = "AudioCodecError";
    constructor(code: AudioCodecErrorCode, message: string);
}
//# sourceMappingURL=errors.d.ts.map