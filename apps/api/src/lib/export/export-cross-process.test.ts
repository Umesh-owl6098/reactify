/**
 * Cross-process export integration test.
 *
 * Proves the Railway production flow end-to-end with separate API and worker
 * GenerationStore instances that share only a Map (simulating the DB) and a
 * shared artifact storage.  The worker never touches the API's in-memory
 * store, exactly as it does on Railway where they are separate containers.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ExportService } from "./ExportService.js";
import { ExportArtifactStore } from "./exportArtifactStore.js";
import { MemoryStorageProvider } from "../storage/memoryStorageProvider.js";
import { GenerationStore } from "../../pipeline/store.js";
import { computeProjectHash } from "../projectHash.js";
import type { GenerationRecord, ProjectVersionRecord } from "../../pipeline/types.js";
import type { GeneratedProjectV1 } from "@reactify/generation-contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FEATURE_FLAGS = {
  enableRepair: true,
  enableInspector: true,
  enableAccessibility: true,
  enableGenerationPlanEditing: true,
};

function makeProject(): GeneratedProjectV1 {
  return {
    projectName: "test-project",
    summary: "A test project",
    entryFile: "src/App.tsx",
    files: [
      {
        path: "src/App.tsx",
        content: "export default function App() { return <div>hello</div>; }",
        language: "tsx",
      },
      {
        path: "src/main.tsx",
        content: [
          'import React from "react";',
          'import ReactDOM from "react-dom/client";',
          'import App from "./App";',
          'import "./index.css";',
          'createRoot(document.getElementById("root")!).render(<App />);',
        ].join("\n"),
        language: "tsx",
      },
      {
        path: "src/index.css",
        content: "body { margin: 0; }",
        language: "css",
      },
      {
        path: "index.html",
        content: '<!DOCTYPE html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
        language: "html",
      },
      {
        path: "package.json",
        content: JSON.stringify({
          name: "test-project",
          version: "1.0.0",
          scripts: { dev: "vite", build: "tsc && vite build" },
          dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
          devDependencies: { vite: "^5.0.0", typescript: "^5.0.0" },
        }),
        language: "json",
      },
      {
        path: "vite.config.ts",
        content: 'import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });',
        language: "ts",
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify({ compilerOptions: { target: "ESNext", module: "ESNext" } }),
        language: "json",
      },
    ],
    components: [{ name: "App", path: "src/App.tsx", description: "Root component" }],
    dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
    devDependencies: { vite: "^5.0.0" },
    warnings: [],
  };
}

function makeReadyRecord(): GenerationRecord {
  const store = new GenerationStore(FEATURE_FLAGS, 3);
  const record = store.create({ ownerId: randomUUID(), imageId: randomUUID(), deferPersist: true });
  const project = makeProject();
  const projectHash = computeProjectHash(project);
  const versionId = randomUUID();
  const version: ProjectVersionRecord = {
    versionId,
    versionNumber: 1,
    source: "initial",
    projectHash,
    project,
    changedFiles: [],
    createdAt: new Date().toISOString(),
    label: null,
    parentVersionId: null,
    editId: undefined,
    instruction: undefined,
  };
  record.status = "Ready";
  record.projectHash = projectHash;
  record.schemaValidation = { valid: true, errors: [], warnings: [] };
  record.staticValidation = { valid: true, errors: [], warnings: [], unreachableClasses: [] };
  record.sandboxValidation = {
    projectHash,
    compilation: { success: true, errors: [], durationMs: 100 },
    runtime: { success: true, errors: [], durationMs: 50 },
    validatedAt: new Date().toISOString(),
  };
  record.outputs.generatedProject = project;
  record.versions = [version];
  record.activeVersionId = versionId;
  record.validationReportFingerprint = `test:${projectHash}`;
  return record;
}

function makeExportService(sharedStorage: MemoryStorageProvider) {
  return new ExportService(
    {
      maxFiles: 200,
      maxFileBytes: 512 * 1024,
      maxTotalBytes: 5 * 1024 * 1024,
      maxZipBytes: 8 * 1024 * 1024,
    },
    new ExportArtifactStore(sharedStorage),
  );
}

// Simulate a shared DB as a plain Map of deep-cloned records.
type DbMap = Map<string, GenerationRecord>;

function buildStore(db: DbMap, failOnNthPersist?: number): GenerationStore {
  const store = new GenerationStore(FEATURE_FLAGS, 3);
  let callCount = 0;
  store.setPersistHandler(async (r) => {
    callCount += 1;
    if (failOnNthPersist !== undefined && callCount >= failOnNthPersist) {
      throw new Error(`Simulated DB failure on persist call #${callCount}`);
    }
    db.set(r.id, structuredClone(r) as GenerationRecord);
  });
  return store;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("export cross-process flow", () => {
  it("API creates export → independent worker claims and runs job → export becomes ready → download returns valid ZIP", async () => {
    const db: DbMap = new Map();
    const sharedStorage = new MemoryStorageProvider();
    const exportService = makeExportService(sharedStorage);

    // --- API side -----------------------------------------------------------
    const apiStore = buildStore(db);
    const record = makeReadyRecord();
    apiStore.hydrate([record]);

    const initiated = exportService.initiateExport(record, {
      projectName: "my-app",
      includeMetadata: true,
      includeGenerationSummary: false,
    });
    expect(initiated.ok).toBe(true);
    if (!initiated.ok) throw new Error("initiateExport failed");
    const exportId = initiated.exportId!;

    // Persist BEFORE enqueueing — the export must be in the DB before the
    // worker can pick up the job.
    await apiStore.persist(record);

    const beforeJob = db.get(record.id)!;
    expect(beforeJob.exports.find((e) => e.exportId === exportId)?.status).toBe("preparing");

    // --- Worker side (completely separate store, no shared memory with API) --
    const workerStore = buildStore(db);
    // Worker hydrates fresh from "DB" — simulates loadGenerationById in job-runner.
    workerStore.hydrate([structuredClone(db.get(record.id)!) as GenerationRecord]);

    const workerRecord = workerStore.get(record.id)!;
    expect(workerRecord).toBeDefined();
    expect(workerRecord.exports.find((e) => e.exportId === exportId)?.status).toBe("preparing");

    // Worker executes the export preparation.
    await exportService.executeExportPreparationJob(workerRecord, exportId);

    // Worker persists updated record (the in-handler persist in export-preparation-job.ts).
    await workerStore.persist(workerRecord);

    // --- Verify DB after job ------------------------------------------------
    const afterJob = db.get(record.id)!;
    const exportAfter = afterJob.exports.find((e) => e.exportId === exportId);
    expect(exportAfter?.status).toBe("ready");
    expect(exportAfter?.fileCount).toBeGreaterThan(0);
    expect(exportAfter?.artifactReference).toBeDefined();

    // Artifact should exist in shared storage.
    const artifactExists = await sharedStorage.objectExists(exportAfter!.artifactReference!);
    expect(artifactExists).toBe(true);

    // --- Download side (API hydrates from DB, resolves download) ------------
    const downloadStore = buildStore(db);
    downloadStore.hydrate([structuredClone(db.get(record.id)!) as GenerationRecord]);
    const downloadRecord = downloadStore.get(record.id)!;

    const result = await exportService.resolveDownload(downloadRecord, exportId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("resolveDownload failed: " + result.message);

    // Verify valid ZIP magic bytes (PK header).
    expect(result.buffer.byteLength).toBeGreaterThan(4);
    expect(result.buffer[0]).toBe(0x50); // 'P'
    expect(result.buffer[1]).toBe(0x4b); // 'K'
  });

  it("when post-handler persist fails, in-handler persist already wrote ready status — download still works", async () => {
    const db: DbMap = new Map();
    const sharedStorage = new MemoryStorageProvider();
    const exportService = makeExportService(sharedStorage);

    const apiStore = buildStore(db);
    const record = makeReadyRecord();
    apiStore.hydrate([record]);

    const initiated = exportService.initiateExport(record, { projectName: "my-app", includeMetadata: true, includeGenerationSummary: false });
    expect(initiated.ok).toBe(true);
    if (!initiated.ok) throw new Error();
    const exportId = initiated.exportId!;
    await apiStore.persist(record);

    // Worker store: 1st persist (in-handler) succeeds; 2nd+ (post-handler in job-runner) fails.
    const workerStore = buildStore(db, 2);
    workerStore.hydrate([structuredClone(db.get(record.id)!) as GenerationRecord]);
    const workerRecord = workerStore.get(record.id)!;

    await exportService.executeExportPreparationJob(workerRecord, exportId);
    // Simulate the explicit in-handler persist from export-preparation-job.ts.
    await workerStore.persist(workerRecord); // call #1 — succeeds

    // DB now has the ready export.
    const afterInHandlerPersist = db.get(record.id)!;
    expect(afterInHandlerPersist.exports.find((e) => e.exportId === exportId)?.status).toBe("ready");

    // Post-handler persist (job-runner line 366) fails — but export is already durable.
    await expect(workerStore.persist(workerRecord)).rejects.toThrow("Simulated DB failure");

    // Download works because the ready export is in the DB.
    const downloadStore = buildStore(db);
    downloadStore.hydrate([structuredClone(db.get(record.id)!) as GenerationRecord]);
    const result = await exportService.resolveDownload(downloadStore.get(record.id)!, exportId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.buffer[0]).toBe(0x50);
    expect(result.buffer[1]).toBe(0x4b);
  });

  it("when artifact write fails, export is kept in preparing state so syncGenerationForJobFailure can mark it failed", async () => {
    // Use a storage that always fails on write.
    const brokenStorage: MemoryStorageProvider = new MemoryStorageProvider();
    const brokenArtifactStore = new ExportArtifactStore(brokenStorage);
    // Override putObject to always throw.
    brokenStorage.putObject = async () => { throw new Error("Storage unavailable"); };

    const brokenExportService = new ExportService(
      { maxFiles: 200, maxFileBytes: 512 * 1024, maxTotalBytes: 5 * 1024 * 1024, maxZipBytes: 8 * 1024 * 1024 },
      brokenArtifactStore,
    );

    const db: DbMap = new Map();
    const apiStore = buildStore(db);
    const record = makeReadyRecord();
    apiStore.hydrate([record]);

    const initiated = brokenExportService.initiateExport(record, { projectName: "my-app", includeMetadata: true, includeGenerationSummary: false });
    expect(initiated.ok).toBe(true);
    if (!initiated.ok) throw new Error();
    const exportId = initiated.exportId!;
    await apiStore.persist(record);

    const workerStore = buildStore(db);
    workerStore.hydrate([structuredClone(db.get(record.id)!) as GenerationRecord]);
    const workerRecord = workerStore.get(record.id)!;

    // executeExportPreparationJob should throw when storage fails.
    await expect(
      brokenExportService.executeExportPreparationJob(workerRecord, exportId),
    ).rejects.toThrow("Storage unavailable");

    // Export status must still be "preparing" (NOT "ready") after artifact write failure,
    // so syncGenerationForJobFailure can correctly find and mark it "failed".
    const exportEntry = workerRecord.exports.find((e) => e.exportId === exportId);
    expect(exportEntry?.status).toBe("preparing");
  });
});
