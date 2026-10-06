import React from 'react';
import { LifeBuoy, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error('Unknown rendering error') };
  }
  render() {
    if (this.state.error)
      return (
        <div className="fatalError">
          <div className="fatalCard">
            <div className="brandMark">
              <LifeBuoy size={22} />
            </div>
            <span className="eyebrow">WORKSPACE ERROR</span>
            <h1>This workspace could not be rendered.</h1>
            <p>The application stayed online, but this view encountered an unexpected error.</p>
            <code>{this.state.error.message}</code>
            <div>
              <button className="primary" onClick={() => window.location.reload()}>
                <RefreshCw size={15} />
                Reload workspace
              </button>
            </div>
          </div>
        </div>
      );
    return this.props.children;
  }
}
