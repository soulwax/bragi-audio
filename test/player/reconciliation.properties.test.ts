import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { rebaseQueue } from "../../src/player/queue.js";
import type { QueueEntry as GenericQueueEntry } from "../../src/player/queue.js";
import type { TestTrack as TrackSummary } from "./fixtures.js";
import { at } from "./fixtures.js";

type QueueEntry = GenericQueueEntry<TrackSummary>;

// Arbitrary for generating valid TrackSummary objects
const trackSummaryArb: fc.Arbitrary<TrackSummary> = fc.record({
  kind: fc.constant("track" as const),
  id: fc.stringMatching(/^[a-zA-Z0-9_-]{1,16}$/),
  title: fc.string({ minLength: 1, maxLength: 30 }),
  artists: fc.array(
    fc.record({
      id: fc.stringMatching(/^[a-zA-Z0-9_-]{1,16}$/),
      name: fc.string({ minLength: 1, maxLength: 20 }),
    }),
    { minLength: 1, maxLength: 2 },
  ),
});

// Generator for unique QueueEntry items
function createUniqueQueueEntries(
  count: number,
  prefix = "entry",
): QueueEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: "track" as const,
    id: `track-${String(i)}`,
    title: `Track ${String(i)}`,
    artists: [{ id: `art-${String(i)}`, name: `Artist ${String(i)}` }],
    entryId: `${prefix}_${String(i)}_${Math.random().toString(36).slice(2, 8)}`,
  }));
}

// Arbitrary for generating queue entry with custom entryId
const queueEntryArb = (prefix = "q"): fc.Arbitrary<QueueEntry> =>
  fc
    .tuple(
      trackSummaryArb,
      fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,15}$/),
    )
    .map(([track, suffix]) => ({
      ...track,
      entryId: `${prefix}_${suffix}`,
    }));

describe("Queue Reconciliation Invariants (Property-Based Testing)", () => {
  it("Invariant 1: Bounded Length - resulting queue never exceeds maximumLength", () => {
    fc.assert(
      fc.property(
        fc.array(queueEntryArb("rem"), { maxLength: 50 }),
        fc.integer({ min: 1, max: 20 }),
        fc.array(
          fc.oneof(
            fc.record({
              type: fc.constant("append" as const),
              entries: fc.array(queueEntryArb("app"), { maxLength: 10 }),
            }),
            fc.record({
              type: fc.constant("prepend" as const),
              entry: queueEntryArb("prep"),
            }),
            fc.record({
              type: fc.constant("remove" as const),
              entryId: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,15}$/),
            }),
            fc.record({
              type: fc.constant("clear" as const),
            }),
          ),
          { maxLength: 20 },
        ),
        (remoteQueue, maxLen, commands) => {
          const result = rebaseQueue(remoteQueue, commands, maxLen);
          expect(result.length).toBeLessThanOrEqual(maxLen);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Invariant 2: Duplicate Track Independence - tracks sharing TIDAL id have distinct lifecycle", () => {
    fc.assert(
      fc.property(
        trackSummaryArb,
        fc.integer({ min: 2, max: 6 }),
        (sharedTrack, count) => {
          // Create multiple occurrences of the EXACT same TIDAL track, each with unique entryId
          const entries: QueueEntry[] = Array.from(
            { length: count },
            (_, idx) => ({
              ...sharedTrack,
              entryId: `dup_entry_${String(idx)}`,
            }),
          );

          // Pick one specific entry to remove
          const targetIndex = Math.floor(count / 2);
          const targetEntryId = at(entries, targetIndex).entryId;

          const rebased = rebaseQueue(
            entries,
            [{ type: "remove", entryId: targetEntryId }],
            100,
          );

          // Invariant: Exactly one occurrence was removed
          expect(rebased.length).toBe(count - 1);
          expect(rebased.some((e) => e.entryId === targetEntryId)).toBe(false);

          // Invariant: Other identical tracks remain in their original relative order
          const remainingEntryIds = rebased.map((e) => e.entryId);
          const expectedEntryIds = entries
            .filter((_, idx) => idx !== targetIndex)
            .map((e) => e.entryId);
          expect(remainingEntryIds).toEqual(expectedEntryIds);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Invariant 3: Clear Dominance - clear wipes all prior tracks and subsequent appends start fresh", () => {
    fc.assert(
      fc.property(
        fc.array(queueEntryArb("base"), { minLength: 1, maxLength: 20 }),
        fc.array(queueEntryArb("fresh"), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 5, max: 50 }),
        (initialQueue, freshEntries, maxLen) => {
          // 1. Clear at the end results in empty queue
          const clearedOnly = rebaseQueue(
            initialQueue,
            [{ type: "clear" }],
            maxLen,
          );
          expect(clearedOnly).toEqual([]);

          // 2. Clear followed by append only contains the fresh entries
          const clearAndAppend = rebaseQueue(
            initialQueue,
            [{ type: "clear" }, { type: "append", entries: freshEntries }],
            maxLen,
          );
          const expected = freshEntries.slice(0, maxLen);
          expect(clearAndAppend.map((e) => e.entryId)).toEqual(
            expected.map((e) => e.entryId),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Invariant 4: Non-existent Entry IDs are safe no-ops", () => {
    fc.assert(
      fc.property(
        fc.array(queueEntryArb("base"), { minLength: 1, maxLength: 15 }),
        fc.stringMatching(/^nonexistent_[a-z0-9]{6}$/),
        (baseQueue, nonexistentId) => {
          const afterRemove = rebaseQueue(
            baseQueue,
            [{ type: "remove", entryId: nonexistentId }],
            100,
          );
          expect(afterRemove.map((e) => e.entryId)).toEqual(
            baseQueue.map((e) => e.entryId),
          );

          const afterMove = rebaseQueue(
            baseQueue,
            [
              {
                type: "move",
                entryId: nonexistentId,
                beforeEntryId: "something",
              },
            ],
            100,
          );
          expect(afterMove.map((e) => e.entryId)).toEqual(
            baseQueue.map((e) => e.entryId),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Invariant 5: Relative Order Preservation - removing one entry preserves order of unaffected entries", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 15 }), (queueSize) => {
        const queue = createUniqueQueueEntries(queueSize, "seq");
        const removeIdx = Math.floor(queueSize / 2);
        const removeId = at(queue, removeIdx).entryId;

        const rebased = rebaseQueue(
          queue,
          [{ type: "remove", entryId: removeId }],
          100,
        );

        const expectedIds = queue
          .filter((_, i) => i !== removeIdx)
          .map((e) => e.entryId);
        expect(rebased.map((e) => e.entryId)).toEqual(expectedIds);
      }),
      { numRuns: 50 },
    );
  });
});
