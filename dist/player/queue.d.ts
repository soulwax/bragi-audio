/**
 * The minimum a queue needs to know about a track: a stable identifier. Any
 * richer display shape (title, artists, artwork) passes through untouched.
 */
export interface QueueTrack {
    readonly id: string;
}
/**
 * One occurrence of a track in a listening queue. `id` identifies the
 * recording; `entryId` identifies this occurrence, so the same recording can
 * deliberately appear more than once and still be moved or removed on its own.
 */
export type QueueEntry<T extends QueueTrack = QueueTrack> = T & {
    entryId: string;
};
export type QueueEntryIdFactory = () => string;
/**
 * Queue edits made after the last accepted snapshot, expressed as commands
 * rather than another full snapshot so a rejected write can be rebased onto an
 * authoritative remote queue instead of replacing it.
 */
export type QueueCommand<T extends QueueTrack = QueueTrack> = {
    type: "append";
    entries: QueueEntry<T>[];
    operationId?: string;
} | {
    type: "prepend";
    entry: QueueEntry<T>;
    operationId?: string;
} | {
    type: "remove";
    entryId: string;
    operationId?: string;
} | {
    type: "move";
    entryId: string;
    beforeEntryId?: string;
    afterEntryId?: string;
    operationId?: string;
} | {
    type: "clear";
    operationId?: string;
} | {
    type: "replace";
    entries: QueueEntry<T>[];
    operationId?: string;
};
/** Whether a queue entry identifier is safe to use in client state and URLs. */
export declare function isQueueEntryId(value: unknown): value is string;
/** Mint an opaque, client-safe identifier for one queue occurrence. */
export declare function mintQueueEntryId(): string;
/** Attach a stable queue-occurrence identity to a track. */
export declare function createQueueEntry<T extends QueueTrack>(track: T, entryId?: string): QueueEntry<T>;
/**
 * Drop the queue-occurrence identity when an entry leaves the queue (to become
 * the current track or enter history), so it cannot leak into persistence or
 * identity comparisons.
 */
export declare function toDisplayTrack<T extends QueueTrack>(entry: T | QueueEntry<T>): T;
/**
 * Give each track in a list its own queue identity. The injected factory keeps
 * this deterministic in tests; it must return unique, safe IDs.
 */
export declare function createQueueEntries<T extends QueueTrack>(tracks: readonly T[], createId?: QueueEntryIdFactory): QueueEntry<T>[];
/** Reapply deliberate local queue commands to an authoritative remote queue. */
export declare function rebaseQueue<T extends QueueTrack>(remoteQueue: readonly QueueEntry<T>[], commands: readonly QueueCommand<T>[], maximumLength: number): QueueEntry<T>[];
//# sourceMappingURL=queue.d.ts.map