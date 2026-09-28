# bragi-audio

Audio metadata, browser playback, bounded streaming and downloads, and PCM/WAV codecs.

The package works independently of Syn, SvelteKit, TIDAL, databases, object storage, and application
configuration. It exposes four independent entry points:

- **`bragi-audio`** identifies containers and reads normalized embedded metadata through `music-metadata`.
- **`bragi-audio/player`** owns a native audio element, temporary Blob sources, volume, queue helpers,
  Media Session, metadata loading, and look-ahead preloading. No runtime dependencies.
- **`bragi-audio/delivery`** streams and downloads audio with Web Fetch, bounded reads, transient retries,
  cancellation, and HTTP range helpers. No runtime dependencies or filesystem access.
- **`bragi-audio/audio`** encodes and decodes mono/stereo PCM WAV and delegates other complete-file
  decoding to a caller-supplied browser audio context. No runtime dependencies.

Only importing the root entry loads the metadata parser. Import the subpath you need.

The public npm name is `bragi-audio`; the source repository remains `soulwax/syn.js`.

## Install

```sh
pnpm add bragi-audio
```

Node 20.19 or newer and ESM are required.

## Analyze a file

```ts
import { analyzeAudio } from "bragi-audio";

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
import { analyzeWebStream } from "bragi-audio";

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
import { AUDIO_ACCEPT, AUDIO_FORMATS, detectAudioFormat } from "bragi-audio";

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

## Browser playback (`bragi-audio/player`)

```ts
import { AudioEngine, replayGainToLinear } from "bragi-audio/player";

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

The supporting exports are framework-agnostic:

| Export                                                                                           | Purpose                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createQueueEntry`, `createQueueEntries`, `toDisplayTrack`, `isQueueEntryId`                     | Give each queue occurrence its own `entryId`, so a track can appear twice and still be moved or removed on its own. Generic over any `{ id: string }` track shape.                                           |
| `rebaseQueue`                                                                                    | Replay local queue commands (`append`, `prepend`, `remove`, `move`, `clear`, `replace`) onto an authoritative remote queue after a rejected write, within a length bound.                                    |
| `assessPlayback`                                                                                 | Compare the element's duration and delivered quality with the catalogue: returns `preview`, `short`, `long`, and `downgraded` issue codes for you to word. Pass `qualityRank` to enable downgrade detection. |
| `StreamLoader`                                                                                   | Fetch, bound, and validate application-owned stream metadata with injected URL and parsing callbacks; returns typed success/failure results.                                                                 |
| `StreamPreloader`                                                                                | Look-ahead cache for per-track stream information. You supply `load(trackId)`; entries are handed out once and expire.                                                                                       |
| `updateMediaMetadata`, `updatePlaybackState`, `updatePositionState`, `setupMediaSessionHandlers` | Best-effort Media Session wiring that never throws where the API is missing.                                                                                                                                 |

Every module is safe to import during server-side rendering; nothing touches `window`, `document`,
or `navigator` until you call it.

## Streaming and downloading (`bragi-audio/delivery`)

```ts
import { fetchAudioStream, downloadAudio } from "bragi-audio/delivery";

// Streaming honors backpressure; cancelling the body cancels the upstream request.
const response = await fetchAudioStream(
  "https://your-service.example/audio/1",
  {
    signal: controller.signal,
    maxBytes: 128 * 1024 * 1024,
    headers: { Range: "bytes=0-" },
  },
);
await response.body!.pipeTo(destination);

// Complete permitted audio in memory; no automatic save, upload, or durable cache.
const bytes = await downloadAudio("https://your-service.example/audio/1");
```

Both methods use an injectable `fetchImpl`, preserve successful HTTP status and response headers,
retry safe reads on transient failures, and enforce the byte limit even without `Content-Length`.
`downloadAudio` holds the complete file in memory; use `fetchAudioStream` and `pipeTo` for large
transfers. `parseByteRange`, `entityTag`, `matchesEntityTag`, `rangeIsUsable`, and
`withTransientRetry` are also available for server delivery adapters.

The caller supplies an authorized media source and any required headers. Provider authentication,
DRM, DASH/HLS manifest resolution and segment assembly are outside this release. Browser Fetch
still follows CORS. Keep provider credentials and private media URLs on your server.

## Encoding and decoding (`bragi-audio/audio`)

```ts
import { encodeWav, decodeWav, decodeAudio } from "bragi-audio/audio";
import { AudioEngine } from "bragi-audio/player";

const wav = encodeWav(
  { sampleRate: 48000, channels: [left, right] },
  { bitDepth: 24 },
);
const pcm = decodeWav(wav);
const engine = new AudioEngine();
engine.loadBlob(new Blob([wav], { type: "audio/wav" }));
await engine.play();
engine.destroy(); // releases temporary URLs and listeners

// Browser-supported codecs: MP3/AAC/FLAC/etc. support depends on the browser.
const decoded = await decodeAudio(bytes, {
  context: new OfflineAudioContext(2, 1, 48000),
});
```

`encodeWav` writes signed PCM16/PCM24 or float32 WAV, interleaves mono/stereo channels, clips
samples outside -1..1, and preserves the sample rate and caller data. `decodeWav` supports these
same formats, skips unknown RIFF chunks, and validates chunk lengths, alignment and finite samples.
Encoded and expanded PCM allocations default to 128 MiB limits (`maxBytes`, `maxPcmBytes`).
`AudioCodecError` provides stable error codes.

`decodeAudio` copies the supplied view so native input detachment cannot damage the caller's bytes.
It uses complete files, resamples to the supplied context, and enforces `maxInputBytes`. Its optional
`signal` prevents starting or returning aborted work; the native decode operation itself cannot be
interrupted and its decoded-memory use is browser-owned. It creates no playback graph. Native
streaming playback continues to use the media element rather than decoding a full track in memory.
The encoder currently outputs WAV; compressed MP3/AAC/FLAC encoding is outside this release.

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
