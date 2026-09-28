# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-28

### Added

- `syn.js/delivery` for cancellable, bounded Web Fetch streaming/downloads and HTTP range/retry helpers.
- `syn.js/audio` for mono/stereo PCM16, PCM24 and float32 WAV encoding/decoding and caller-owned native browser decoding.
- `StreamLoader` for bounded, validated application-owned stream metadata.
- `AudioEngine.loadBlob` for temporary sources, with object-URL and listener cleanup on destruction.
- `syn.js/player`, a dependency-free browser entry point: `AudioEngine` (one `<audio>` element with
  an opt-in, de-clicked Web Audio headroom stage), `replayGainToLinear`, queue identity and
  `rebaseQueue`, `assessPlayback` with stable issue codes, `StreamPreloader`, and Media Session
  helpers.
- `analyzeWebStream` for bounded metadata inspection of Web byte streams with required trusted size
  metadata, container detection, and prefix replay into the parser.

### Changed

- Declare the package its own pnpm workspace root, so pnpm run inside a parent checkout's submodule
  no longer installs the parent project.
- Strict hint validation now rejects unknown filename extensions and non-generic MIME declarations.
- Commit distributable output so Syn can consume the checked submodule before the first npm release.

## [0.1.0] - 2026-09-22

### Added

- Byte-based detection for MP3, FLAC, AAC/ADTS, M4A/MP4, Ogg, WAV, and WebM.
- Bounded metadata analysis with normalized tags and technical audio properties.
- Structured mismatch warnings and stable error codes.
- Opt-in, bounded embedded artwork extraction.

[Unreleased]: https://github.com/soulwax/syn.js/compare/v0.2.0...HEAD
[0.1.0]: https://github.com/soulwax/syn.js/releases/tag/v0.1.0
[0.2.0]: https://github.com/soulwax/syn.js/releases/tag/v0.2.0
