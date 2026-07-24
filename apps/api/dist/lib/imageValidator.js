import { ErrorCode } from "@reactify/shared";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const WEBP_RIFF = Buffer.from("RIFF");
const WEBP_MARKER = Buffer.from("WEBP");
function startsWith(buffer, signature) {
    return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}
function detectMimeType(buffer) {
    if (startsWith(buffer, PNG_SIGNATURE)) {
        return "image/png";
    }
    if (startsWith(buffer, JPEG_SIGNATURE)) {
        return "image/jpeg";
    }
    if (buffer.length >= 12 &&
        buffer.subarray(0, 4).equals(WEBP_RIFF) &&
        buffer.subarray(8, 12).equals(WEBP_MARKER)) {
        return "image/webp";
    }
    return null;
}
function validatePngStructure(buffer) {
    if (buffer.length < 24) {
        return false;
    }
    const chunkType = buffer.subarray(12, 16).toString("ascii");
    return chunkType === "IHDR";
}
function validateJpegStructure(buffer) {
    if (buffer.length < 4) {
        return false;
    }
    let index = 2;
    while (index + 1 < buffer.length) {
        if (buffer[index] !== 0xff) {
            return false;
        }
        const marker = buffer[index + 1];
        if (marker === undefined) {
            return false;
        }
        if (marker === 0xd9) {
            return true;
        }
        if (marker === 0xda) {
            return index + 2 < buffer.length;
        }
        if (index + 3 >= buffer.length) {
            return false;
        }
        const segmentLength = buffer.readUInt16BE(index + 2);
        if (segmentLength < 2) {
            return false;
        }
        index += 2 + segmentLength;
    }
    return false;
}
function validateWebpStructure(buffer) {
    if (buffer.length < 16) {
        return false;
    }
    const declaredSize = buffer.readUInt32LE(4) + 8;
    return declaredSize <= buffer.length;
}
function validateImageStructure(buffer, mimeType) {
    switch (mimeType) {
        case "image/png":
            return validatePngStructure(buffer);
        case "image/jpeg":
            return validateJpegStructure(buffer);
        case "image/webp":
            return validateWebpStructure(buffer);
        default:
            return false;
    }
}
export function validateImageBuffer(buffer, maxBytes) {
    if (buffer.length === 0) {
        return {
            ok: false,
            errorCode: ErrorCode.UNSUPPORTED_IMAGE,
            message: "Uploaded file is empty.",
        };
    }
    if (buffer.length > maxBytes) {
        return {
            ok: false,
            errorCode: ErrorCode.FILE_TOO_LARGE,
            message: `File exceeds the maximum allowed size of ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
        };
    }
    const mimeType = detectMimeType(buffer);
    if (!mimeType) {
        return {
            ok: false,
            errorCode: ErrorCode.INVALID_MIME_TYPE,
            message: "Only PNG, JPEG, and WebP images are supported.",
        };
    }
    if (!validateImageStructure(buffer, mimeType)) {
        return {
            ok: false,
            errorCode: ErrorCode.CORRUPTED_IMAGE,
            message: "The uploaded image appears to be corrupted or incomplete.",
        };
    }
    return { ok: true, mimeType };
}
//# sourceMappingURL=imageValidator.js.map