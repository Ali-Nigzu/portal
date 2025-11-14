import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { logError } from '../utils/logger';

interface ErrorBoundaryProps {
  name: string;
  children: ReactNode;
  fallbackMessage?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError(`ui.${this.props.name}`, 'boundary_error', {
      message: error.message,
      stack: info.componentStack,
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <h2>Something went wrong.</h2>
          <p>{this.props.fallbackMessage ?? 'This area is temporarily unavailable.'}</p>
          {this.state.message ? <pre>{this.state.message}</pre> : null}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
