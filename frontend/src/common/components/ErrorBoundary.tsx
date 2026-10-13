import { type ReactNode, type ErrorInfo, Component } from "react";

export function isAssetLoadError(message: string): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed|Unable to preload CSS/i.test(message);
}

interface ErrorBoundaryProps {
  name: string;
  children: ReactNode;
  fallbackMessage?: string;
  resetKey?: string;
  onRetry?: (message?: string) => void;
  onReload?: () => void;
  onHome?: () => void;
}
interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}
class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }
  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: undefined });
    }
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.props.onRetry || this.props.onReload) {
      console.error(`[ui.${this.props.name}] boundary_error`);
      return;
    }
    console.error(`[ui.${this.props.name}] boundary_error`, {
      message: error.message,
      stack: info.componentStack,
    });
  }
  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <h2>Something went wrong.</h2>
          <p>
            {this.props.fallbackMessage ??
              "This area is temporarily unavailable."}
          </p>{" "}
          {this.props.onRetry && <button className="vrm-btn" onClick={() => this.props.onRetry?.(this.state.message)}>Retry</button>}
          {this.props.onReload && <button className="vrm-btn" onClick={this.props.onReload}>Reload page</button>}
          {this.props.onHome && <button className="vrm-btn" onClick={this.props.onHome}>Home</button>}
          {!this.props.onRetry && !this.props.onReload && this.state.message ? <pre>{this.state.message}</pre> : null}{" "}
        </div>
      );
    }
    return this.props.children;
  }
}
export default ErrorBoundary;
