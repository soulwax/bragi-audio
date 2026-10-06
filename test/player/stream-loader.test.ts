import { describe, expect, it, vi } from "vitest";
import { StreamLoader } from "../../src/player/index.js";

function loader(fetchImpl: typeof fetch, maxResponseBytes?: number) {
  return new StreamLoader({
    url: (id) => `/streams/${encodeURIComponent(id)}`,
    parse(body) {
      if (
        !body ||
        typeof body !== "object" ||
        !("quality" in body) ||
        typeof body.quality !== "string"
      )
        return null;
      return { quality: body.quality };
    },
    fetch: fetchImpl,
    ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
  });
}

describe("StreamLoader", () => {
  it("encodes track IDs and keeps only validated metadata", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({ quality: "lossless", url: "https://private.test" }),
      ),
    );
    await expect(loader(fetchImpl).load("a/b")).resolves.toEqual({
      ok: true,
      data: { quality: "lossless" },
    });
    expect(fetchImpl).toHaveBeenCalledWith("/streams/a%2Fb", { signal: null });
  });

  it("rejects malformed successful bodies and preserves HTTP status for failed bodies", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not json"))
      .mockResolvedValueOnce(new Response("not json", { status: 403 }));
    const subject = loader(fetchImpl);
    await expect(subject.load("t")).resolves.toMatchObject({
      ok: false,
      reason: "invalid_response",
    });
    await expect(subject.load("t")).resolves.toMatchObject({
      ok: false,
      status: 403,
      requiresAuth: true,
    });
  });

  it("cancels bodies exceeding the response limit", async () => {
    const cancel = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(5));
            },
            cancel,
          }),
        ),
      ),
    );
    await expect(loader(fetchImpl, 4).load("t")).resolves.toMatchObject({
      ok: false,
      reason: "invalid_response",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("ignores an aborted response even when injected fetch ignores cancellation", async () => {
    const abort = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(() => {
      abort.abort();
      return Promise.resolve(Response.json({ quality: "high" }));
    });
    await expect(
      loader(fetchImpl).load("t", abort.signal),
    ).resolves.toMatchObject({ ok: false, reason: "aborted" });
  });
});
