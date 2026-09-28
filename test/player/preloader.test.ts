import { describe, expect, it, vi } from "vitest";
import { StreamPreloader } from "../../src/player/preloader.js";

interface Info {
  quality: string;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("StreamPreloader", () => {
  it("returns null when nothing was preloaded", async () => {
    const preloader = new StreamPreloader<Info>({
      load: () => Promise.resolve(null),
    });
    expect(preloader.consume("missing")).toBeNull();
    expect(await preloader.getOrAwait("missing")).toBeNull();
  });

  it("hands a preloaded entry out exactly once", async () => {
    const load = vi.fn(() => Promise.resolve({ quality: "LOSSLESS" }));
    const preloader = new StreamPreloader<Info>({ load });

    preloader.preload("t1");
    expect(await preloader.getOrAwait("t1")).toEqual({ quality: "LOSSLESS" });
    expect(preloader.consume("t1")).toBeNull();
    expect(load).toHaveBeenCalledWith("t1");
  });

  it("deduplicates concurrent and fresh preloads", async () => {
    const load = vi.fn(() => Promise.resolve({ quality: "HIGH" }));
    const preloader = new StreamPreloader<Info>({ load });

    preloader.preload("t1");
    preloader.preload("t1");
    await preloader.getOrAwait("t1");
    preloader.preload("t2");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    preloader.preload("t2");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("expires entries after the TTL", async () => {
    let now = 1_000;
    const preloader = new StreamPreloader<Info>({
      load: () => Promise.resolve({ quality: "HIGH" }),
      ttlMs: 100,
      now: () => now,
    });
    preloader.preload("t1");
    await flush();
    now += 101;
    expect(preloader.consume("t1")).toBeNull();
  });

  it("evicts the oldest entry beyond the limit", async () => {
    const preloader = new StreamPreloader<Info>({
      load: (id) => Promise.resolve({ quality: id }),
      maxEntries: 2,
    });
    for (const id of ["a", "b", "c"]) preloader.preload(id);
    await flush();
    expect(preloader.consume("a")).toBeNull();
    expect(preloader.consume("b")).toEqual({ quality: "b" });
    expect(preloader.consume("c")).toEqual({ quality: "c" });
  });

  it("swallows loader failures, including synchronous throws", async () => {
    const preloader = new StreamPreloader<Info>({
      load: (id) => {
        if (id === "sync") throw new Error("boom");
        return Promise.reject(new Error("offline"));
      },
    });
    expect(() => preloader.preload("sync")).not.toThrow();
    preloader.preload("async");
    expect(await preloader.getOrAwait("sync")).toBeNull();
    expect(await preloader.getOrAwait("async")).toBeNull();
  });

  it("does not let a request from before clear() repopulate the cache", async () => {
    const pending = deferred<Info | null>();
    const preloader = new StreamPreloader<Info>({
      load: () => pending.promise,
    });

    preloader.preload("t1");
    preloader.clear();
    pending.resolve({ quality: "HIGH" });
    await flush();

    expect(preloader.consume("t1")).toBeNull();
  });
});
