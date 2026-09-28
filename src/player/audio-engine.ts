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

const DEFAULT_RAMP_SECONDS = 0.015;

/** Convert a ReplayGain adjustment in dB to a linear volume multiplier. */
export function replayGainToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function defaultElement(): HTMLAudioElement | null {
  return typeof Audio === "undefined" ? null : new Audio();
}

function defaultContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  // Older Safari only exposes the prefixed constructor.
  const scope = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioCtx = scope.AudioContext ?? scope.webkitAudioContext;
  return AudioCtx ? new AudioCtx() : null;
}

export class AudioEngine {
  private audio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private lifecycleInstalled = false;

  private readonly events: AudioEngineEvents;
  private readonly createElement: () => HTMLAudioElement | null;
  private readonly createContext: () => AudioContext | null;
  private readonly lifecycle: boolean;
  private readonly rampSeconds: number;

  constructor(
    events: AudioEngineEvents = {},
    options: AudioEngineOptions = {},
  ) {
    this.events = events;
    this.createElement = options.createElement ?? defaultElement;
    this.createContext = options.createContext ?? defaultContext;
    this.lifecycle = options.lifecycle ?? typeof document !== "undefined";
    this.rampSeconds = options.rampSeconds ?? DEFAULT_RAMP_SECONDS;
  }

  /** Create the element once. Returns whether an element is available. */
  init(): boolean {
    if (this.audio) return true;
    const audio = this.createElement();
    if (!audio) return false;
    this.audio = audio;
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");

    audio.addEventListener("timeupdate", () => {
      if (!Number.isNaN(audio.currentTime))
        this.events.onTimeUpdate?.(audio.currentTime);
    });
    const onMeta = () => {
      if (!Number.isNaN(audio.duration) && audio.duration > 0) {
        this.events.onDuration?.(audio.duration);
      }
    };
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("progress", () => this.events.onProgress?.());
    audio.addEventListener("waiting", () => this.events.onWaiting?.());
    audio.addEventListener("playing", () => this.events.onPlaying?.());
    audio.addEventListener("play", () => this.events.onPlay?.());
    audio.addEventListener("pause", () => this.events.onPause?.());
    audio.addEventListener("ended", () => this.events.onEnded?.());
    audio.addEventListener("error", () => this.events.onError?.(audio.error));

    this.installLifecycle();
    return true;
  }

  private installLifecycle(): void {
    if (!this.lifecycle || this.lifecycleInstalled) return;
    this.lifecycleInstalled = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      this.resume();
      this.events.onWake?.();
    });
    window.addEventListener("online", () => this.resume());
  }

  get hasElement(): boolean {
    return this.audio !== null;
  }

  get paused(): boolean {
    return !this.audio || this.audio.paused;
  }

  get currentTime(): number {
    return this.audio?.currentTime ?? 0;
  }

  get duration(): number {
    return this.audio?.duration ?? 0;
  }

  get currentSrc(): string {
    return this.audio?.currentSrc ?? "";
  }

  /** Resume a context the browser suspended (background tab, lock screen). */
  resume(): void {
    if (this.audioContext?.state === "suspended") {
      void this.audioContext.resume().catch(() => undefined);
    }
  }

  /** Point the element at a new source, optionally positioned. Does not start playback. */
  load(src: string, startAt = 0): void {
    if (!this.audio) return;
    this.audio.src = src;
    if (startAt > 0) {
      try {
        this.audio.currentTime = startAt;
      } catch {
        // The stream may not be seekable until metadata arrives.
      }
    }
  }

  /** Start playback. Resolves false when the browser refused (autoplay policy, bad source). */
  async play(): Promise<boolean> {
    if (!this.audio) return false;
    try {
      await this.audio.play();
      return true;
    } catch {
      return false;
    }
  }

  pause(): void {
    this.audio?.pause();
  }

  seek(seconds: number): void {
    if (!this.audio || Number.isNaN(seconds)) return;
    try {
      this.audio.currentTime = seconds;
    } catch {
      // Not seekable yet.
    }
  }

  /** Stop and release the current source while keeping the element for reuse. */
  unload(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.src = "";
  }

  /**
   * Percentage of the track buffered, measured at the range containing the
   * playhead (else the furthest range). `null` while the duration is unknown.
   */
  bufferedPercent(): number | null {
    const audio = this.audio;
    if (!audio?.duration || Number.isNaN(audio.duration)) return null;
    const buffered = audio.buffered;
    if (buffered.length === 0) return 0;
    const toPercent = (end: number) =>
      Math.min(100, Math.max(0, (end / audio.duration) * 100));
    const current = audio.currentTime;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= current && current <= buffered.end(i)) {
        return toPercent(buffered.end(i));
      }
    }
    return toPercent(buffered.end(buffered.length - 1));
  }

  /**
   * Apply an effective level. Native element volume is used whenever it can
   * express the level; the gain stage only carries levels above 1, and once
   * built it is parked at unity so native volume takes over again.
   */
  applyVolume({ level, muted, allowWebAudio }: VolumeRequest): void {
    const audio = this.audio;
    if (!audio) return;
    if (allowWebAudio) this.ensureAudioGraph();

    if (muted) {
      this.rampGain(0);
      audio.volume = 0;
      audio.muted = true;
      return;
    }

    if (this.gainNode && this.audioContext) {
      audio.volume = allowWebAudio ? 1 : Math.min(1, level);
      audio.muted = false;
      this.rampGain(allowWebAudio ? level : 1);
    } else {
      audio.volume = Math.max(0, Math.min(1, level));
      audio.muted = false;
    }
  }

  private rampGain(target: number): void {
    if (!this.gainNode || !this.audioContext) return;
    const time = this.audioContext.currentTime;
    this.gainNode.gain.cancelScheduledValues(time);
    this.gainNode.gain.setTargetAtTime(target, time, this.rampSeconds);
  }

  private ensureAudioGraph(): void {
    if (!this.audio || this.gainNode) return;
    try {
      this.audioContext ??= this.createContext();
      if (!this.audioContext) return;
      this.mediaSourceNode ??= this.audioContext.createMediaElementSource(
        this.audio,
      );
      this.gainNode = this.audioContext.createGain();
      this.mediaSourceNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
    } catch {
      // Web Audio is best-effort; native element volume still works.
    }
  }

  destroy(): void {
    this.unload();
    this.audio = null;
    if (this.audioContext && this.audioContext.state !== "closed") {
      void this.audioContext.close().catch(() => undefined);
    }
    this.audioContext = null;
    this.mediaSourceNode = null;
    this.gainNode = null;
  }
}
