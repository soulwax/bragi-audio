export interface AudioFetchOptions {
    fetchImpl?: typeof fetch;
    headers?: HeadersInit;
    signal?: AbortSignal;
    maxBytes?: number;
}
/** A cancellable, byte-bounded GET using Web Fetch, including Range/206 responses. */
export declare function fetchAudioStream(source: string | URL, options?: AudioFetchOptions): Promise<Response>;
/** Download permitted audio into memory. No filesystem or browser-save side effect. */
export declare function downloadAudio(source: string | URL, options?: AudioFetchOptions): Promise<Uint8Array<ArrayBuffer>>;
//# sourceMappingURL=download.d.ts.map