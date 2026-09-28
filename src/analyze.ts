import { parseBuffer, parseWebStream } from "music-metadata";
import { AudioMetadataError } from "./errors.js";
import {
  detectAudioFormat,
  findAudioFormatByExtension,
  findAudioFormatByMimeType,
} from "./formats.js";
import {
  normalizeMetadata,
  type AudioAnalysis,
  type AudioWarning,
} from "./metadata.js";

export type AudioInput = Uint8Array | ArrayBuffer | Blob;

export interface AudioHints {
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly size?: number;
}

/**
 * Metadata supplied alongside a byte stream.
 *
 * A stream has no intrinsic length, so callers must provide a trustworthy byte
 * count (for example, object-storage metadata or a validated Content-Length).
 * It lets bragi-audio reject oversized uploads before reading them.
 */
export interface StreamAudioHints extends AudioHints {
  readonly size: number;
}

export interface AnalyzeOptions {
  readonly maxFileBytes?: number;
  readonly strictHints?: boolean;
  readonly includeArtwork?: boolean;
  readonly maxArtworkBytes?: number;
  readonly maxArtworkCount?: number;
  readonly duration?: boolean;
  readonly signal?: AbortSignal;
}

const DEFAULT_MAX_FILE_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_ARTWORK_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_ARTWORK_COUNT = 4;
const FORMAT_HEADER_BYTES = 4096;

function positiveLimit(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return resolved;
}

function abortIfNeeded(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AudioMetadataError("aborted", "Audio analysis was aborted.", {
      cause: signal.reason,
    });
  }
}

async function bytesFrom(
  input: AudioInput,
  maxFileBytes: number,
): Promise<Uint8Array> {
  const knownSize = input instanceof Blob ? input.size : input.byteLength;
  if (knownSize === 0)
    throw new AudioMetadataError("empty_input", "Audio input is empty.");
  if (knownSize > maxFileBytes) {
    throw new AudioMetadataError(
      "file_too_large",
      "Audio input exceeds the configured size limit.",
    );
  }
  if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer());
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

function hintWarnings(
  detectedId: string,
  hints: AudioHints | undefined,
): readonly AudioWarning[] {
  const warnings: AudioWarning[] = [];
  const declaredMimeType = hints?.mimeType
    ?.trim()
    .toLowerCase()
    .split(";", 1)[0];
  const mimeFormat = hints?.mimeType
    ? findAudioFormatByMimeType(hints.mimeType)
    : null;
  if (
    declaredMimeType &&
    declaredMimeType !== "application/octet-stream" &&
    mimeFormat?.id !== detectedId
  ) {
    warnings.push({
      code: "mime_mismatch",
      message:
        "The declared MIME type does not match the detected audio format.",
    });
  }
  const fileName = hints?.fileName?.trim() ?? "";
  const extensionFormat = fileName
    ? findAudioFormatByExtension(fileName)
    : null;
  const extension = fileName.split(".").at(-1);
  const hasExtension = Boolean(extension && extension !== fileName);
  if (hasExtension && extensionFormat?.id !== detectedId) {
    warnings.push({
      code: "extension_mismatch",
      message:
        "The filename extension does not match the detected audio format.",
    });
  }
  return warnings;
}

function parserOptions(
  options: AnalyzeOptions,
  detectedContentType: string,
  size: number,
  fileName: string | undefined,
) {
  return [
    {
      mimeType: detectedContentType,
      size,
      ...(fileName ? { path: fileName } : {}),
    },
    {
      duration: options.duration ?? true,
      skipCovers: !(options.includeArtwork ?? false),
    },
  ] as const;
}

function validateHints(
  detectedId: string,
  hints: AudioHints | undefined,
  strictHints: boolean | undefined,
): readonly AudioWarning[] {
  const warnings = hintWarnings(detectedId, hints);
  if (strictHints && warnings.length > 0) {
    throw new AudioMetadataError(
      "hint_mismatch",
      "Declared audio hints do not match the detected format.",
    );
  }
  return warnings;
}

function requireStreamSize(
  hints: StreamAudioHints,
  maxFileBytes: number,
): number {
  if (!Number.isSafeInteger(hints.size) || hints.size < 0) {
    throw new AudioMetadataError(
      "hint_mismatch",
      "The declared stream size must be a non-negative safe integer.",
    );
  }
  if (hints.size === 0) {
    throw new AudioMetadataError("empty_input", "Audio input is empty.");
  }
  if (hints.size > maxFileBytes) {
    throw new AudioMetadataError(
      "file_too_large",
      "Audio input exceeds the configured size limit.",
    );
  }
  return hints.size;
}

async function readFormatHeader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  declaredSize: number,
  signal: AbortSignal | undefined,
): Promise<readonly Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  let readBytes = 0;

  while (readBytes < FORMAT_HEADER_BYTES) {
    abortIfNeeded(signal);
    const { done, value } = await reader.read();
    if (done) break;
    readBytes += value.byteLength;
    if (readBytes > declaredSize) {
      await cancelReader(reader, "Stream exceeds its declared size.");
      throw new AudioMetadataError(
        "hint_mismatch",
        "The stream exceeds its declared size.",
      );
    }
    chunks.push(value);
  }

  return chunks;
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: unknown,
): Promise<void> {
  try {
    await reader.cancel(reason);
  } catch {
    // Preserve the original analysis failure when the source is already errored.
  }
}

function joinChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function replayStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  prefix: readonly Uint8Array[],
  declaredSize: number,
  signal: AbortSignal | undefined,
): ReadableStream<Uint8Array> {
  let prefixIndex = 0;
  let emittedBytes = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        abortIfNeeded(signal);
        const next =
          prefixIndex < prefix.length
            ? prefix[prefixIndex++]
            : (await reader.read()).value;
        if (!next) {
          controller.close();
          return;
        }
        emittedBytes += next.byteLength;
        if (emittedBytes > declaredSize) {
          throw new AudioMetadataError(
            "hint_mismatch",
            "The stream exceeds its declared size.",
          );
        }
        controller.enqueue(next);
      } catch (cause) {
        await cancelReader(reader, cause);
        controller.error(cause);
      }
    },
    async cancel(reason) {
      await cancelReader(reader, reason);
    },
  });
}

function assertAudioProperties(
  parsed: Awaited<ReturnType<typeof parseBuffer>>,
): void {
  const hasAudioProperties =
    Boolean(parsed.format.codec) ||
    (parsed.format.sampleRate ?? 0) > 0 ||
    (parsed.format.numberOfChannels ?? 0) > 0 ||
    (parsed.format.bitrate ?? 0) > 0;
  if (!hasAudioProperties) {
    throw new AudioMetadataError(
      "malformed_audio",
      "The file has no parseable audio stream.",
    );
  }
}

function parseFailure(cause: unknown): never {
  if (cause instanceof AudioMetadataError) throw cause;
  if (cause instanceof Error) {
    throw new AudioMetadataError(
      "malformed_audio",
      "The audio file could not be parsed.",
      { cause },
    );
  }
  throw new AudioMetadataError(
    "parser_failure",
    "The metadata parser failed unexpectedly.",
  );
}

export async function analyzeAudio(
  input: AudioInput,
  hints?: AudioHints,
  options: AnalyzeOptions = {},
): Promise<AudioAnalysis> {
  const maxFileBytes = positiveLimit(
    options.maxFileBytes,
    DEFAULT_MAX_FILE_BYTES,
    "maxFileBytes",
  );
  const maxArtworkBytes = positiveLimit(
    options.maxArtworkBytes,
    DEFAULT_MAX_ARTWORK_BYTES,
    "maxArtworkBytes",
  );
  const maxArtworkCount = positiveLimit(
    options.maxArtworkCount,
    DEFAULT_MAX_ARTWORK_COUNT,
    "maxArtworkCount",
  );
  abortIfNeeded(options.signal);
  const bytes = await bytesFrom(input, maxFileBytes);
  abortIfNeeded(options.signal);

  if (hints?.size !== undefined && hints.size !== bytes.byteLength) {
    throw new AudioMetadataError(
      "hint_mismatch",
      "The declared size does not match the audio input.",
    );
  }

  const detected = detectAudioFormat(bytes);
  if (!detected) {
    throw new AudioMetadataError(
      "unsupported_format",
      "The audio format is not supported.",
    );
  }

  const warnings = validateHints(detected.id, hints, options.strictHints);

  try {
    const parsed = await parseBuffer(
      bytes,
      ...parserOptions(
        options,
        detected.contentType,
        bytes.byteLength,
        hints?.fileName,
      ),
    );
    assertAudioProperties(parsed);
    abortIfNeeded(options.signal);
    return normalizeMetadata(
      detected,
      parsed,
      {
        includeArtwork: options.includeArtwork ?? false,
        maxArtworkBytes,
        maxArtworkCount,
      },
      warnings,
    );
  } catch (cause) {
    return parseFailure(cause);
  }
}

/**
 * Analyze a Web byte stream without first creating a second full-file buffer.
 *
 * The supplied size is a required admission limit, not a value inferred from
 * the stream. Pass trusted object-storage metadata or a validated
 * Content-Length value. bragi-audio reads until it has a 4 KiB detection prefix,
 * then replays each pulled chunk into music-metadata.
 */
export async function analyzeWebStream(
  stream: ReadableStream<Uint8Array>,
  hints: StreamAudioHints,
  options: AnalyzeOptions = {},
): Promise<AudioAnalysis> {
  const maxFileBytes = positiveLimit(
    options.maxFileBytes,
    DEFAULT_MAX_FILE_BYTES,
    "maxFileBytes",
  );
  const maxArtworkBytes = positiveLimit(
    options.maxArtworkBytes,
    DEFAULT_MAX_ARTWORK_BYTES,
    "maxArtworkBytes",
  );
  const maxArtworkCount = positiveLimit(
    options.maxArtworkCount,
    DEFAULT_MAX_ARTWORK_COUNT,
    "maxArtworkCount",
  );
  abortIfNeeded(options.signal);
  const declaredSize = requireStreamSize(hints, maxFileBytes);
  const reader = stream.getReader();

  try {
    const prefix = await readFormatHeader(reader, declaredSize, options.signal);
    const detected = detectAudioFormat(joinChunks(prefix));
    if (!detected) {
      throw new AudioMetadataError(
        "unsupported_format",
        "The audio format is not supported.",
      );
    }
    const warnings = validateHints(detected.id, hints, options.strictHints);
    const parsed = await parseWebStream(
      replayStream(reader, prefix, declaredSize, options.signal),
      ...parserOptions(
        options,
        detected.contentType,
        declaredSize,
        hints.fileName,
      ),
    );
    assertAudioProperties(parsed);
    abortIfNeeded(options.signal);
    return normalizeMetadata(
      detected,
      parsed,
      {
        includeArtwork: options.includeArtwork ?? false,
        maxArtworkBytes,
        maxArtworkCount,
      },
      warnings,
    );
  } catch (cause) {
    await cancelReader(reader, cause);
    return parseFailure(cause);
  }
}
