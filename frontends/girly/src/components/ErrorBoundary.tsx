/**
 * ErrorBoundary – Catches unhandled React render errors and displays a
 * recovery UI instead of a white screen.
 *
 * Wraps the entire app in App.tsx so that if Three.js, a provider, or any
 * deep component throws during render, users see a friendly fallback with
 * a "Reload" button instead of a blank page.
 *
 * Phase: Foundation fix (claude/improvements branch)
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI. If omitted, the built-in recovery card renders. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[AnimeGirly] Unhandled render error:', error, errorInfo);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleDismiss = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: '#1a1a2e',
            color: '#e2e8f0',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: '2rem',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              width: '100%',
              background: '#16213e',
              borderRadius: '16px',
              padding: '2rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
              {'(>_<)'}
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Something went wrong
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1rem' }}>
              AnimeGirly hit an unexpected error. This is usually caused by a
              corrupted model file or a browser compatibility issue. Your chat
              history and settings are safe.
            </p>

            {this.state.error && (
              <details
                style={{
                  marginBottom: '1.5rem',
                  background: '#0f172a',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    color: '#64748b',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                  }}
                >
                  Error details
                </summary>
                <pre
                  style={{
                    marginTop: '0.5rem',
                    fontSize: '0.7rem',
                    color: '#f87171',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: '200px',
                    overflow: 'auto',
                  }}
                >
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack &&
                    `\n\nComponent stack:${this.state.errorInfo.componentStack}`}
                </pre>
              </details>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={this.handleReload}
                style={{
                  flex: 1,
                  padding: '0.625rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#6366f1',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#4f46e5')}
                onMouseOut={(e) => (e.currentTarget.style.background = '#6366f1')}
              >
                Reload app
              </button>
              <button
                onClick={this.handleDismiss}
                style={{
                  flex: 1,
                  padding: '0.625rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'transparent',
                  color: '#94a3b8',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Try to continue
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
