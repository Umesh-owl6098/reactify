/** Repair Tailwind styling + dashboard layout for generation 8cd48d4e and persist a new version. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { GeneratedProjectV1Schema } from "@reactify/generation-contracts";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { createProjectVersion } from "../src/lib/edit/versionStore.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { computeProjectHash } from "../src/lib/projectHash.js";
import { compileTailwindCss, cssContainsUtilityRules } from "../src/lib/styling/compileTailwindCss.js";
import { applyDashboardLayoutPatches, isSalesDashboardProject } from "../src/lib/styling/dashboardLayoutPatches.js";
import { normalizeProjectStyling } from "../src/lib/styling/normalizeProjectStyling.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";

const GENERATION_ID = process.argv[2] ?? "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  store.setPersistHandler(async (record) => persistence.generations.save(record));

  const row = await prisma.generation.findUnique({ where: { id: GENERATION_ID } });
  if (!row) {
    throw new Error(`Generation ${GENERATION_ID} not found`);
  }

  const record = await persistence.generations.findById(GENERATION_ID, row.ownerId);
  if (!record?.outputs.generatedProject) {
    throw new Error("Generation project snapshot unavailable.");
  }

  store.hydrate([record]);
  const hydrated = store.get(GENERATION_ID);
  if (!hydrated) {
    throw new Error("Failed to hydrate generation record.");
  }

  let project = GeneratedProjectV1Schema.parse(hydrated.outputs.generatedProject);
  if (isSalesDashboardProject(project)) {
    project = applyDashboardLayoutPatches(project);
  }

  const styled = normalizeProjectStyling(project);
  project = styled.project;

  const compiled = await compileTailwindCss(project);
  if (!compiled.ok) {
    throw new Error(compiled.message);
  }

  const required = ["grid", "md:grid-cols-2", "md:grid-cols-3", "flex", "gap-3", "h-screen"];
  const missing = cssContainsUtilityRules(compiled.css, required);

  const projectHash = computeProjectHash(project);
  hydrated.outputs.generatedProject = structuredClone(project);
  hydrated.projectHash = projectHash;
  hydrated.latestProjectHash = projectHash;

  createProjectVersion({
    record: hydrated,
    project,
    source: "automatic_repair",
    label: "Dashboard visual fidelity repair",
    parentVersionId: hydrated.activeVersionId,
    changedFiles: [
      "src/index.css",
      "tailwind.config.js",
      "postcss.config.js",
      "package.json",
      "src/components/Dashboard.tsx",
      "src/components/MarketingSalesFunnelPanel.tsx",
      "src/components/SalesCloseRatePanel.tsx",
      "src/components/BottomChartsContainer.tsx",
    ],
  });

  // Require genuine browser Sandpack validation for the new version.
  hydrated.sandboxValidation = null;
  hydrated.validationReportFingerprint = null;
  hydrated.awaitingSandboxValidation = true;
  hydrated.status = "Compiling";
  hydrated.activeStage = "sandbox_compilation";
  hydrated.updatedAt = new Date().toISOString();

  await store.persist(hydrated);

  const exportDir = join(process.cwd(), "storage/recovery", GENERATION_ID, "standalone");
  await mkdir(exportDir, { recursive: true });

  for (const file of project.files) {
    const target = join(exportDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }

  await writeFile(join(exportDir, "COMPILED_STYLES.css"), compiled.css, "utf8");

  console.log(
    JSON.stringify(
      {
        generationId: GENERATION_ID,
        activeVersionId: hydrated.activeVersionId,
        versionNumber: hydrated.versions.at(-1)?.versionNumber,
        projectHash,
        awaitingSandboxValidation: hydrated.awaitingSandboxValidation,
        stylingApplied: styled.applied,
        cssBytes: compiled.css.length,
        missingUtilities: missing,
        exportDir,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
