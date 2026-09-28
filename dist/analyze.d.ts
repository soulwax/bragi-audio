import { type AudioAnalysis } from "./metadata.js";
export type AudioInput = Uint8Array | ArrayBuffer | Blob;
export interface AudioHints {
    readonly fileName?: string;
    readonly mimeType?: string;
    readonly size?: number;
}
/**
 * Metadata supplied alongside a byte stream.
 *
 * A stream has no intrinsic length, so callers must provide a trustworthy byte
 * count (for example, object-storage metadata or a validated Content-Length).
 * It lets bragi-audio reject oversized uploads before reading them.
 */
export interface StreamAudioHints extends AudioHints {
    readonly size: number;
}
export interface AnalyzeOptions {
    readonly maxFileBytes?: number;
    readonly strictHints?: boolean;
    readonly includeArtwork?: boolean;
    readonly maxArtworkBytes?: number;
    readonly maxArtworkCount?: number;
    readonly duration?: boolean;
    readonly signal?: AbortSignal;
}
export declare function analyzeAudio(input: AudioInput, hints?: AudioHints, options?: AnalyzeOptions): Promise<AudioAnalysis>;
/**
 * Analyze a Web byte stream without first creating a second full-file buffer.
 *
 * The supplied size is a required admission limit, not a value inferred from
 * the stream. Pass trusted object-storage metadata or a validated
 * Content-Length value. bragi-audio reads until it has a 4 KiB detection prefix,
 * then replays each pulled chunk into music-metadata.
 */
export declare function analyzeWebStream(stream: ReadableStream<Uint8Array>, hints: StreamAudioHints, options?: AnalyzeOptions): Promise<AudioAnalysis>;
//# sourceMappingURL=analyze.d.ts.map