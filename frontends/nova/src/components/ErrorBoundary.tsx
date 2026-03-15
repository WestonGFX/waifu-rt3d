/**
 * React error boundary for the Nova frontend.
 *
 * Catches unhandled errors in the component tree and renders a
 * glass-styled fallback UI with the error message and a reload button.
 * Error boundaries require class components in React — functional
 * components cannot use `componentDidCatch` or `getDerivedStateFromError`.
 *
 * @example
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 */
import { Component, type ReactNode } from 'react';

/** Props accepted by the ErrorBoundary wrapper. */
interface Props {
  children: ReactNode;
}

/** Internal state tracking whether an error has been caught. */
interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches unhandled React errors and displays a recovery UI.
 *
 * Wraps a subtree and intercepts errors during rendering, lifecycle
 * methods, and constructors of child components. Logs the error and
 * component stack to the console, then shows a styled fallback with
 * the error message and a reload button.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  /**
   * Update state to trigger the fallback UI on next render.
   *
   * @param error - The error that was thrown.
   * @returns New state with the error captured.
   */
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /**
   * Log the error and component stack for debugging.
   *
   * @param error - The error that was thrown.
   * @param info - React error info including componentStack.
   */
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Nova] Unhandled error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            background: 'var(--nova-bg-deep)',
            color: 'var(--nova-text-primary)',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            Something went wrong
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--nova-text-muted)',
              maxWidth: 400,
              textAlign: 'center',
            }}
          >
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px',
              borderRadius: 'var(--nova-radius-pill)',
              background: 'var(--nova-glass-bg-strong)',
              border: '1px solid var(--nova-glass-border)',
              color: 'var(--nova-accent-primary)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
