import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[Iris] Uncaught render error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-0 flex items-center justify-center p-6">
          <div className="glass-card max-w-md w-full p-8 text-center">
            <div className="text-5xl mb-4">
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent font-bold">
                Iris
              </span>
            </div>
            <h1 className="text-xl font-semibold text-text-primary mb-2">
              Something went wrong
            </h1>
            <p className="text-text-secondary text-sm mb-6">
              {this.state.error?.message || 'An unexpected error occurred while rendering the application.'}
            </p>
            <button
              onClick={this.handleReload}
              className="px-6 py-2.5 bg-accent hover:bg-accent-dim rounded-lg text-sm font-medium text-white transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
