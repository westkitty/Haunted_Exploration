import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'An unexpected interruption occurred in the manor.',
    };
  }

  componentDidCatch(error: Error): void {
    console.error('Application ErrorBoundary caught:', error);
  }

  private formatFriendlyMessage(raw: string): string {
    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
      if (parsed.error && parsed.operationType) {
        return `Cloud synchronization (${parsed.operationType} on ${parsed.path ?? 'lobby'}) was refused: ${parsed.error}`;
      }
    } catch {
      // plain string
    }
    return raw;
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-full bg-[#0b0908] text-[#f2e8d5] flex items-center justify-center p-6">
        <div className="walnut-panel max-w-lg w-full p-8 border border-[#c59b56]/40">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#c59b56] mb-2">
            Expedition Interrupted
          </p>
          <h1 className="font-display text-2xl text-[#f2e8d5] mb-3">
            The House Refused That Step
          </h1>
          <div className="brass-divider my-4" />
          <p className="text-sm text-[#d9ccb5] leading-relaxed mb-6 break-words">
            {this.formatFriendlyMessage(this.state.message)}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 bg-[#c59b56] text-[#140f0b] font-display text-xs uppercase tracking-widest hover:bg-[#d8b06c] transition-colors cursor-pointer"
            >
              Resume View
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 border border-[#c59b56]/40 text-[#f2e8d5] font-display text-xs uppercase tracking-widest hover:border-[#c59b56] transition-colors cursor-pointer"
            >
              Reload Manor
            </button>
          </div>
        </div>
      </div>
    );
  }
}
