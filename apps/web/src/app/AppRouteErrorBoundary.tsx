import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { startNewGeneration } from "../features/generation/startNewGeneration";

interface AppRouteErrorBoundaryProps {
  children: ReactNode;
}

interface AppRouteErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class AppRouteErrorBoundary extends Component<
  AppRouteErrorBoundaryProps,
  AppRouteErrorBoundaryState
> {
  override state: AppRouteErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): Partial<AppRouteErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error.message || "Unexpected rendering error.",
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("[AppRouteErrorBoundary]", error, errorInfo.componentStack);
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: null });
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return <AppRouteErrorFallback errorMessage={this.state.errorMessage} onRetry={this.handleRetry} />;
  }
}

function AppRouteErrorFallback({
  errorMessage,
  onRetry,
}: {
  errorMessage: string | null;
  onRetry: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-center text-slate-50">
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">Reactify hit an unexpected error.</h1>
        <p className="text-sm text-slate-300">The current page could not be rendered safely.</p>
        {errorMessage ? (
          <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => startNewGeneration(navigate)}
            className="rounded-lg border border-indigo-400/40 px-4 py-2 text-sm font-medium text-indigo-100 hover:bg-indigo-500/10"
          >
            New generation
          </button>
          <Link
            to="/"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
