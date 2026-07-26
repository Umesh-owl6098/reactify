import { fetchGeneratedFileContent, fetchGeneratedProjectFiles, fetchPreviewStylesCss } from "../../lib/generation-api";

export async function loadProjectFilesForSandpack(generationId: string) {
  const listing = await fetchGeneratedProjectFiles(generationId);
  const [files, compiledStylesheet] = await Promise.all([
    Promise.all(
      listing.files.map(async (file) => {
        const content = await fetchGeneratedFileContent(generationId, file.path);
        return {
          path: file.path,
          content: content.content,
        };
      }),
    ),
    fetchPreviewStylesCss(generationId).catch(() => null),
  ]);

  return { files, compiledStylesheet };
}
