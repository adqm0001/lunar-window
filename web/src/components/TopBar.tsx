import { lazy, useState } from "react";
import { formatUtc, hourToDate, useApp } from "../state/store";
import { copyShareLink } from "../state/share";
import { useSelectedSite, useSiteState } from "../state/selectors";
import LazyPanel from "./LazyPanel";

const ValidationPanel = lazy(() => import("./ValidationPanel"));

export default function TopBar() {
  const data = useApp((s) => s.data)!;
  const hour = useApp((s) => s.hour);
  const site = useSelectedSite();
  const st = useSiteState();
  const sunPct = Math.round(st.sunFraction * 100);
  const quality = useApp((s) => s.quality);
  const setQuality = useApp((s) => s.setQuality);
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
      <div className="brand">
        <div className="brand-mark" />
        LUNAR WINDOW <small>south pole mission planner</small>
      </div>
      <div className="clock">
        {formatUtc(hourToDate(data, hour))}
        <span>UTC</span>
      </div>
      <div className="spacer" />
      <div className="power">
        {(["saver", "balanced", "high"] as const).map((q) => (
          <button
            key={q}
            className={`chip ${q === quality ? "sel" : ""}`}
            onClick={() => setQuality(q)}
            title={
              q === "saver"
                ? "Saver: lower resolution, simpler shadows and detail, no glow, 30 fps. For laptops on battery"
                : q === "balanced"
                  ? "Balanced: full resolution and detail, 60 fps"
                  : "High: supersampled (sharper edges), finer terrain and shadows, rocks further out. Needs a good GPU"
            }
          >
            {q === "saver" ? "Saver" : q === "balanced" ? "Balanced" : "High"}
          </button>
        ))}
      </div>
      {!touring && (
        <button className="chip tour-btn" onClick={() => useApp.getState().setTourStep(0)} title="A one-minute guided tour of what Lunar Window does">
          ▶ Tour
        </button>
      )}
      <button className="chip" onClick={() => setValidation(true)} title="How every number is checked against NASA tools and published measurements">
        ✓ Validation
      </button>
      <button className="chip share" onClick={share} title="Copy a link that opens this exact view: site, time, layer, your points and the camera">
        {copied === null ? "⤴ Share view" : copied ? "✓ Link copied" : "Link is in the address bar"}
      </button>
      <span style={{ color: "var(--muted)", fontSize: 12 }}>{site.name}</span>
      <span className={`pill ${sunPct > 0 ? "on-sun" : ""}`}>
        <i />
        SUN {sunPct > 0 ? `${sunPct}%` : "BLOCKED"}
      </span>
      <span className={`pill ${st.earthUp ? "on-earth" : ""}`}>
        <i />
        EARTH {st.earthUp ? "IN VIEW" : "HIDDEN"}
      </span>
      <span className={`pill ${st.link ? "on-link" : ""}`}>
        <i />
        DSN LINK {st.link ? "OPEN" : "DOWN"}
      </span>
      {validation && (
        <LazyPanel name="the validation window" onClose={() => setValidation(false)}>
          <ValidationPanel onClose={() => setValidation(false)} />
        </LazyPanel>
      )}
    </header>
  );
}
