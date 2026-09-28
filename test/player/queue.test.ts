import { describe, expect, it } from "vitest";
import {
  createQueueEntries,
  createQueueEntry,
  isQueueEntryId,
  mintQueueEntryId,
} from "../../src/player/queue.js";
import type { TestTrack as TrackSummary } from "./fixtures.js";

const track = {
  kind: "track",
  id: "track-1",
  title: "Track one",
  artists: [{ id: "artist-1", name: "Artist One" }],
} satisfies TrackSummary;

describe("queue entries", () => {
  it("mints a unique, safe identity for every legacy queue occurrence", () => {
    const entries = createQueueEntries(
      [track, track],
      (() => {
        let sequence = 0;
        return () => `legacy-${String(++sequence)}`;
      })(),
    );

    expect(entries).toMatchObject([
      { id: "track-1", entryId: "legacy-1" },
      { id: "track-1", entryId: "legacy-2" },
    ]);
  });

  it("creates only safe entry identifiers", () => {
    expect(isQueueEntryId(mintQueueEntryId())).toBe(true);
    expect(isQueueEntryId("entry_123-safe")).toBe(true);
    expect(isQueueEntryId("../unsafe id")).toBe(false);
  });

  it("rejects unsafe or duplicate identities at the conversion boundary", () => {
    expect(() => createQueueEntry(track, "unsafe id")).toThrow(
      "Queue entry IDs",
    );
    expect(() =>
      createQueueEntries([track, track], () => "same-entry"),
    ).toThrow("unique");
  });
});
