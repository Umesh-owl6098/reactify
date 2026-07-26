/** Print the file inventory of the most recent project versions. */
import { PrismaClient } from "@prisma/client";

const generationId = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";
const limit = Number(process.argv[3] ?? 2);

async function main() {
  const prisma = new PrismaClient();
  const generation = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: limit } },
  });

  for (const version of generation.versions) {
    const snapshot = version.projectSnapshot as unknown;
    const project = (typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot) as {
      files?: Array<{ path: string; content: string }>;
    };
    console.log(
      `--- ${version.label ?? version.source} v${version.versionNumber} id=${version.versionId} hash=${version.projectHash.slice(0, 12)} files=${project.files?.length ?? 0}`,
    );
    for (const file of project.files ?? []) {
      const svg = /<svg[\s>]/i.test(file.content) ? " HAS-SVG" : "";
      const placeholder = /content block/i.test(file.content) ? " PLACEHOLDER-TEXT" : "";
      console.log(`    ${file.path} ${String(file.content.length).padStart(6)}${svg}${placeholder}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
