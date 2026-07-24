import { Route, Routes, useParams } from "react-router-dom";
import { AccountPage } from "../features/account/AccountPage";
import { UsagePage } from "../features/usage/UsagePage";
import { ProtectedRoute } from "../features/auth/ProtectedRoute";
import { RegisterPage } from "../features/auth/RegisterPage";
import { SignInPage } from "../features/auth/SignInPage";
import { GenerationHistoryPage } from "../features/generation-history/GenerationHistoryPage";
import { GenerationWorkspacePage } from "../features/generation/GenerationWorkspacePage";
import { AppHeader } from "../features/layout/AppHeader";
import { SystemReadinessBanner } from "../features/system/SystemReadinessBanner";

function RoutedGenerationWorkspace() {
  const { generationId } = useParams<{ generationId: string }>();
  return <GenerationWorkspacePage generationId={generationId} />;
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-950 text-slate-50">
        <AppHeader />
        <SystemReadinessBanner />
        {children}
      </div>
    </ProtectedRoute>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedLayout>
            <GenerationHistoryPage />
          </ProtectedLayout>
        }
      />
      <Route
        path="/generations/new"
        element={
          <ProtectedLayout>
            <GenerationWorkspacePage />
          </ProtectedLayout>
        }
      />
      <Route
        path="/generations/:generationId"
        element={
          <ProtectedLayout>
            <RoutedGenerationWorkspace />
          </ProtectedLayout>
        }
      />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/account/usage" element={<UsagePage />} />
    </Routes>
  );
}
