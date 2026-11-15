import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  label: string;
  value?: string;
  align?: "end";
  placement?: "above";
  children: (close: () => void) => ReactNode;
}

export default function ControlMenu({ label, value, align, placement, children }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const floating = placement === "above";

  const close = () => {
    trigger.current?.focus();
    setOpen(false);
  };

  useLayoutEffect(() => {
    if (!open || !floating) return;
    const fit = () => {
      const bounds = trigger.current!.getBoundingClientRect();
      const width = Math.min(Math.max(206, bounds.width), window.innerWidth - 16);
      setPosition({
        position: "fixed",
        top: "auto",
        bottom: window.innerHeight - bounds.top + 8,
        left: Math.min(Math.max(8, bounds.left), window.innerWidth - width - 8),
        width,
        minWidth: 0,
        maxHeight: Math.max(80, Math.min(320, bounds.top - 16)),
      });
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, true);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit, true);
    };
  }, [open, floating]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const popover = (
    <div ref={panel} id={id}
      className={`glass control-popover ${align ? "align-end" : ""} ${floating ? "floating-choice" : ""}`}
      data-panel-appearance={root.current?.closest<HTMLElement>(".app")?.dataset.panelAppearance}
      style={floating ? position : undefined} hidden={!open}
      onKeyDown={(event) => {
        if (!floating || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const choices = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        if (choices.length === 0) return;
        const current = choices.indexOf(document.activeElement as HTMLButtonElement);
        const direction = event.key === "ArrowUp" ? -1 : 1;
        const next = (current + direction + choices.length) % choices.length;
        const target = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : next;
        choices[target].focus();
      }}>
      {open && children(close)}
    </div>
  );

  return (
    <div ref={root} className="control-menu" onBlur={(event) => {
      const destination = event.relatedTarget;
      if (destination && !event.currentTarget.contains(destination) && !panel.current?.contains(destination)) setOpen(false);
    }}>
      <button ref={trigger} className="control-trigger" type="button" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (!floating || event.key !== "ArrowDown") return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
          requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>("button")?.focus());
        }}>
        {label}
        {value && <span className="control-value">{value}</span>}
        <span className="control-chevron" aria-hidden="true" />
      </button>
      {floating ? open && createPortal(popover, document.body) : popover}
    </div>
  );
}
