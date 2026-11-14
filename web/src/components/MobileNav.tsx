import { useEffect } from "react";
import { useApp } from "../state/store";

// Bottom tab bar for phones: the side panels and the timeline become sheets that slide up.
export type MobilePanel = "none" | "sites" | "site" | "time";

export default function MobileNav() {
  const panel = useApp((s) => s.mobilePanel);
  const setPanel = useApp((s) => s.setMobilePanel);
  const playing = useApp((s) => s.playing);
  const toolOpen = useApp((s) => s.finderOpen || s.landerOpen || s.roverOpen);

  useEffect(() => {
    if (toolOpen) setPanel("sites");
  }, [toolOpen, setPanel]);

  const tab = (id: MobilePanel, label: string) => (
    <button className={`m-tab ${panel === id ? "sel" : ""}`} onClick={() => setPanel(panel === id ? "none" : id)}>
      {label}
    </button>
  );

  return (
    <nav className="glass mobile-nav" aria-label="Panels">
      {tab("sites", toolOpen ? "Tools" : "Sites")}
      {tab("site", "Site")}
      {tab("time", "Time")}
      <button className="m-tab play" onClick={() => useApp.getState().togglePlaying()}>
        {playing ? "❚❚" : "▶"}
      </button>
    </nav>
  );
}
