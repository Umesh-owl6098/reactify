import { useEffect, useMemo, useRef, useState } from "react";
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
import { SandpackMountLogger } from "./SandpackMountLogger";
import { SandpackConnectionMonitor } from "./SandpackConnectionMonitor";
import { PreviewUnavailableBanner } from "./PreviewUnavailableBanner";
import { getSandpackBundlerUrl } from "./sandpackConfig";
import { isSandpackPreviewEnabled, shouldLoadSandpackPreviewFiles } from "./previewEligibility";
import { resolveSandpackTemplate } from "./resolveSandpackTemplate";
import { SandpackTemplateErrorPanel } from "./SandpackTemplateErrorPanel";
import { logSandbox } from "./sandboxLogger";
import type { SandpackSetup } from "@codesandbox/sandpack-react";

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
  const [compiledStylesheet, setCompiledStylesheet] = useState<string | null>(null);
  const reloadToken = usePreviewStore((state) => state.reloadToken);
  const reloadPreview = usePreviewStore((state) => state.reloadPreview);
  const resetPreviewReport = usePreviewStore((state) => state.resetReportState);
  const viewport = usePreviewStore((state) => state.viewport);
  const fitToContainer = usePreviewStore((state) => state.fitToContainer);
  const actualSize = usePreviewStore((state) => state.actualSize);
  const selectedDiagnosticPath = usePreviewStore((state) => state.selectedDiagnosticPath);
  const resetPreview = usePreviewStore((state) => state.reset);
  const setPhase = usePreviewStore((state) => state.setPhase);
  const setExportEligible = usePreviewStore((state) => state.setExportEligible);
  const setComparisonCaptureReady = usePreviewStore((state) => state.setComparisonCaptureReady);
  const setCompilationValidated = usePreviewStore((state) => state.setCompilationValidated);
  const setRuntimeValidated = usePreviewStore((state) => state.setRuntimeValidated);
  const setPreviewSignals = usePreviewStore((state) => state.setPreviewSignals);
  const setTemplateErrors = usePreviewStore((state) => state.setTemplateErrors);

  const awaitingValidation = isAwaitingSandboxValidation(status);
  const shouldLoadPreviewFiles = shouldLoadSandpackPreviewFiles(status);
  const previewEnabled = isSandpackPreviewEnabled(status);

  useEffect(() => {
    setExportEligible(status.exportAllowed);
    setComparisonCaptureReady(
      Boolean(status.sandboxValidation?.compilation.success && status.sandboxValidation?.runtime.success),
    );
    setCompilationValidated(status.sandboxValidation?.compilation.success === true);
    setRuntimeValidated(status.sandboxValidation?.runtime.success === true);
  }, [
    setComparisonCaptureReady,
    setCompilationValidated,
    setExportEligible,
    setRuntimeValidated,
    status.exportAllowed,
    status.sandboxValidation,
  ]);

  useEffect(() => {
    if (awaitingValidation) {
      setActiveTab("preview");
    }
  }, [awaitingValidation, status.projectHash]);

  const loadedProjectHashRef = useRef<string | null>(null);

  useEffect(() => {
    resetPreview();
    loadedProjectHashRef.current = null;
    setLoadedFiles(null);
    setCompiledStylesheet(null);
  }, [resetPreview, status.id]);

  useEffect(() => {
    if (!status.projectHash || !status.repair?.clientRevalidationRequired) {
      return;
    }

    resetPreviewReport();
    reloadPreview();
    loadedProjectHashRef.current = null;
    setLoadedFiles(null);
    setCompiledStylesheet(null);
  }, [reloadPreview, resetPreviewReport, status.projectHash, status.repair?.clientRevalidationRequired]);

  useEffect(() => {
    if (!status.projectHash || !shouldLoadPreviewFiles) {
      return;
    }

    if (loadedProjectHashRef.current === status.projectHash) {
      return;
    }

    let cancelled = false;
    setPhase("preparing");

    void loadProjectFilesForSandpack(status.id)
      .then(({ files, compiledStylesheet: stylesheet }) => {
        if (!cancelled) {
          loadedProjectHashRef.current = status.projectHash ?? null;
          logSandbox("files_loaded", {
            generationId: status.id,
            fileCount: files.length,
            compiledStylesheet: Boolean(stylesheet),
          });
          setLoadedFiles(files);
          setCompiledStylesheet(stylesheet);
          setPreviewSignals({ filesLoaded: files.length > 0 });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          logSandbox("files_load_failed", {
            generationId: status.id,
            message: error instanceof Error ? error.message : String(error),
          });
          setPreviewSignals({ filesLoaded: false });
          setPhase("report_failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setPhase, setPreviewSignals, shouldLoadPreviewFiles, status.id, status.projectHash]);

  useEffect(() => {
    if (selectedDiagnosticPath) {
      void selectFile(selectedDiagnosticPath);
    }
  }, [selectFile, selectedDiagnosticPath]);

  const projectRef = useRef(project);
  projectRef.current = project;

  const sandpackProject = useMemo(() => {
    const currentProject = projectRef.current;
    if (!currentProject || !loadedFiles || !status.projectHash) {
      return null;
    }

    const contentByPath = new Map(loadedFiles.map((file) => [file.path, file.content]));

    return {
      ...currentProject,
      files: currentProject.files.map((file) => ({
        ...file,
        content: contentByPath.get(file.path) ?? "",
      })),
    };
  }, [loadedFiles, status.projectHash]);

  const sandpackFiles = useMemo(
    () =>
      sandpackProject
        ? toSandpackFiles(sandpackProject, { activePath: selectedPath, compiledStylesheet })
        : null,
    [sandpackProject, selectedPath, compiledStylesheet],
  );

  const templateResolution = useMemo(
    () => (sandpackProject ? resolveSandpackTemplate(sandpackProject, { compiledStylesheet }) : null),
    [compiledStylesheet, sandpackProject],
  );

  useEffect(() => {
    setTemplateErrors(templateResolution && !templateResolution.ok ? templateResolution.errors : []);
  }, [setTemplateErrors, templateResolution]);

  const sandpackCustomSetup = useMemo(() => {
    if (!sandpackProject || !templateResolution?.ok) {
      return null;
    }

    return {
      entry: templateResolution.template.entry,
      // Explicit, bundler-supported preset. Sandpack's own `react-ts` template maps to
      // the legacy `create-react-app` environment, which the v2 bundler does not know.
      environment: templateResolution.template.preset as SandpackSetup["environment"],
      dependencies: {
        ...getSandpackDependencies(sandpackProject),
        ...templateResolution.template.dependencies,
      },
    };
  }, [sandpackProject, templateResolution]);

  if (!project) {
    return null;
  }

  return (
    <section className="space-y-6" aria-labelledby="preview-workspace-heading">
      <div>
        <h2 id="preview-workspace-heading" className="text-lg font-semibold text-white">
          Generated project workspace
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          {status.repair?.clientRevalidationRequired
            ? "Revalidating repaired project in Sandpack with the latest patch."
            : "Review the screenshot, generated source, and browser-assisted Sandpack preview side by side."}
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

        <section
          className={`space-y-4 ${
            awaitingValidation || activeTab === "preview" || activeTab === "diagnostics"
              ? "block"
              : "hidden xl:block"
          }`}
        >
          {templateResolution && !templateResolution.ok ? (
            <SandpackTemplateErrorPanel errors={templateResolution.errors} />
          ) : null}
          {previewEnabled && sandpackProject && sandpackFiles && sandpackCustomSetup ? (
            <SandpackProvider
              key={`provider-${status.id}-${status.projectHash ?? "none"}-${reloadToken}`}
              files={sandpackFiles}
              customSetup={sandpackCustomSetup}
              options={{
                autorun: true,
                recompileMode: "immediate",
                recompileDelay: 300,
                bundlerURL: getSandpackBundlerUrl(),
              }}
            >
              <SandpackMountLogger
                generationId={status.id}
                projectHash={status.projectHash}
                entryFile={sandpackProject.entryFile}
              />
              <SandpackConnectionMonitor enabled />
              <PreviewUnavailableBanner />
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
          ) : templateResolution && !templateResolution.ok ? null : (
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
              {shouldLoadPreviewFiles
                ? "Loading project files for live preview…"
                : "Live preview will appear when sandbox validation starts."}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
