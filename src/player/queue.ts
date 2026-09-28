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
export type QueueCommand<T extends QueueTrack = QueueTrack> =
  | { type: "append"; entries: QueueEntry<T>[]; operationId?: string }
  | { type: "prepend"; entry: QueueEntry<T>; operationId?: string }
  | { type: "remove"; entryId: string; operationId?: string }
  | {
      type: "move";
      entryId: string;
      beforeEntryId?: string;
      afterEntryId?: string;
      operationId?: string;
    }
  | { type: "clear"; operationId?: string }
  | { type: "replace"; entries: QueueEntry<T>[]; operationId?: string };

const queueEntryIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** Whether a queue entry identifier is safe to use in client state and URLs. */
export function isQueueEntryId(value: unknown): value is string {
  return typeof value === "string" && queueEntryIdPattern.test(value);
}

/** Mint an opaque, client-safe identifier for one queue occurrence. */
export function mintQueueEntryId(): string {
  return `queue_${crypto.randomUUID()}`;
}

/** Attach a stable queue-occurrence identity to a track. */
export function createQueueEntry<T extends QueueTrack>(
  track: T,
  entryId: string = mintQueueEntryId(),
): QueueEntry<T> {
  if (!isQueueEntryId(entryId)) {
    throw new Error(
      "Queue entry IDs must contain only letters, numbers, underscores, or hyphens.",
    );
  }
  return { ...track, entryId };
}

/**
 * Drop the queue-occurrence identity when an entry leaves the queue (to become
 * the current track or enter history), so it cannot leak into persistence or
 * identity comparisons.
 */
export function toDisplayTrack<T extends QueueTrack>(
  entry: T | QueueEntry<T>,
): T {
  if (!("entryId" in entry)) return entry;
  const { entryId, ...track } = entry;
  void entryId;
  return track as unknown as T;
}

/**
 * Give each track in a list its own queue identity. The injected factory keeps
 * this deterministic in tests; it must return unique, safe IDs.
 */
export function createQueueEntries<T extends QueueTrack>(
  tracks: readonly T[],
  createId: QueueEntryIdFactory = mintQueueEntryId,
): QueueEntry<T>[] {
  const entryIds = new Set<string>();
  return tracks.map((track) => {
    const entryId = createId();
    if (entryIds.has(entryId)) {
      throw new Error("Queue entry IDs must be unique.");
    }
    entryIds.add(entryId);
    return createQueueEntry(track, entryId);
  });
}

function removeByEntryId<T extends QueueTrack>(
  queue: QueueEntry<T>[],
  entryId: string,
): QueueEntry<T> | null {
  if (!isQueueEntryId(entryId)) return null;
  const index = queue.findIndex((entry) => entry.entryId === entryId);
  return index === -1 ? null : (queue.splice(index, 1)[0] ?? null);
}

/** Reapply deliberate local queue commands to an authoritative remote queue. */
export function rebaseQueue<T extends QueueTrack>(
  remoteQueue: readonly QueueEntry<T>[],
  commands: readonly QueueCommand<T>[],
  maximumLength: number,
): QueueEntry<T>[] {
  let queue = remoteQueue.slice(0, maximumLength);

  for (const command of commands) {
    switch (command.type) {
      case "append": {
        const entryIds = new Set(queue.map((entry) => entry.entryId));
        queue.push(
          ...command.entries.filter((entry) => !entryIds.has(entry.entryId)),
        );
        break;
      }
      case "prepend":
        if (!queue.some((entry) => entry.entryId === command.entry.entryId)) {
          queue.unshift(command.entry);
        }
        break;
      case "remove":
        removeByEntryId(queue, command.entryId);
        break;
      case "move": {
        const entry = removeByEntryId(queue, command.entryId);
        if (!entry) break;
        if (command.beforeEntryId && isQueueEntryId(command.beforeEntryId)) {
          const before = queue.findIndex(
            (item) => item.entryId === command.beforeEntryId,
          );
          if (before !== -1) {
            queue.splice(before, 0, entry);
            break;
          }
        }
        if (command.afterEntryId && isQueueEntryId(command.afterEntryId)) {
          const after = queue.findIndex(
            (item) => item.entryId === command.afterEntryId,
          );
          if (after !== -1) {
            queue.splice(after + 1, 0, entry);
            break;
          }
        }
        queue.push(entry);
        break;
      }
      case "clear":
        queue = [];
        break;
      case "replace":
        queue = command.entries.slice();
        break;
    }
    queue = queue.slice(0, maximumLength);
  }

  return queue;
}
