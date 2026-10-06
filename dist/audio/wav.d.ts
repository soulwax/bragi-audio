/** Planar PCM; each channel has the same number of normalized samples. */
export interface PcmAudio {
    sampleRate: number;
    channels: readonly Float32Array[];
}
export interface WavOptions {
    /** 32 writes IEEE float, 16 and 24 write signed PCM. */
    bitDepth?: 16 | 24 | 32;
    maxBytes?: number;
}
/** Encode mono/stereo PCM without changing sample rate or fetching a source. */
export declare function encodeWav(pcm: PcmAudio, options?: WavOptions): Uint8Array<ArrayBuffer>;
/** Decode mono/stereo PCM16/PCM24/float32 RIFF/WAVE in Node or a browser. */
export declare function decodeWav(bytes: Uint8Array, options?: {
    maxBytes?: number;
    maxPcmBytes?: number;
}): PcmAudio;
//# sourceMappingURL=wav.d.ts.map