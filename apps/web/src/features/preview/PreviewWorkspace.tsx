import { useEffect, useMemo, useState } from "react";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { isAwaitingSandboxValidation } from "../../lib/generation-api";
import { GeneratedCodeViewer } from "../generated-project/GeneratedCodeViewer";
import { GeneratedFileTree } from "../generated-project/GeneratedFileTree";
import { GeneratedProjectSummaryPanel } from "../generated-project/GeneratedProjectSummary";
import { useGeneratedProject } from "../generated-project/useGeneratedProject";
import { SandpackErrorPanel } from "./SandpackErrorPanel";
import { SandpackPreviewPanel } from "./SandpackPreview";
import { SandpackStatus } from "./SandpackStatus";
import { loadProjectFilesForSandpack } from "./loadProjectFiles";
import { SandpackValidationController } from "./SandpackValidationBridge";
import { SandpackWorkspace } from "./SandpackWorkspace";
import { usePreviewStore } from "./previewStore";
import { SandpackProvider } from "@codesandbox/sandpack-react";
import { getSandpackDependencies, toSandpackFiles } from "./sandpackFileAdapter";

interface PreviewWorkspaceProps {
  status: GenerationStatusResponse;
  screenshotUrl?: string | null;
  onValidationReportSubmitted: () => void;
}

export function PreviewWorkspace({ status, screenshotUrl, onValidationReportSubmitted }: PreviewWorkspaceProps) {
  const project = status.outputs.generatedProject;
  const { selectedPath, fileContent, isLoadingFile, fileError, selectFile } = useGeneratedProject(status.id);
  const [activeTab, setActiveTab] = useState<"screenshot" | "code" | "preview" | "diagnostics">("code");
  const [loadedFiles, setLoadedFiles] = useState<Array<{ path: string; content: string }> | null>(null);
  const reloadToken = usePreviewStore((state) => state.reloadToken);
  const viewport = usePreviewStore((state) => state.viewport);
  const fitToContainer = usePreviewStore((state) => state.fitToContainer);
  const actualSize = usePreviewStore((state) => state.actualSize);
  const selectedDiagnosticPath = usePreviewStore((state) => state.selectedDiagnosticPath);
  const resetPreview = usePreviewStore((state) => state.reset);
  const setPhase = usePreviewStore((state) => state.setPhase);

  useEffect(() => {
    resetPreview();
  }, [resetPreview, status.id]);

  useEffect(() => {
    if (!project || !isAwaitingSandboxValidation(status)) {
      return;
    }

    let cancelled = false;
    setPhase("preparing");

    void loadProjectFilesForSandpack(status.id)
      .then((files) => {
        if (!cancelled) {
          setLoadedFiles(files);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("report_failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [project, setPhase, status]);

  useEffect(() => {
    if (selectedDiagnosticPath) {
      void selectFile(selectedDiagnosticPath);
    }
  }, [selectFile, selectedDiagnosticPath]);

  const sandpackProject = useMemo(() => {
    if (!project || !loadedFiles) {
      return null;
    }

    return {
      ...project,
      files: project.files.map((file) => ({
        ...file,
        content: loadedFiles.find((item) => item.path === file.path)?.content ?? "",
      })),
    };
  }, [loadedFiles, project]);

  if (!project) {
    return null;
  }

  const previewEnabled = Boolean(sandpackProject) && (isAwaitingSandboxValidation(status) || status.sandboxValidation);

  return (
    <section className="space-y-6" aria-labelledby="preview-workspace-heading">
      <div>
        <h2 id="preview-workspace-heading" className="text-lg font-semibold text-white">
          Generated project workspace
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          Review the screenshot, generated source, and browser-assisted Sandpack preview side by side.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 lg:hidden" role="tablist" aria-label="Workspace panels">
        {(["screenshot", "code", "preview", "diagnostics"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
              activeTab === tab ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-200"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)_minmax(0,1fr)]">
        <aside className={`space-y-4 ${activeTab === "screenshot" ? "block" : "hidden xl:block"}`}>
          {screenshotUrl ? (
            <img src={screenshotUrl} alt="Uploaded design screenshot" className="rounded-xl border border-slate-700" />
          ) : (
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400">
              Screenshot preview unavailable.
            </div>
          )}
          {status.outputs.designAnalysis ? (
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">Design analysis</p>
              <p className="mt-2">{status.outputs.designAnalysis.layoutHierarchy}</p>
            </div>
          ) : null}
        </aside>

        <section className={`space-y-4 ${activeTab === "code" ? "block" : "hidden xl:block"}`}>
          <GeneratedProjectSummaryPanel project={project} />
          <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
            <GeneratedFileTree
              files={project.files}
              selectedPath={selectedPath}
              onSelect={(path) => void selectFile(path)}
            />
            <GeneratedCodeViewer
              path={selectedPath}
              language={fileContent?.language ?? null}
              content={fileContent?.content ?? null}
              isLoading={isLoadingFile}
              error={fileError}
            />
          </div>
        </section>

        <section className={`space-y-4 ${activeTab === "preview" || activeTab === "diagnostics" ? "block" : "hidden xl:block"}`}>
          {previewEnabled && sandpackProject ? (
            <SandpackProvider
              key={`provider-${status.id}-${reloadToken}`}
              template="react-ts"
              files={toSandpackFiles(sandpackProject, { activePath: selectedPath })}
              customSetup={{
                entry: `/${sandpackProject.entryFile.replace(/^\/+/, "")}`,
                dependencies: getSandpackDependencies(sandpackProject),
              }}
              options={{ autorun: true, recompileMode: "immediate", recompileDelay: 300 }}
            >
              <SandpackWorkspace
                preview={
                  <SandpackPreviewPanel
                    viewportWidth={viewport.width}
                    viewportHeight={viewport.height}
                    fitToContainer={fitToContainer}
                    actualSize={actualSize}
                  />
                }
                status={<SandpackStatus />}
                diagnostics={
                  <div className={activeTab === "diagnostics" ? "block" : "hidden xl:block"}>
                    <SandpackErrorPanel onSelectFile={(path) => void selectFile(path)} />
                  </div>
                }
              />
              {isAwaitingSandboxValidation(status) ? (
                <SandpackValidationController
                  status={status}
                  projectFiles={loadedFiles}
                  onReportSubmitted={onValidationReportSubmitted}
                />
              ) : null}
            </SandpackProvider>
          ) : (
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
              Live preview will appear when sandbox validation starts.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
