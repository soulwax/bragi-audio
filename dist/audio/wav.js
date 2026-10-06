import { AudioCodecError } from "./errors.js";
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;
function checkSize(size, maxBytes) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || size > maxBytes)
        throw new AudioCodecError("size_limit", "Audio exceeds the byte limit");
}
function text(view, offset, length = 4) {
    return Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("");
}
/** Encode mono/stereo PCM without changing sample rate or fetching a source. */
export function encodeWav(pcm, options = {}) {
    const bits = options.bitDepth ?? 16;
    const count = pcm.channels.length;
    const frames = pcm.channels[0]?.length ?? 0;
    if (![16, 24, 32].includes(bits) ||
        ![1, 2].includes(count) ||
        !Number.isInteger(pcm.sampleRate) ||
        pcm.sampleRate < 1 ||
        pcm.sampleRate > 384000 ||
        frames === 0 ||
        pcm.channels.some((channel) => channel.length !== frames))
        throw new AudioCodecError("invalid_pcm", "Invalid PCM shape or sample rate");
    const block = count * (bits / 8);
    const dataSize = frames * block;
    const padding = dataSize % 2;
    const headerSize = bits === 32 ? 56 : 44;
    const size = headerSize + dataSize + padding;
    checkSize(size, options.maxBytes ?? DEFAULT_MAX_BYTES);
    if (size - 8 > 0xffffffff)
        throw new AudioCodecError("size_limit", "Audio exceeds RIFF capacity");
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);
    const writeText = (offset, value) => {
        for (let i = 0; i < value.length; i++)
            view.setUint8(offset + i, value.charCodeAt(i));
    };
    writeText(0, "RIFF");
    view.setUint32(4, size - 8, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, bits === 32 ? 3 : 1, true);
    view.setUint16(22, count, true);
    view.setUint32(24, pcm.sampleRate, true);
    view.setUint32(28, pcm.sampleRate * block, true);
    view.setUint16(32, block, true);
    view.setUint16(34, bits, true);
    if (bits === 32) {
        writeText(36, "fact");
        view.setUint32(40, 4, true);
        view.setUint32(44, frames, true);
    }
    writeText(headerSize - 8, "data");
    view.setUint32(headerSize - 4, dataSize, true);
    let offset = headerSize;
    for (let frame = 0; frame < frames; frame++) {
        for (const channel of pcm.channels) {
            const raw = channel[frame] ?? NaN;
            if (!Number.isFinite(raw))
                throw new AudioCodecError("invalid_pcm", "PCM contains a non-finite sample");
            const sample = Math.max(-1, Math.min(1, raw));
            if (bits === 32)
                view.setFloat32(offset, sample, true);
            else {
                const scale = sample < 0 ? 2 ** (bits - 1) : 2 ** (bits - 1) - 1;
                const value = Math.round(sample * scale);
                if (bits === 16)
                    view.setInt16(offset, value, true);
                else {
                    view.setUint8(offset, value & 0xff);
                    view.setUint8(offset + 1, (value >> 8) & 0xff);
                    view.setUint8(offset + 2, (value >> 16) & 0xff);
                }
            }
            offset += bits / 8;
        }
    }
    return bytes;
}
/** Decode mono/stereo PCM16/PCM24/float32 RIFF/WAVE in Node or a browser. */
export function decodeWav(bytes, options = {}) {
    checkSize(bytes.byteLength, options.maxBytes ?? DEFAULT_MAX_BYTES);
    const invalid = () => new AudioCodecError("invalid_wav", "Malformed or truncated WAV");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.byteLength < 12 ||
        text(view, 0) !== "RIFF" ||
        text(view, 8) !== "WAVE")
        throw invalid();
    const end = view.getUint32(4, true) + 8;
    if (end > view.byteLength || end < 12)
        throw invalid();
    let format = null;
    let data = null;
    for (let offset = 12; offset < end;) {
        if (offset + 8 > end)
            throw invalid();
        const kind = text(view, offset);
        const size = view.getUint32(offset + 4, true);
        const payload = offset + 8;
        if (payload + size + (size % 2) > end)
            throw invalid();
        if (kind === "fmt ") {
            if (size < 16 || format)
                throw invalid();
            format = {
                kind: view.getUint16(payload, true),
                count: view.getUint16(payload + 2, true),
                rate: view.getUint32(payload + 4, true),
                byteRate: view.getUint32(payload + 8, true),
                block: view.getUint16(payload + 12, true),
                bits: view.getUint16(payload + 14, true),
            };
        }
        else if (kind === "data") {
            if (data)
                throw invalid();
            data = { offset: payload, size };
        }
        offset = payload + size + (size % 2);
    }
    if (!format || !data)
        throw invalid();
    const { kind, count, rate, bits, block, byteRate } = format;
    if (!([16, 24].includes(bits) && kind === 1) && !(bits === 32 && kind === 3))
        throw new AudioCodecError("unsupported_codec", "WAV codec is not supported");
    if (![1, 2].includes(count) ||
        rate < 1 ||
        rate > 384000 ||
        block !== (count * bits) / 8 ||
        byteRate !== rate * block ||
        data.size === 0 ||
        data.size % block !== 0)
        throw invalid();
    const frames = data.size / block;
    checkSize(frames * count * 4, options.maxPcmBytes ?? DEFAULT_MAX_BYTES);
    const channels = Array.from({ length: count }, () => new Float32Array(frames));
    let offset = data.offset;
    for (let frame = 0; frame < frames; frame++) {
        for (const channel of channels) {
            let sample;
            if (bits === 32)
                sample = view.getFloat32(offset, true);
            else if (bits === 16)
                sample = view.getInt16(offset, true) / 32768;
            else {
                const value = view.getUint8(offset) |
                    (view.getUint8(offset + 1) << 8) |
                    (view.getInt8(offset + 2) << 16);
                sample = value / 8388608;
            }
            if (!Number.isFinite(sample))
                throw invalid();
            channel[frame] = sample;
            offset += bits / 8;
        }
    }
    return { sampleRate: rate, channels };
}
//# sourceMappingURL=wav.js.map