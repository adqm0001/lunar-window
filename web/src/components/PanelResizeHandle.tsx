import { useRef, useState } from "react";

type Side = "left" | "right";

export default function PanelResizeHandle({ side }: { side: Side }) {
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; width: number } | null>(null);
  const [width, setWidth] = useState<number>();
  const min = side === "left" ? 210 : 250;
  const max = 410;
  const panelName = side === "left" ? "Landing sites" : "Selected site";

  const app = () => handle.current?.parentElement;
  const readWidth = () => app()?.querySelector(`:scope > aside.${side}`)?.getBoundingClientRect().width ?? min;
  const resize = (value: number) => {
    const next = Math.round(Math.min(max, Math.max(min, value)));
    app()?.style.setProperty(`--${side}-panel-width`, `${next}px`);
    setWidth(next);
  };

  return (
    <div ref={handle} className={`panel-resize panel-resize-${side}`} role="separator" tabIndex={0}
      aria-label={`Resize ${panelName} panel`} aria-orientation="vertical"
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={width ?? (side === "left" ? 248 : 330)}
      title="Drag to resize · Double-click to reset"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, width: readWidth() };
      }}
      onPointerMove={(event) => {
        if (drag.current?.id !== event.pointerId) return;
        const offset = event.clientX - drag.current.x;
        resize(drag.current.width + (side === "left" ? offset : -offset));
      }}
      onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={() => {
        app()?.style.removeProperty(`--${side}-panel-width`);
        setWidth(undefined);
      }}
      onKeyDown={(event) => {
        const direction = side === "left" ? 1 : -1;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          resize(readWidth() + (event.key === "ArrowRight" ? direction : -direction) * (event.shiftKey ? 24 : 8));
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          resize(event.key === "Home" ? min : max);
        }
      }} />
  );
}
