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

export type PlaybackIssue =
  | {
      code: "preview" | "short" | "long";
      actualSeconds: number;
      expectedSeconds: number;
    }
  | { code: "downgraded"; requestedQuality: string; deliveredQuality: string };

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

const SHORT_RATIO = 0.9;
const LONG_RATIO = 1.15;
const PREVIEW_RATIO = 0.6;
const PREVIEW_MAX_SECONDS = 45;
const LOSSLESS_CODECS = new Set(["flac", "alac"]);

function finitePositive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function normQuality(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().toUpperCase();
}

export function assessPlayback(
  input: PlaybackAssessmentInput,
  options: AssessPlaybackOptions = {},
): PlaybackAssessment {
  const expectedSeconds = finitePositive(input.expectedSeconds);
  const actualSeconds = finitePositive(input.actualSeconds);
  const requestedQuality = normQuality(input.requestedQuality);
  const deliveredQuality = normQuality(input.deliveredQuality);
  const lossless = LOSSLESS_CODECS.has(
    (input.codecs ?? "").trim().toLowerCase(),
  );
  const embed = input.mode === "embed";

  let length: PlaybackLengthVerdict = "unknown";
  let lengthRatio: number | null = null;
  let isLikelyPreview = false;

  if (expectedSeconds && actualSeconds) {
    lengthRatio = actualSeconds / expectedSeconds;
    if (lengthRatio < SHORT_RATIO) length = "short";
    else if (lengthRatio > LONG_RATIO) length = "long";
    else length = "match";
    isLikelyPreview =
      lengthRatio < PREVIEW_RATIO && actualSeconds <= PREVIEW_MAX_SECONDS;
  }

  const rank = options.qualityRank ?? {};
  const reqRank = requestedQuality != null ? rank[requestedQuality] : undefined;
  const delRank = deliveredQuality != null ? rank[deliveredQuality] : undefined;
  const downgraded = reqRank != null && delRank != null && delRank < reqRank;

  const issues: PlaybackIssue[] = [];
  if (!embed) {
    if (expectedSeconds && actualSeconds && length !== "match") {
      if (isLikelyPreview) {
        issues.push({ code: "preview", actualSeconds, expectedSeconds });
      } else if (length === "short" || length === "long") {
        issues.push({ code: length, actualSeconds, expectedSeconds });
      }
    }
    if (downgraded && requestedQuality && deliveredQuality) {
      issues.push({ code: "downgraded", requestedQuality, deliveredQuality });
    }
  }

  return {
    length,
    lengthRatio,
    expectedSeconds,
    actualSeconds,
    isLikelyPreview,
    requestedQuality,
    deliveredQuality,
    downgraded,
    lossless,
    issues,
    ok: issues.length === 0,
  };
}
