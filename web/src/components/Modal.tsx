import Icon from "./Icon";
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../state/store";

interface Props {
  className: string;
  title: ReactNode;
  subtitle: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ className, title, subtitle, onClose, children }: Props) {
  const touring = useApp((s) => s.tourStep !== null);
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
        const tour = touring ? document.querySelector(".tour-card:not(.welcome)") : null;
        const controls = Array.from([dialog, ...(tour ? [tour] : [])].flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>(
          "button, a[href], input, select, textarea, [tabindex], [contenteditable=true]",
        )))).filter((el) => el.tabIndex >= 0 && !el.matches(":disabled") && !el.closest("[inert]") &&
          el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
        // Portaled windows and the tour card have a different DOM order. Traverse the combined list explicitly.
        event.preventDefault();
        if (!controls.length) dialog.focus();
        else {
          const index = controls.indexOf(document.activeElement as HTMLElement);
          const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0)
            : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
          controls[next].focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (touring && event.target instanceof Element && event.target.closest(".tour-card")) return;
      if (event.target instanceof Node && !dialog.contains(event.target)) closeRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [touring]);

  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div ref={dialogRef} className={`glass modal ${className}`} role="dialog" aria-modal={!touring} aria-labelledby={titleId}
        data-panel-appearance={document.querySelector<HTMLElement>(".app")?.dataset.panelAppearance}
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
