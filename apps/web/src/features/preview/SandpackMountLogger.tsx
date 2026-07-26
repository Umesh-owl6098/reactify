import { useEffect, useRef } from "react";
import { logSandbox } from "./sandboxLogger";

export function SandpackMountLogger({
  generationId,
  projectHash,
  entryFile,
}: {
  generationId: string;
  projectHash: string | null | undefined;
  entryFile: string;
}) {
  const loggedRef = useRef(false);

  useEffect(() => {
    if (loggedRef.current) {
      return;
    }

    loggedRef.current = true;
    logSandbox("sandpack_provider_mounted", { generationId, projectHash, entryFile });
  }, [entryFile, generationId, projectHash]);

  return null;
}
