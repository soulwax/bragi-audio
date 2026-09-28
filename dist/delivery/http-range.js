/**
 * Build a strong entity tag from the parts that identify a representation.
 *
 * Pass everything that changes the bytes. For audio that is the track id
 * *and the delivered quality* — the URL does not encode quality, so without it a
 * preference change would be served stale bytes out of the browser cache.
 */
export function entityTag(...parts) {
    return `"${parts.join("-")}"`;
}
/** Does an `If-None-Match` / `If-Range` header list `tag` (or `*`)? */
export function matchesEntityTag(header, tag) {
    return Boolean(header
        ?.split(",")
        .map((value) => value.trim())
        .some((value) => value === "*" || value === tag));
}
/**
 * A `Range` request may only be honoured when the client either sent no
 * `If-Range` or sent one naming the representation we are about to serve.
 * Otherwise it is holding a stale partial and must be given the whole body.
 */
export function rangeIsUsable(request, tag) {
    if (!request.headers.get("range"))
        return false;
    const ifRange = request.headers.get("if-range");
    return !ifRange || matchesEntityTag(ifRange, tag);
}
/** Parse a single `bytes=` range against a known size. `null` = no/invalid range. */
export function parseByteRange(header, size) {
    if (!header || !Number.isSafeInteger(size) || size <= 0)
        return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match)
        return null;
    const hasStart = (match[1] ?? "") !== "";
    const hasEnd = (match[2] ?? "") !== "";
    if (!hasStart && !hasEnd)
        return null;
    let start;
    let end;
    if (!hasStart) {
        // Suffix range: the final N bytes.
        const suffix = parseInt(match[2] ?? "", 10);
        if (!Number.isSafeInteger(suffix) || suffix <= 0)
            return null;
        start = Math.max(0, size - suffix);
        end = size - 1;
    }
    else {
        start = parseInt(match[1] ?? "", 10);
        end = hasEnd ? parseInt(match[2] ?? "", 10) : size - 1;
    }
    if (!Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= size)
        return null;
    return { start, end: Math.min(end, size - 1) };
}
//# sourceMappingURL=http-range.js.map