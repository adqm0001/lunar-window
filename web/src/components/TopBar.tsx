import { formatUtc, hourToDate, useApp } from "../state/store";
import { useSelectedSite, useSiteState } from "../state/selectors";

export default function TopBar() {
  const data = useApp((s) => s.data)!;
  const hour = useApp((s) => s.hour);
  const site = useSelectedSite();
  const st = useSiteState();
  const sunPct = Math.round(st.sunFraction * 100);
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
    </header>
  );
}
