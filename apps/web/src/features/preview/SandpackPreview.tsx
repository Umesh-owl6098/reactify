import {
  SandpackLayout,
  SandpackPreview,
} from "@codesandbox/sandpack-react";

interface SandpackPreviewPanelProps {
  viewportWidth: number;
  viewportHeight: number;
  fitToContainer: boolean;
  actualSize: boolean;
}

export function SandpackPreviewPanel({
  viewportWidth,
  viewportHeight,
  fitToContainer,
  actualSize,
}: SandpackPreviewPanelProps) {
  const previewStyle = actualSize
    ? { width: viewportWidth, height: viewportHeight }
    : fitToContainer
      ? { width: "100%", height: "100%" }
      : { width: viewportWidth, height: viewportHeight, maxWidth: "100%" };

  return (
    <SandpackLayout style={{ border: "none", minHeight: 420 }}>
      <SandpackPreview
        showNavigator={false}
        showRefreshButton={false}
        showOpenInCodeSandbox={false}
        style={previewStyle}
        actionsChildren={undefined}
        title="Generated React application preview"
      />
    </SandpackLayout>
  );
}
