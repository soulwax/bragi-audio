import { describe, expect, it, vi } from "vitest";
import { analyzeAudio } from "../../src/index.js";
import {
  AudioCodecError,
  decodeAudio,
  decodeWav,
  encodeWav,
} from "../../src/audio/index.js";

const pcm = {
  sampleRate: 48000,
  channels: [
    new Float32Array([-1, -0.5, 0, 0.5, 1]),
    new Float32Array([1, 0.5, 0, -0.5, -1]),
  ],
};

describe("WAV codecs", () => {
  it.each([16, 24, 32] as const)(
    "round trips stereo PCM at %s bits and is readable by an independent parser",
    async (bitDepth) => {
      const bytes = encodeWav(pcm, { bitDepth });
      const decoded = decodeWav(bytes);
      expect(decoded.sampleRate).toBe(48000);
      expect(decoded.channels).toHaveLength(2);
      for (let c = 0; c < 2; c++) {
        for (let i = 0; i < 5; i++)
          expect(decoded.channels[c]?.[i] ?? NaN).toBeCloseTo(
            pcm.channels[c]?.[i] ?? NaN,
            4,
          );
      }
      const metadata = await analyzeAudio(bytes);
      expect(metadata.format.sampleRate).toBe(48000);
      expect(metadata.format.channels).toBe(2);
    },
  );

  it("pads odd 24-bit mono data and respects a subarray's offset", () => {
    const bytes = encodeWav(
      { sampleRate: 44100, channels: [new Float32Array([-1])] },
      { bitDepth: 24 },
    );
    expect(bytes.byteLength).toBe(48);
    const padded = new Uint8Array(bytes.byteLength + 10);
    padded.set(bytes, 5);
    expect(decodeWav(padded.subarray(5, -5)).channels[0]).toEqual(
      new Float32Array([-1]),
    );
  });

  it("clips overloads without modifying the source PCM", () => {
    const channel = new Float32Array([-2, 2]);
    const decoded = decodeWav(
      encodeWav({ sampleRate: 48000, channels: [channel] }, { bitDepth: 32 }),
    );
    expect(decoded.channels[0]).toEqual(new Float32Array([-1, 1]));
    expect(channel).toEqual(new Float32Array([-2, 2]));
  });

  it("rejects malformed PCM, truncation and forged RIFF lengths", () => {
    expect(() =>
      encodeWav({ ...pcm, channels: [new Float32Array([NaN])] }),
    ).toThrow(AudioCodecError);
    expect(() =>
      encodeWav({
        ...pcm,
        channels: [pcm.channels[0] ?? new Float32Array(), new Float32Array(1)],
      }),
    ).toThrow(AudioCodecError);
    const bytes = encodeWav(pcm);
    expect(() => decodeWav(bytes.subarray(0, -1))).toThrow(AudioCodecError);
    new DataView(bytes.buffer).setUint32(4, 0xffffffff, true);
    expect(() => decodeWav(bytes)).toThrow(AudioCodecError);
  });

  it("enforces encoded and expanded PCM limits before allocation", () => {
    expect(() => encodeWav(pcm, { maxBytes: 10 })).toThrow(
      expect.objectContaining({ code: "size_limit" }),
    );
    const bytes = encodeWav(pcm, { bitDepth: 16 });
    expect(() => decodeWav(bytes, { maxBytes: 10 })).toThrow(
      expect.objectContaining({ code: "size_limit" }),
    );
    expect(() => decodeWav(bytes, { maxPcmBytes: 20 })).toThrow(
      expect.objectContaining({ code: "size_limit" }),
    );
  });
});

describe("native decode", () => {
  it("copies exactly the supplied view so native detachment preserves caller bytes", async () => {
    const source = new Uint8Array([99, 1, 2, 3, 99]);
    const buffer = {} as AudioBuffer;
    const decodeAudioData = vi.fn((bytes: ArrayBuffer) => {
      expect([...new Uint8Array(bytes)]).toEqual([1, 2, 3]);
      structuredClone(bytes, { transfer: [bytes] });
      return Promise.resolve(buffer);
    });
    await expect(
      decodeAudio(source.subarray(1, 4), { context: { decodeAudioData } }),
    ).resolves.toBe(buffer);
    expect([...source]).toEqual([99, 1, 2, 3, 99]);
  });

  it("does not start a decoder for oversized or already aborted input", async () => {
    const decodeAudioData = vi.fn(() => Promise.resolve({} as AudioBuffer));
    const bytes = new Uint8Array(5);
    await expect(
      decodeAudio(bytes, { context: { decodeAudioData }, maxInputBytes: 4 }),
    ).rejects.toMatchObject({ code: "size_limit" });
    await expect(
      decodeAudio(bytes, {
        context: { decodeAudioData },
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(decodeAudioData).not.toHaveBeenCalled();
  });

  it("discards a late decoded result when the caller aborts", async () => {
    const abort = new AbortController();
    const decodeAudioData = vi.fn(() => {
      abort.abort();
      return Promise.resolve({} as AudioBuffer);
    });
    await expect(
      decodeAudio(new Uint8Array([1]), {
        context: { decodeAudioData },
        signal: abort.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
