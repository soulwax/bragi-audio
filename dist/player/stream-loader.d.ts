/** Fetch and validate application-owned stream metadata, never media bytes. */
export interface StreamFailure {
    reason: string;
    requiresAuth: boolean;
}
export type StreamLoadResult<T> = {
    ok: true;
    data: T;
} | ({
    ok: false;
    status: number | null;
} & StreamFailure);
export interface StreamLoaderOptions<T> {
    url: (trackId: string) => string;
    /** Whitelist the fields safe to keep in player state. */
    parse: (body: unknown) => T | null;
    parseError?: (body: unknown, status: number) => StreamFailure;
    fetch?: typeof fetch;
    maxResponseBytes?: number;
}
export declare class StreamLoader<T> {
    private readonly options;
    constructor(options: StreamLoaderOptions<T>);
    load(trackId: string, signal?: AbortSignal): Promise<StreamLoadResult<T>>;
}
//# sourceMappingURL=stream-loader.d.ts.map