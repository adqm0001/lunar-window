import { Component, type ReactNode } from "react";

// Without this, an error thrown while rendering any panel unmounted the whole app and left a black page with no way
// to tell what happened. The error is still logged; the user gets a message and a reload button.
export default class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Lunar Window stopped:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="glass load-error app-error" role="alert">
        <span>
          Something went wrong and Lunar Window stopped. Reloading usually fixes it.
          <small>{this.state.error.message}</small>
        </span>
        <button className="btn primary" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
