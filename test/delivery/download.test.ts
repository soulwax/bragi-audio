import { describe, expect, it, vi } from "vitest";
import { downloadAudio, fetchAudioStream } from "../../src/delivery/index.js";

describe("audio fetching", () => {
  it("downloads through an injected fetch without filesystem or framework state", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(new Uint8Array([1, 2, 3]))),
    );
    expect(
      await downloadAudio("https://audio.test/one", { fetchImpl }),
    ).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it("forwards Range headers and preserves partial-response metadata", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(new Uint8Array([2, 3]), {
          status: 206,
          headers: { "content-range": "bytes 1-2/3" },
        }),
      ),
    );
    const response = await fetchAudioStream("https://audio.test/one", {
      fetchImpl,
      headers: { Range: "bytes=1-2" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1-2/3");
    expect(
      new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get("range"),
    ).toBe("bytes=1-2");
    expect((await response.arrayBuffer()).byteLength).toBe(2);
  });

  it("cancels a declared oversized body before downloading it", async () => {
    const cancel = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(new ReadableStream({ cancel }), {
          headers: { "content-length": "100" },
        }),
      ),
    );
    await expect(
      downloadAudio("https://audio.test/one", { fetchImpl, maxBytes: 5 }),
    ).rejects.toThrow("download byte limit");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("limits bytes even when Content-Length is absent", async () => {
    const cancel = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(10));
            },
            cancel,
          }),
        ),
      ),
    );
    await expect(
      downloadAudio("https://audio.test/one", { fetchImpl, maxBytes: 5 }),
    ).rejects.toThrow("download byte limit");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels upstream reads when a streaming consumer stops", async () => {
    const cancel = vi.fn();
    let signal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      signal = init?.signal;
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1]));
            },
            cancel,
          }),
        ),
      );
    });
    const response = await fetchAudioStream("https://audio.test/one", {
      fetchImpl,
    });
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
  });
});
