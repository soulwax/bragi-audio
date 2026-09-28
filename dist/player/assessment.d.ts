/**
 * A self-check of what actually reached the media element against what the
 * catalogue promised: catches previews served as full tracks, truncated
 * streams, and silent quality downgrades.
 *
 * The result carries stable issue codes, never display text, so each consumer
 * can word and localise them.
 */
export type PlaybackLengthVerdict = "match" | "short" | "long" | "unknown";
export type PlaybackMode = "direct" | "embed";
export interface PlaybackAssessmentInput {
    /** Catalogue length, seconds. */
    expectedSeconds?: number | null;
    /** Media element duration once metadata has loaded, seconds. */
    actualSeconds?: number | null;
    /** Quality tier the caller asked the source for. */
    requestedQuality?: string | null;
    /** Quality tier the source said it delivered. */
    deliveredQuality?: string | null;
    /** Delivered codec (`flac`, `mp4a.40.2`, `eac3`, …). */
    codecs?: string | null;
    /** `embed` playback is a black box — length and quality cannot be asserted. */
    mode?: PlaybackMode;
}
export interface AssessPlaybackOptions {
    /**
     * Rank of each quality tier name (upper case), higher is better. Tiers
     * missing from the map are never reported as downgrades.
     */
    qualityRank?: Readonly<Record<string, number>>;
}
export type PlaybackIssue = {
    code: "preview" | "short" | "long";
    actualSeconds: number;
    expectedSeconds: number;
} | {
    code: "downgraded";
    requestedQuality: string;
    deliveredQuality: string;
};
export interface PlaybackAssessment {
    length: PlaybackLengthVerdict;
    /** `actualSeconds / expectedSeconds`, or `null` when either is unknown. */
    lengthRatio: number | null;
    expectedSeconds: number | null;
    actualSeconds: number | null;
    /** Stream is a fraction of the catalogue length and short in absolute terms. */
    isLikelyPreview: boolean;
    requestedQuality: string | null;
    deliveredQuality: string | null;
    /** Delivered tier ranks below the requested tier. */
    downgraded: boolean;
    lossless: boolean;
    /** At most one length issue, then an optional quality issue. Empty in embed mode. */
    issues: PlaybackIssue[];
    /** `true` when nothing is wrong. */
    ok: boolean;
}
export declare function assessPlayback(input: PlaybackAssessmentInput, options?: AssessPlaybackOptions): PlaybackAssessment;
//# sourceMappingURL=assessment.d.ts.map