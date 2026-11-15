import { lazy, useState } from "react";
import { useApp } from "../state/store";
import { copyShareLink } from "../state/share";
import ControlMenu from "./ControlMenu";
import LazyPanel from "./LazyPanel";

const ValidationPanel = lazy(() => import("./ValidationPanel"));

export type PanelAppearance = "glass" | "solid";

// What each graphics mode changes (see MoonScene.setQuality)
const QUALITY_NOTE = {
  saver: "Lower resolution, simpler shadows and detail, no glow, 30 fps. For laptops on battery.",
  balanced: "Full resolution and detail, 60 fps.",
  high: "Supersampled for sharper edges, finer terrain and shadows, rocks further out. Needs a good GPU.",
} as const;

export default function TopBar({ panelAppearance, setPanelAppearance }: {
  panelAppearance: PanelAppearance;
  setPanelAppearance: (value: PanelAppearance) => void;
}) {
  const quality = useApp((s) => s.quality);
  const setQuality = useApp((s) => s.setQuality);
  const cinema = useApp((s) => s.cinema);
  const toggleCinema = useApp((s) => s.toggleCinema);
  const [copied, setCopied] = useState<null | boolean>(null);
  const validation = useApp((s) => s.validationOpen);
  const setValidation = useApp((s) => s.setValidationOpen);
  const touring = useApp((s) => s.tourStep !== null);
  const share = async () => {
    setCopied(await copyShareLink());
    setTimeout(() => setCopied(null), 2200);
  };

  return (
    <header className="topbar">
      {!cinema && (
        <div className="glass app-title">
          <h1>Lunar Window</h1>
        </div>
      )}
      <div className="glass view-actions">
        {!cinema && !touring && (
          <button className="control-trigger tour-trigger" aria-label="Guided tour"
            onClick={() => useApp.getState().setTourStep(0)}>Tour</button>
        )}
        {!cinema && (
          <ControlMenu label="Settings" align="end">
            {(close) => (
              <>
                <div className="control-label">Graphics</div>
                <div className="seg control-options" role="group" aria-label="Graphics quality">
                  {(["saver", "balanced", "high"] as const).map((q) => (
                    <button key={q} className="control-action" aria-pressed={q === quality} onClick={() => setQuality(q)} title={QUALITY_NOTE[q]}>
                      {q === "saver" ? "Saver" : q === "balanced" ? "Balanced" : "High"}
                    </button>
                  ))}
                </div>
                <div className="f-hint">{QUALITY_NOTE[quality]}</div>
                <div className="control-label">Panel appearance</div>
                <div className="seg control-options" role="group" aria-label="Panel appearance">
                  {(["glass", "solid"] as const).map((appearance) => (
                    <button key={appearance} className="control-action" aria-pressed={appearance === panelAppearance}
                      onClick={() => setPanelAppearance(appearance)}>
                      {appearance === "glass" ? "Glass" : "Solid"}
                    </button>
                  ))}
                </div>
                <button className="control-action" onClick={share}>Share view</button>
                <span className="share-status" role="status">
                  {copied === null ? "" : copied ? "Link copied" : "Link is in the address bar"}
                </span>
                <button className="control-action" onClick={() => { close(); setValidation(true); }}>Validation</button>
                <details className="shortcut-help">
                  <summary>Keyboard and mouse</summary>
                  <ul>
                    <li>WASD move · R / F up or down</li>
                    <li>Q / E turn · Drag to look</li>
                    <li>Right-drag to pan · Scroll to zoom</li>
                    <li>Click terrain to add a point</li>
                    <li>Space plays · ← / → change hour</li>
                    <li>H hides or shows panels</li>
                  </ul>
                </details>
              </>
            )}
          </ControlMenu>
        )}
        <button type="button" className="control-trigger panels-toggle" onClick={toggleCinema} aria-keyshortcuts="H"
          title={cinema ? "Show panels (H)" : "Hide panels (H)"}>
          {cinema ? "Show panels" : "Hide panels"}
        </button>
      </div>
      {validation && (
        <LazyPanel name="the validation window" onClose={() => setValidation(false)}>
          <ValidationPanel onClose={() => setValidation(false)} />
        </LazyPanel>
      )}
    </header>
  );
}
