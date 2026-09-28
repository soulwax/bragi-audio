/**
 * A self-check of what actually reached the media element against what the
 * catalogue promised: catches previews served as full tracks, truncated
 * streams, and silent quality downgrades.
 *
 * The result carries stable issue codes, never display text, so each consumer
 * can word and localise them.
 */
const SHORT_RATIO = 0.9;
const LONG_RATIO = 1.15;
const PREVIEW_RATIO = 0.6;
const PREVIEW_MAX_SECONDS = 45;
const LOSSLESS_CODECS = new Set(["flac", "alac"]);
function finitePositive(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : null;
}
function normQuality(value) {
    if (typeof value !== "string" || !value.trim())
        return null;
    return value.trim().toUpperCase();
}
export function assessPlayback(input, options = {}) {
    const expectedSeconds = finitePositive(input.expectedSeconds);
    const actualSeconds = finitePositive(input.actualSeconds);
    const requestedQuality = normQuality(input.requestedQuality);
    const deliveredQuality = normQuality(input.deliveredQuality);
    const lossless = LOSSLESS_CODECS.has((input.codecs ?? "").trim().toLowerCase());
    const embed = input.mode === "embed";
    let length = "unknown";
    let lengthRatio = null;
    let isLikelyPreview = false;
    if (expectedSeconds && actualSeconds) {
        lengthRatio = actualSeconds / expectedSeconds;
        if (lengthRatio < SHORT_RATIO)
            length = "short";
        else if (lengthRatio > LONG_RATIO)
            length = "long";
        else
            length = "match";
        isLikelyPreview =
            lengthRatio < PREVIEW_RATIO && actualSeconds <= PREVIEW_MAX_SECONDS;
    }
    const rank = options.qualityRank ?? {};
    const reqRank = requestedQuality != null ? rank[requestedQuality] : undefined;
    const delRank = deliveredQuality != null ? rank[deliveredQuality] : undefined;
    const downgraded = reqRank != null && delRank != null && delRank < reqRank;
    const issues = [];
    if (!embed) {
        if (expectedSeconds && actualSeconds && length !== "match") {
            if (isLikelyPreview) {
                issues.push({ code: "preview", actualSeconds, expectedSeconds });
            }
            else if (length === "short" || length === "long") {
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
//# sourceMappingURL=assessment.js.map