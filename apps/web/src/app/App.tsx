import { Route, Routes, useParams } from "react-router-dom";
import { GenerationHistoryPage } from "../features/generation-history/GenerationHistoryPage";
import { GenerationWorkspacePage } from "../features/generation/GenerationWorkspacePage";

function RoutedGenerationWorkspace() {
  const { generationId } = useParams<{ generationId: string }>();
  return <GenerationWorkspacePage generationId={generationId} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<GenerationHistoryPage />} />
      <Route path="/generations/new" element={<GenerationWorkspacePage />} />
      <Route path="/generations/:generationId" element={<RoutedGenerationWorkspace />} />
    </Routes>
  );
}
