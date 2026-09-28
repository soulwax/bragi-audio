# syn.js

Bounded audio format detection, normalized music metadata, and a framework-agnostic browser
playback engine.

The package has two independent entry points:

- **`syn.js`** (server) identifies the real container from bytes and reads embedded metadata without
  coupling your application to parser-specific objects. It supports MP3, FLAC, raw AAC/ADTS,
  M4A/MP4, Ogg, WAV, and WebM. It does not decode, transcode, upload, store, or fetch audio.
- **`syn.js/player`** (browser) drives one `<audio>` element with a headroom-capable volume stage,
  and ships the pure pieces around it: queue identity and conflict rebasing, a playback self-check,
  a look-ahead preloader, and Media Session wiring. It has no dependencies, never imports the
  metadata parser, and does not know where your audio comes from.

> **Status:** `0.1.0` is an initial API. The package has not been published to npm yet.

## Install

```sh
pnpm add syn.js
```

Node 20 or newer and ESM are required.

## Analyze a file

```ts
import { analyzeAudio } from "syn.js";

const bytes = new Uint8Array(await file.arrayBuffer());
const analysis = await analyzeAudio(
  bytes,
  { fileName: file.name, mimeType: file.type, size: file.size },
  {
    maxFileBytes: 128 * 1024 * 1024,
    strictHints: true,
    includeArtwork: false,
  },
);

console.log(analysis.format.codec, analysis.tags.title, analysis.tags.artists);
```

Byte detection is authoritative. Filename and MIME values are untrusted hints: mismatches become
warnings by default or `AudioMetadataError` with code `hint_mismatch` in strict mode.

## Analyze a Web stream

```ts
import { analyzeWebStream } from "syn.js";

const analysis = await analyzeWebStream(upload.body, {
  fileName: upload.name,
  mimeType: upload.contentType,
  size: upload.contentLength,
});
```

`analyzeWebStream` reads until it has a 4 KiB detection prefix, then replays every pulled chunk to
the parser without concatenating the source into a second file-sized buffer. `size` is mandatory:
obtain it from trusted object-storage metadata or a validated `Content-Length`; it is the admission
limit used to reject oversized streams before they are read. This API accepts Web
`ReadableStream<Uint8Array>` values, including the streams exposed by modern server runtimes. It
does not accept arbitrary Node streams.

## Detect without parsing

```ts
import { AUDIO_ACCEPT, AUDIO_FORMATS, detectAudioFormat } from "syn.js";

const detected = detectAudioFormat(bytes);
console.log(detected?.contentType);
```

`AUDIO_ACCEPT` is suitable for a browser file input. It improves file selection but is never a
security boundary.

## Artwork and limits

Embedded artwork is disabled by default. Opt in with `includeArtwork`, `maxArtworkBytes`, and
`maxArtworkCount`. `maxArtworkBytes` is both the per-image and aggregate ceiling. Source files
default to a 128 MiB limit. Stream callers must pass a trusted size and the stream is stopped if it
emits more bytes than declared.

The parser runs in-process. `AbortSignal` is checked before reading and before returning, but it is
not a hard CPU timeout. Use a worker/process boundary if your threat model requires forced
termination.

## Browser playback (`syn.js/player`)

```ts
import { AudioEngine, replayGainToLinear } from "syn.js/player";

const engine = new AudioEngine({
  onTimeUpdate: (seconds) => render(seconds),
  onDuration: (seconds) => setDuration(seconds),
  onEnded: () => playNext(),
  onError: () => showFallback(),
});

engine.init();
engine.load("/audio/track-1", 0);
engine.applyVolume({
  level: 0.8 * replayGainToLinear(-3.2),
  muted: false,
  allowWebAudio: false,
});
if (!(await engine.play())) showFallback();
```

The engine owns the element and emits what it does; state, persistence, and fallbacks stay with the
caller. `play()` resolves `false` instead of rejecting when the browser refuses (autoplay policy,
unsupported source).

**Volume.** Native element volume carries every level it can express. A Web Audio gain stage is
built only when you pass `allowWebAudio: true` for a level above 1, and once built it is parked at
unity whenever native volume suffices. Keep `allowWebAudio` false on iOS/mobile: routing an element
through `createMediaElementSource` makes WebKit classify it as ambient Web Audio, which is suspended
when the screen locks.

The other exports are pure and framework-agnostic:

| Export                                                                                           | Purpose                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createQueueEntry`, `createQueueEntries`, `toDisplayTrack`, `isQueueEntryId`                     | Give each queue occurrence its own `entryId`, so a track can appear twice and still be moved or removed on its own. Generic over any `{ id: string }` track shape.                                           |
| `rebaseQueue`                                                                                    | Replay local queue commands (`append`, `prepend`, `remove`, `move`, `clear`, `replace`) onto an authoritative remote queue after a rejected write, within a length bound.                                    |
| `assessPlayback`                                                                                 | Compare the element's duration and delivered quality with the catalogue: returns `preview`, `short`, `long`, and `downgraded` issue codes for you to word. Pass `qualityRank` to enable downgrade detection. |
| `StreamPreloader`                                                                                | Look-ahead cache for per-track stream information. You supply `load(trackId)`; entries are handed out once and expire.                                                                                       |
| `updateMediaMetadata`, `updatePlaybackState`, `updatePositionState`, `setupMediaSessionHandlers` | Best-effort Media Session wiring that never throws where the API is missing.                                                                                                                                 |

Every module is safe to import during server-side rendering; nothing touches `window`, `document`,
or `navigator` until you call it.

## Supported versus playable

Support means that `syn.js` can identify the container and ask `music-metadata` to parse it. It does
not guarantee that Node, a browser, FFmpeg, or a particular device can decode the contained codec.
Always use `analysis.format.container` and `analysis.format.codec` for a separate playback or
processing decision.

## Development

```sh
pnpm install
pnpm check
```

Tests use tiny generated buffers. Do not add copyrighted recordings, private uploads, credentials,
or provider payloads as fixtures.

## License

MIT
