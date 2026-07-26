import { Route, Routes, useParams } from "react-router-dom";
import { AccountPage } from "../features/account/AccountPage";
import { UsagePage } from "../features/usage/UsagePage";
import { ProtectedRoute } from "../features/auth/ProtectedRoute";
import { RegisterPage } from "../features/auth/RegisterPage";
import { SignInPage } from "../features/auth/SignInPage";
import { useSession } from "../features/auth/useSession";
import { GenerationHistoryPage } from "../features/generation-history/GenerationHistoryPage";
import { GenerationWorkspacePage } from "../features/generation/GenerationWorkspacePage";
import { AppHeader } from "../features/layout/AppHeader";
import { SystemReadinessBanner } from "../features/system/SystemReadinessBanner";
import { AppRouteErrorBoundary } from "./AppRouteErrorBoundary";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function SessionBootstrap({ children }: { children: React.ReactNode }) {
  useSession();
  return children;
}

function RoutedGenerationWorkspace() {
  const { generationId } = useParams<{ generationId: string }>();

  if (!generationId || !UUID_PATTERN.test(generationId)) {
    return (
      <section
        className="mx-auto w-full max-w-2xl rounded-2xl border border-red-400/30 bg-red-500/10 px-6 py-8 text-center"
        role="alert"
      >
        <h2 className="text-lg font-semibold text-red-100">Generation not found</h2>
        <p className="mt-3 text-sm text-red-200">The generation link is invalid or missing an ID.</p>
      </section>
    );
  }

  return <GenerationWorkspacePage key={generationId} generationId={generationId} />;
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppRouteErrorBoundary>
        <div className="min-h-screen bg-slate-950 text-slate-50">
          <AppHeader />
          <SystemReadinessBanner />
          {children}
        </div>
      </AppRouteErrorBoundary>
    </ProtectedRoute>
  );
}

export function App() {
  return (
    <SessionBootstrap>
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
    </SessionBootstrap>
  );
}
