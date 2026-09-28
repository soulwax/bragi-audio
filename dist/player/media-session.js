/**
 * Best-effort Media Session wiring: lock-screen and Now Playing metadata,
 * hardware media keys, and the OS scrub bar. Every call is a no-op where the
 * API is missing and never throws.
 */
const ARTWORK_SIZES = ["96x96", "128x128", "192x192", "256x256", "512x512"];
const DEFAULT_SEEK_OFFSET_SECONDS = 10;
function mediaSession() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
        return null;
    }
    return navigator.mediaSession;
}
/**
 * Resolve a relative artwork path against the page origin. iOS WebKit's Now
 * Playing centre ignores relative artwork URLs.
 */
export function toAbsoluteArtworkUrl(url) {
    if (!url)
        return "";
    if (/^(https?:|blob:|data:)/.test(url))
        return url;
    const origin = typeof window === "undefined" ? undefined : window.location.origin;
    if (origin) {
        try {
            return new URL(url, origin).href;
        }
        catch {
            return url;
        }
    }
    return url;
}
/** Publish track metadata to the OS, or clear it with `null`. */
export function updateMediaMetadata(track, options = {}) {
    const session = mediaSession();
    if (!session)
        return;
    if (!track) {
        session.metadata = null;
        return;
    }
    const names = track.artists.map((a) => a.name).join(", ");
    const artist = names === "" ? (options.unknownArtist ?? "") : names;
    // An empty string is as absent as undefined here, so `??` would be wrong.
    const artworkUrl = toAbsoluteArtworkUrl([track.imageUrl, track.album?.imageUrl].find(Boolean) ?? "");
    const type = artworkUrl.toLowerCase().includes(".png")
        ? "image/png"
        : "image/jpeg";
    const artwork = artworkUrl
        ? ARTWORK_SIZES.map((sizes) => ({ src: artworkUrl, sizes, type }))
        : [];
    try {
        session.metadata = new MediaMetadata({
            title: track.title,
            artist,
            album: track.album?.title ?? "",
            artwork,
        });
    }
    catch {
        // Best-effort OS metadata registration.
    }
}
/** Publish whether playback is running. */
export function updatePlaybackState(isPlaying) {
    const session = mediaSession();
    if (!session)
        return;
    try {
        session.playbackState = isPlaying ? "playing" : "paused";
    }
    catch {
        // Best-effort.
    }
}
/** Publish position and duration for the OS scrub bar. Invalid values are ignored. */
export function updatePositionState(params) {
    const session = mediaSession();
    if (!session || !("setPositionState" in session))
        return;
    const { duration, position } = params;
    if (!Number.isFinite(duration) ||
        duration <= 0 ||
        !Number.isFinite(position) ||
        position < 0) {
        return;
    }
    try {
        session.setPositionState({
            duration,
            playbackRate: params.playbackRate ?? 1,
            position: Math.min(position, duration),
        });
    }
    catch {
        // Best-effort.
    }
}
/** Route hardware media keys and remote commands to the given handlers. */
export function setupMediaSessionHandlers(handlers) {
    const session = mediaSession();
    if (!session)
        return;
    const safeSet = (action, handler) => {
        try {
            session.setActionHandler(action, handler);
        }
        catch {
            // The action is not supported by this browser.
        }
    };
    safeSet("play", () => handlers.onPlay());
    safeSet("pause", () => handlers.onPause());
    safeSet("previoustrack", () => handlers.onPrevious());
    safeSet("nexttrack", () => handlers.onNext());
    safeSet("seekbackward", (details) => handlers.onSeekBackward?.(details.seekOffset ?? DEFAULT_SEEK_OFFSET_SECONDS));
    safeSet("seekforward", (details) => handlers.onSeekForward?.(details.seekOffset ?? DEFAULT_SEEK_OFFSET_SECONDS));
    safeSet("seekto", (details) => {
        if (details.seekTime != null)
            handlers.onSeekTo?.(details.seekTime);
    });
    safeSet("stop", () => handlers.onStop?.());
}
//# sourceMappingURL=media-session.js.map