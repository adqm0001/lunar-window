import { Component, Suspense, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Wraps a React.lazy panel or window. Shows nothing while its code downloads. If the download
// fails (offline, or a new deploy renamed the chunk), the error stops here instead of unmounting
// the whole app, and a small notice offers a reload. React.lazy remembers the failed import, so
// only a reload can retry it.
interface Props {
  name: string;
  onClose?: () => void;
  children: ReactNode;
}

export default class LazyPanel extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return <Suspense fallback={null}>{this.props.children}</Suspense>;
    const { name, onClose } = this.props;
    // Portal: panels use backdrop-filter, which would trap a position: fixed child.
    return createPortal(
      <div className="glass load-error" role="alert">
        <span>Couldn't load {name}. Check your connection and reload.</span>
        <button className="btn primary" onClick={() => location.reload()}>
          Reload
        </button>
        {onClose && (
          <button className="btn" onClick={onClose}>
            Close
          </button>
        )}
      </div>,
      document.body,
    );
  }
}
