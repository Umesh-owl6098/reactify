import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { startNewGeneration } from "../generation/startNewGeneration";

interface GenerationDetailErrorBoundaryProps {
  children: ReactNode;
  generationId?: string;
  onRetry?: () => void;
}

interface GenerationDetailErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class GenerationDetailErrorBoundary extends Component<
  GenerationDetailErrorBoundaryProps,
  GenerationDetailErrorBoundaryState
> {
  override state: GenerationDetailErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): Partial<GenerationDetailErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error.message || "Unexpected rendering error.",
    };
  }

  override componentDidUpdate(prevProps: GenerationDetailErrorBoundaryProps): void {
    if (prevProps.generationId !== this.props.generationId && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: null });
    }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("[GenerationDetailErrorBoundary]", error, errorInfo.componentStack);
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: null });
    this.props.onRetry?.();
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return <GenerationDetailErrorFallback generationId={this.props.generationId} errorMessage={this.state.errorMessage} onRetry={this.handleRetry} />;
  }
}

function GenerationDetailErrorFallback({
  generationId,
  errorMessage,
  onRetry,
}: {
  generationId?: string;
  errorMessage: string | null;
  onRetry: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold text-white">Reactify could not display this generation.</h1>
      <p className="mt-3 text-sm text-slate-300">
        Something went wrong while rendering this page. You can retry, start a new generation, or return home.
      </p>
      {errorMessage ? (
        <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {generationId ? (
        <p className="mt-2 text-xs text-slate-500">Generation ID: {generationId}</p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
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
  );
}
