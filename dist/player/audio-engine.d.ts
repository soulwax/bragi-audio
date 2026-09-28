/**
 * Framework-agnostic owner of one `<audio>` element and its optional Web Audio
 * gain stage.
 *
 * The engine knows nothing about tracks, queues, or where a source URL comes
 * from: it plays a URL, reports what the element does, and applies a volume.
 * Reactive state, persistence, and fallbacks belong to the caller.
 *
 * Web Audio is only engaged when the caller allows it for a level above the
 * native 0..1 range. Routing an element through `createMediaElementSource`
 * makes iOS WebKit classify playback as ambient Web Audio, which it suspends
 * when the screen locks or the app is switched — so mobile callers must keep
 * `allowWebAudio` false.
 */
export interface AudioEngineEvents {
    /** The element reported a new playback position, seconds. */
    onTimeUpdate?: (currentTime: number) => void;
    /** A finite, positive duration became known, seconds. */
    onDuration?: (duration: number) => void;
    /** More media was downloaded; read {@link AudioEngine.bufferedPercent}. */
    onProgress?: () => void;
    onWaiting?: () => void;
    onPlaying?: () => void;
    onPlay?: () => void;
    onPause?: () => void;
    onEnded?: () => void;
    /** The element failed; `error` carries the browser's `MediaError` code and message. */
    onError?: (error: MediaError | null) => void;
    /** The page became visible again; the audio context has been resumed. */
    onWake?: () => void;
}
export interface AudioEngineOptions {
    /** Create the media element. Defaults to `new Audio()` where it exists. */
    createElement?: () => HTMLAudioElement | null;
    /** Create the Web Audio context for the headroom stage. */
    createContext?: () => AudioContext | null;
    /** Resume the context on tab wake and reconnect. Defaults to true in a browser. */
    lifecycle?: boolean;
    /** Time constant of the de-clicking gain ramp, seconds. */
    rampSeconds?: number;
}
export interface VolumeRequest {
    /** Effective linear level, already including any loudness normalisation. May exceed 1. */
    level: number;
    muted: boolean;
    /** Whether a level above 1 may be delivered through the Web Audio gain stage. */
    allowWebAudio: boolean;
}
/** Convert a ReplayGain adjustment in dB to a linear volume multiplier. */
export declare function replayGainToLinear(db: number): number;
export declare class AudioEngine {
    private audio;
    private audioContext;
    private mediaSourceNode;
    private gainNode;
    private lifecycleInstalled;
    private readonly events;
    private readonly createElement;
    private readonly createContext;
    private readonly lifecycle;
    private readonly rampSeconds;
    constructor(events?: AudioEngineEvents, options?: AudioEngineOptions);
    /** Create the element once. Returns whether an element is available. */
    init(): boolean;
    private installLifecycle;
    get hasElement(): boolean;
    get paused(): boolean;
    get currentTime(): number;
    get duration(): number;
    get currentSrc(): string;
    /** Resume a context the browser suspended (background tab, lock screen). */
    resume(): void;
    /** Point the element at a new source, optionally positioned. Does not start playback. */
    load(src: string, startAt?: number): void;
    /** Start playback. Resolves false when the browser refused (autoplay policy, bad source). */
    play(): Promise<boolean>;
    pause(): void;
    seek(seconds: number): void;
    /** Stop and release the current source while keeping the element for reuse. */
    unload(): void;
    /**
     * Percentage of the track buffered, measured at the range containing the
     * playhead (else the furthest range). `null` while the duration is unknown.
     */
    bufferedPercent(): number | null;
    /**
     * Apply an effective level. Native element volume is used whenever it can
     * express the level; the gain stage only carries levels above 1, and once
     * built it is parked at unity so native volume takes over again.
     */
    applyVolume({ level, muted, allowWebAudio }: VolumeRequest): void;
    private rampGain;
    private ensureAudioGraph;
    destroy(): void;
}
//# sourceMappingURL=audio-engine.d.ts.map