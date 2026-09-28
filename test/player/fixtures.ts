export interface TestTrack {
  kind: "track";
  id: string;
  title: string;
  artists: { id: string; name: string }[];
  album?: { id: string; title: string; imageUrl?: string };
  duration?: number;
  imageUrl?: string;
}

/** Index a fixture list, failing loudly instead of asserting non-null. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined)
    throw new Error(`No fixture at index ${String(index)}`);
  return item;
}
