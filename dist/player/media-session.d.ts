/**
 * Best-effort Media Session wiring: lock-screen and Now Playing metadata,
 * hardware media keys, and the OS scrub bar. Every call is a no-op where the
 * API is missing and never throws.
 */
export interface MediaSessionTrack {
    title: string;
    artists: readonly {
        name: string;
    }[];
    album?: {
        title?: string;
        imageUrl?: string;
    } | undefined;
    imageUrl?: string | undefined;
}
export interface MediaMetadataOptions {
    /** Shown when a track has no artists. Defaults to an empty string. */
    unknownArtist?: string;
}
export interface MediaSessionHandlers {
    onPlay: () => void;
    onPause: () => void;
    onPrevious: () => void;
    onNext: () => void;
    onSeekBackward?: (seconds: number) => void;
    onSeekForward?: (seconds: number) => void;
    onSeekTo?: (time: number) => void;
    onStop?: () => void;
}
/**
 * Resolve a relative artwork path against the page origin. iOS WebKit's Now
 * Playing centre ignores relative artwork URLs.
 */
export declare function toAbsoluteArtworkUrl(url: string): string;
/** Publish track metadata to the OS, or clear it with `null`. */
export declare function updateMediaMetadata(track: MediaSessionTrack | null, options?: MediaMetadataOptions): void;
/** Publish whether playback is running. */
export declare function updatePlaybackState(isPlaying: boolean): void;
/** Publish position and duration for the OS scrub bar. Invalid values are ignored. */
export declare function updatePositionState(params: {
    duration: number;
    position: number;
    playbackRate?: number;
}): void;
/** Route hardware media keys and remote commands to the given handlers. */
export declare function setupMediaSessionHandlers(handlers: MediaSessionHandlers): void;
//# sourceMappingURL=media-session.d.ts.map