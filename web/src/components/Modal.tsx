import Icon from "./Icon";
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  className: string;
  title: ReactNode;
  subtitle: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ className, title, subtitle, onClose, children }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === "Tab") {
        // Recheck on each key press: report buttons arrive after the GPU work.
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
          "button, a[href], input, select, textarea, [tabindex], [contenteditable=true]",
        )).filter((el) => el.tabIndex >= 0 && !el.matches(":disabled") && !el.closest("[inert]") &&
          el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
        const first = controls[0];
        const last = controls[controls.length - 1];
        const active = document.activeElement;
        if (!first) {
          event.preventDefault();
          dialog.focus();
        } else if (!dialog.contains(active) || active === dialog || active === (event.shiftKey ? first : last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) closeRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div ref={dialogRef} className={`glass modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}
        tabIndex={-1} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <div className="finder-head">
          <div>
            <div className="finder-title" id={titleId}>{title}</div>
            <div className="finder-sub">{subtitle}</div>
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
