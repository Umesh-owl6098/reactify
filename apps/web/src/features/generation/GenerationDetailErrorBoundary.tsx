import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

interface GenerationDetailErrorBoundaryProps {
  children: ReactNode;
  generationId?: string;
  onRetry?: () => void;
}

interface GenerationDetailErrorBoundaryState {
  hasError: boolean;
  requestId: string | null;
}

export class GenerationDetailErrorBoundary extends Component<
  GenerationDetailErrorBoundaryProps,
  GenerationDetailErrorBoundaryState
> {
  override state: GenerationDetailErrorBoundaryState = {
    hasError: false,
    requestId: null,
  };

  static getDerivedStateFromError(): Partial<GenerationDetailErrorBoundaryState> {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("[GenerationDetailErrorBoundary]", error, errorInfo.componentStack);
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, requestId: null });
    this.props.onRetry?.();
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-white">Reactify could not display this generation.</h1>
        <p className="mt-3 text-sm text-slate-300">
          Something went wrong while rendering this page. You can retry or return to your project history.
        </p>
        {this.props.generationId ? (
          <p className="mt-2 text-xs text-slate-500">Generation ID: {this.props.generationId}</p>
        ) : null}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Retry
          </button>
          <Link
            to="/"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            Back to history
          </Link>
        </div>
      </div>
    );
  }
}
