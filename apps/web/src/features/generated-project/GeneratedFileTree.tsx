import { useMemo, useRef, type KeyboardEvent } from "react";
import type { GeneratedFileMetadata } from "@reactify/generation-contracts";
import { buildFileTree, normalizeFileTree } from "./fileTree";

interface GeneratedFileTreeProps {
  files: GeneratedFileMetadata[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function GeneratedFileTree({ files, selectedPath, onSelect }: GeneratedFileTreeProps) {
  const tree = useMemo(
    () => normalizeFileTree(buildFileTree(files.map((file) => file.path))),
    [files],
  );
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const flatPaths = files.map((file) => file.path);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, path: string) => {
    const currentIndex = flatPaths.indexOf(path);
    if (currentIndex < 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      itemRefs.current[currentIndex + 1]?.focus();
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      itemRefs.current[currentIndex - 1]?.focus();
    }
  };

  let buttonIndex = 0;

  const renderNodes = (nodes: ReturnType<typeof normalizeFileTree>, depth = 0): React.ReactNode =>
    nodes.map((node) => {
      if (node.path) {
        const index = buttonIndex;
        buttonIndex += 1;
        const language = files.find((file) => file.path === node.path)?.language ?? "txt";

        return (
          <li key={node.path}>
            <button
              type="button"
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm ${
                selectedPath === node.path
                  ? "bg-indigo-500/20 text-indigo-100"
                  : "text-slate-200 hover:bg-slate-800"
              }`}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              aria-label={`Open file ${node.path}`}
              aria-current={selectedPath === node.path ? "true" : undefined}
              onClick={() => onSelect(node.path!)}
              onKeyDown={(event) => handleKeyDown(event, node.path!)}
            >
              <span aria-hidden="true">{getFileIcon(language)}</span>
              <span>{node.name}</span>
            </button>
          </li>
        );
      }

      return (
        <li key={`${node.name}-${depth}`}>
          <p
            className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {node.name}
          </p>
          <ul className="space-y-1">{renderNodes(node.children, depth + 1)}</ul>
        </li>
      );
    });

  return (
    <nav aria-label="Generated project files">
      <ul className="space-y-1">{renderNodes(tree)}</ul>
    </nav>
  );
}

function getFileIcon(language: string): string {
  switch (language) {
    case "tsx":
    case "ts":
      return "TS";
    case "css":
      return "CSS";
    case "json":
      return "{}";
    case "html":
      return "<>";
    default:
      return "·";
  }
}
