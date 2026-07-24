import { useCallback, useEffect, useState } from "react";
import type { GeneratedFileContentResponse } from "@reactify/generation-contracts";
import { fetchGeneratedFileContent } from "../../lib/generation-api";

export function useGeneratedProject(generationId: string | null) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<GeneratedFileContentResponse | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPath(null);
    setFileContent(null);
    setFileError(null);
  }, [generationId]);

  const selectFile = useCallback(
    async (path: string) => {
      if (!generationId) {
        return;
      }

      setSelectedPath(path);
      setIsLoadingFile(true);
      setFileError(null);

      try {
        const content = await fetchGeneratedFileContent(generationId, path);
        setFileContent(content);
      } catch {
        setFileContent(null);
        setFileError("Unable to load the selected file.");
      } finally {
        setIsLoadingFile(false);
      }
    },
    [generationId],
  );

  return {
    selectedPath,
    fileContent,
    isLoadingFile,
    fileError,
    selectFile,
  };
}
