import { describe, expect, it, vi } from "vitest";
import {
  AudioEngine,
  replayGainToLinear,
} from "../../src/player/audio-engine.js";

class FakeTimeRanges {
  constructor(private readonly ranges: [number, number][]) {}
  get length(): number {
    return this.ranges.length;
  }
  start(i: number): number {
    return this.ranges[i]?.[0] ?? NaN;
  }
  end(i: number): number {
    return this.ranges[i]?.[1] ?? NaN;
  }
}

class FakeElement {
  preload = "";
  src = "";
  currentSrc = "";
  paused = true;
  currentTime = 0;
  duration = NaN;
  volume = 1;
  muted = false;
  buffered = new FakeTimeRanges([]);
  attributes = new Map<string, string>();
  rejectPlay = false;
  error: { code: number; message: string } | null = null;
  private listeners = new Map<string, (() => void)[]>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  dispatch(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener();
  }
  play(): Promise<void> {
    if (this.rejectPlay) return Promise.reject(new Error("NotAllowedError"));
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

function fakeContext() {
  const gain = { cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() };
  const gainNode = { gain, connect: vi.fn() };
  const source = { connect: vi.fn() };
  const context = {
    currentTime: 4,
    state: "running",
    destination: {},
    createGain: vi.fn(() => gainNode),
    createMediaElementSource: vi.fn(() => source),
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  return { context, gain, source };
}

function setup(events = {}) {
  const element = new FakeElement();
  const { context, gain, source } = fakeContext();
  const createContext = vi.fn(() => context as unknown as AudioContext);
  const engine = new AudioEngine(events, {
    createElement: () => element as unknown as HTMLAudioElement,
    createContext,
    lifecycle: false,
  });
  engine.init();
  return { engine, element, context, gain, source, createContext };
}

describe("AudioEngine", () => {
  it("stays inert without an element", async () => {
    const engine = new AudioEngine(
      {},
      { createElement: () => null, lifecycle: false },
    );
    expect(engine.init()).toBe(false);
    expect(engine.hasElement).toBe(false);
    expect(engine.paused).toBe(true);
    expect(await engine.play()).toBe(false);
    expect(engine.bufferedPercent()).toBeNull();
    expect(() => {
      engine.load("/a");
      engine.seek(10);
      engine.applyVolume({ level: 1, muted: false, allowWebAudio: true });
      engine.unload();
    }).not.toThrow();
  });

  it("creates one inline, preloading element", () => {
    const { engine, element } = setup();
    expect(engine.init()).toBe(true);
    expect(element.preload).toBe("auto");
    expect(element.attributes.get("playsinline")).toBe("true");
    expect(element.attributes.get("webkit-playsinline")).toBe("true");
  });

  it("forwards element events and only reports usable durations", () => {
    const onTimeUpdate = vi.fn();
    const onDuration = vi.fn();
    const onEnded = vi.fn();
    const { element } = setup({ onTimeUpdate, onDuration, onEnded });

    element.currentTime = 12;
    element.dispatch("timeupdate");
    expect(onTimeUpdate).toHaveBeenCalledWith(12);

    element.dispatch("loadedmetadata");
    element.duration = 0;
    element.dispatch("durationchange");
    expect(onDuration).not.toHaveBeenCalled();
    element.duration = 200;
    element.dispatch("durationchange");
    expect(onDuration).toHaveBeenCalledWith(200);

    element.dispatch("ended");
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it("passes the element's MediaError to onError", () => {
    const onError = vi.fn();
    const { element } = setup({ onError });
    element.error = { code: 4, message: "MEDIA_ELEMENT_ERROR" };
    element.dispatch("error");
    expect(onError).toHaveBeenCalledWith({
      code: 4,
      message: "MEDIA_ELEMENT_ERROR",
    });
  });

  it("loads a source at a start position and reports refused playback", async () => {
    const { engine, element } = setup();
    engine.load("/api/tracks/1/audio", 30);
    expect(element.src).toBe("/api/tracks/1/audio");
    expect(element.currentTime).toBe(30);

    expect(await engine.play()).toBe(true);
    expect(engine.paused).toBe(false);

    element.paused = true;
    element.rejectPlay = true;
    expect(await engine.play()).toBe(false);
  });

  it("unloads the source but keeps the element", () => {
    const { engine, element } = setup();
    engine.load("/a");
    element.paused = false;
    engine.unload();
    expect(element.paused).toBe(true);
    expect(element.src).toBe("");
    expect(engine.hasElement).toBe(true);
  });

  it("measures the buffered range around the playhead", () => {
    const { engine, element } = setup();
    expect(engine.bufferedPercent()).toBeNull();
    element.duration = 200;
    expect(engine.bufferedPercent()).toBe(0);
    element.buffered = new FakeTimeRanges([
      [0, 50],
      [100, 150],
    ]);
    element.currentTime = 120;
    expect(engine.bufferedPercent()).toBe(75);
    element.currentTime = 70;
    expect(engine.bufferedPercent()).toBe(75);
    element.currentTime = 10;
    expect(engine.bufferedPercent()).toBe(25);
  });

  it("uses native volume and never builds a graph when Web Audio is not allowed", () => {
    const { engine, element, createContext } = setup();
    engine.applyVolume({ level: 1.4, muted: false, allowWebAudio: false });
    expect(createContext).not.toHaveBeenCalled();
    expect(element.volume).toBe(1);
    engine.applyVolume({ level: 0.3, muted: false, allowWebAudio: false });
    expect(element.volume).toBe(0.3);
  });

  it("carries headroom through the gain stage, then hands back to native volume", () => {
    const { engine, element, gain, source } = setup();
    engine.applyVolume({ level: 1.25, muted: false, allowWebAudio: true });
    expect(source.connect).toHaveBeenCalledOnce();
    expect(element.volume).toBe(1);
    expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(1.25, 4, 0.015);

    engine.applyVolume({ level: 0.5, muted: false, allowWebAudio: false });
    expect(element.volume).toBe(0.5);
    expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 4, 0.015);
  });

  it("mutes both the element and the gain stage", () => {
    const { engine, element, gain } = setup();
    engine.applyVolume({ level: 1.25, muted: false, allowWebAudio: true });
    engine.applyVolume({ level: 1.25, muted: true, allowWebAudio: true });
    expect(element.volume).toBe(0);
    expect(element.muted).toBe(true);
    expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 4, 0.015);
  });

  it("resumes a suspended context and closes it on destroy", () => {
    const { engine, context } = setup();
    engine.applyVolume({ level: 1.25, muted: false, allowWebAudio: true });
    context.state = "suspended";
    engine.resume();
    expect(context.resume).toHaveBeenCalledOnce();
    engine.destroy();
    expect(context.close).toHaveBeenCalledOnce();
    expect(engine.hasElement).toBe(false);
  });
});

describe("replayGainToLinear", () => {
  it("converts decibels to a linear multiplier", () => {
    expect(replayGainToLinear(0)).toBe(1);
    expect(replayGainToLinear(-6)).toBeCloseTo(0.501, 3);
    expect(replayGainToLinear(20)).toBeCloseTo(10, 10);
  });
});
