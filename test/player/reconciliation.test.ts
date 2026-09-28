import { describe, expect, it } from "vitest";
import { createQueueEntries, rebaseQueue } from "../../src/player/queue.js";
import type { TestTrack as TrackSummary } from "./fixtures.js";
import { at } from "./fixtures.js";

const tracks = ["a", "b", "c", "d"].map(
  (id) =>
    ({
      kind: "track",
      id,
      title: id.toUpperCase(),
      artists: [{ id: "artist", name: "Artist" }],
    }) satisfies TrackSummary,
);

const queue = createQueueEntries(
  tracks,
  (() => {
    let sequence = 0;
    return () => `entry-${String(++sequence)}`;
  })(),
);

describe("rebaseQueue", () => {
  it("preserves a remote append and a local append after a stale write", () => {
    const rebased = rebaseQueue(
      [at(queue, 1)],
      [{ type: "append", entries: [at(queue, 0)] }],
      100,
    );
    expect(rebased.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("does not briefly duplicate an append already accepted before a restart", () => {
    const rebased = rebaseQueue(
      [at(queue, 1), at(queue, 0)],
      [{ type: "append", entries: [at(queue, 0)] }],
      100,
    );

    expect(rebased.map((entry) => entry.entryId)).toEqual([
      "entry-2",
      "entry-1",
    ]);
  });

  it("reapplies remove and anchored move commands to the returned queue", () => {
    const rebased = rebaseQueue(
      queue,
      [
        { type: "remove", entryId: "entry-2" },
        { type: "move", entryId: "entry-4", beforeEntryId: "entry-1" },
      ],
      100,
    );
    expect(rebased.map((entry) => entry.id)).toEqual(["d", "a", "c"]);
  });

  it("keeps an explicit clear intentional and enforces the queue bound", () => {
    const rebased = rebaseQueue(
      [at(queue, 0), at(queue, 1)],
      [{ type: "clear" }, { type: "append", entries: queue }],
      3,
    );
    expect(rebased.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("removes only the requested occurrence when duplicate tracks share a TIDAL ID", () => {
    const duplicates = createQueueEntries(
      [at(tracks, 0), at(tracks, 0), at(tracks, 1)],
      (() => {
        let sequence = 0;
        return () => `duplicate-${String(++sequence)}`;
      })(),
    );
    const first = at(duplicates, 0);
    const second = at(duplicates, 1);
    const following = at(duplicates, 2);
    const rebased = rebaseQueue(
      [first, second, following],
      [{ type: "remove", entryId: second.entryId }],
      100,
    );

    expect(rebased.map((entry) => entry.entryId)).toEqual([
      first.entryId,
      following.entryId,
    ]);
  });

  it("moves only the requested occurrence when duplicate tracks share a TIDAL ID", () => {
    const duplicates = createQueueEntries(
      [at(tracks, 0), at(tracks, 0), at(tracks, 1)],
      (() => {
        let sequence = 0;
        return () => `move-${String(++sequence)}`;
      })(),
    );
    const first = at(duplicates, 0);
    const second = at(duplicates, 1);
    const following = at(duplicates, 2);
    const rebased = rebaseQueue(
      [first, second, following],
      [
        {
          type: "move",
          entryId: second.entryId,
          beforeEntryId: first.entryId,
        },
      ],
      100,
    );

    expect(rebased.map((entry) => entry.entryId)).toEqual([
      second.entryId,
      first.entryId,
      following.entryId,
    ]);
  });
});
