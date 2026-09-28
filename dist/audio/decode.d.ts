export interface DecodeAudioOptions {
    /** Caller owns the context; this API creates no graph or playback node. */
    context: Pick<BaseAudioContext, "decodeAudioData">;
    maxInputBytes?: number;
    signal?: AbortSignal;
}
/** Native browser decoding of a complete file, resampled to the supplied context. */
export declare function decodeAudio(bytes: Uint8Array, options: DecodeAudioOptions): Promise<AudioBuffer>;
//# sourceMappingURL=decode.d.ts.map