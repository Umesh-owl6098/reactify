import { useState } from "react";

interface GeneratedCodeViewerProps {
  path: string | null;
  language: string | null;
  content: string | null;
  isLoading: boolean;
  error: string | null;
}

export function GeneratedCodeViewer({
  path,
  language,
  content,
  isLoading,
  error,
}: GeneratedCodeViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) {
      return;
    }

    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (!path) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400">
        Select a file from the tree to view its generated source code.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300" role="status">
        Loading {path}...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
        {error}
      </div>
    );
  }

  const lines = (content ?? "").split("\n");

  return (
    <section aria-labelledby="generated-code-viewer-heading" className="overflow-hidden rounded-lg border border-slate-700">
      <div className="flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-900/80 px-4 py-2">
        <div>
          <h3 id="generated-code-viewer-heading" className="text-sm font-medium text-white">
            {path}
          </h3>
          {language ? <p className="text-xs text-slate-400">{language}</p> : null}
        </div>
        <button
          type="button"
          className="rounded-md border border-slate-600 px-3 py-1 text-xs font-medium text-slate-100"
          onClick={() => void handleCopy()}
          aria-label="Copy file contents"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="max-h-[28rem] overflow-auto bg-slate-950/90">
        <pre className="grid grid-cols-[auto_1fr] text-xs leading-6">
          {lines.map((line, index) => (
            <code key={`${path}-${index}`} className="contents">
              <span className="select-none border-r border-slate-800 px-3 text-right text-slate-500">
                {index + 1}
              </span>
              <span className="whitespace-pre px-4 text-slate-100">{highlightLine(line, language)}</span>
            </code>
          ))}
        </pre>
      </div>
    </section>
  );
}

function highlightLine(line: string, language: string | null) {
  if (!language || language === "json" || language === "css" || language === "html") {
    return line;
  }

  const parts = line.split(/(\b(?:import|export|from|const|function|return|interface|type)\b|"[^"]*"|'[^']*'|`[^`]*`)/g);

  return parts.map((part, index) => {
    if (/^\b(?:import|export|from|const|function|return|interface|type)\b$/.test(part)) {
      return (
        <span key={index} className="text-indigo-300">
          {part}
        </span>
      );
    }

    if (/^("|'|`)/.test(part)) {
      return (
        <span key={index} className="text-emerald-300">
          {part}
        </span>
      );
    }

    return <span key={index}>{part}</span>;
  });
}
