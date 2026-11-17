import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCw, AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const componentName = this.props.componentName || 'Component';
    console.error(`[ErrorBoundary] Caught error in ${componentName}:`, error, errorInfo);
  }

  private handleReload = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full min-h-[280px] p-6 sm:p-10 flex flex-col items-center justify-center text-center bg-paper text-ink border border-ink-a18 my-4 select-none animate-fadeIn">
          <div className="w-10 h-10 flex items-center justify-center mb-5 border border-ink-a18">
            <AlertCircle className="w-4 h-4 stroke-[1.5]" />
          </div>
          <span className="label text-[9px] text-ink/45 mb-3">
            Atelier recovery · Est. 2026
          </span>
          <h3 className="font-display text-[clamp(28px,4vw,42px)] font-light leading-[1.02] tracking-[-0.02em] mb-3">
            {this.props.fallbackTitle || 'Display Interruption'}
          </h3>
          <p className="body-copy text-ink/60 mx-auto mb-7">
            A temporary rendering fault occurred while constructing this view. The rest of the archive remains active.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="btn-text text-ink/80 hover:text-ink transition-colors cursor-pointer min-h-[44px]"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Reload View</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
