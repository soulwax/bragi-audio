/**
 * Build a strong entity tag from the parts that identify a representation.
 *
 * Pass everything that changes the bytes. For audio that is the track id
 * *and the delivered quality* — the URL does not encode quality, so without it a
 * preference change would be served stale bytes out of the browser cache.
 */
export declare function entityTag(...parts: (string | number)[]): string;
/** Does an `If-None-Match` / `If-Range` header list `tag` (or `*`)? */
export declare function matchesEntityTag(header: string | null, tag: string): boolean;
/**
 * A `Range` request may only be honoured when the client either sent no
 * `If-Range` or sent one naming the representation we are about to serve.
 * Otherwise it is holding a stale partial and must be given the whole body.
 */
export declare function rangeIsUsable(request: Request, tag: string): boolean;
export interface ByteRange {
    start: number;
    end: number;
}
/** Parse a single `bytes=` range against a known size. `null` = no/invalid range. */
export declare function parseByteRange(header: string | null | undefined, size: number): ByteRange | null;
//# sourceMappingURL=http-range.d.ts.map