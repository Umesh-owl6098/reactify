import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class ImageStorage {
    storageDir;
    constructor(storageDir) {
        this.storageDir = storageDir;
    }
    async ensureReady() {
        await mkdir(this.storageDir, { recursive: true });
    }
    async save(buffer, mimeType) {
        await this.ensureReady();
        const imageId = randomUUID();
        const dataPath = join(this.storageDir, imageId);
        const metaPath = join(this.storageDir, `${imageId}.meta.json`);
        const metadata = {
            mimeType,
            sizeBytes: buffer.length,
        };
        await writeFile(dataPath, buffer);
        await writeFile(metaPath, JSON.stringify(metadata));
        return {
            imageId,
            mimeType,
            sizeBytes: buffer.length,
        };
    }
    async get(imageId) {
        if (!UUID_PATTERN.test(imageId)) {
            return null;
        }
        const dataPath = join(this.storageDir, imageId);
        const metaPath = join(this.storageDir, `${imageId}.meta.json`);
        try {
            const [buffer, metaRaw] = await Promise.all([readFile(dataPath), readFile(metaPath, "utf8")]);
            const metadata = JSON.parse(metaRaw);
            return {
                buffer,
                mimeType: metadata.mimeType,
            };
        }
        catch {
            return null;
        }
    }
}
//# sourceMappingURL=imageStorage.js.map