import { fetchGeneratedFileContent, fetchGeneratedProjectFiles } from "../../lib/generation-api";

export async function loadProjectFilesForSandpack(generationId: string) {
  const listing = await fetchGeneratedProjectFiles(generationId);
  const files = await Promise.all(
    listing.files.map(async (file) => {
      const content = await fetchGeneratedFileContent(generationId, file.path);
      return {
        path: file.path,
        content: content.content,
      };
    }),
  );

  return files;
}
