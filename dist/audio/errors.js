export class AudioCodecError extends Error {
    code;
    name = "AudioCodecError";
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
//# sourceMappingURL=errors.js.map