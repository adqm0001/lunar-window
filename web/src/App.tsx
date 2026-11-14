import { useEffect, useState } from "react";
import { loadAppData } from "./data/load";
import { loadField } from "./data/field";
import { loadGlobe } from "./data/globe";
import { useApp } from "./state/store";
import { applyEarly, syncUrl } from "./state/share";
import { usePlayback } from "./state/usePlayback";
import TopBar from "./components/TopBar";
import SiteList from "./components/SiteList";
import SitePanel from "./components/SitePanel";
import Timeline from "./components/Timeline";
import Scene3D from "./components/Scene3D";
import LayerControls from "./components/LayerControls";
import FinderPanel from "./components/FinderPanel";
import ComparePanel from "./components/ComparePanel";
import LanderPanel from "./components/LanderPanel";
import RoverPanel from "./components/RoverPanel";
import Tour from "./components/Tour";
import PorkchopPanel from "./components/PorkchopPanel";

let startedField = false;
let startedData = false;

export default function App() {
  const data = useApp((s) => s.data);
  const setData = useApp((s) => s.setData);
  const cinema = useApp((s) => s.cinema);
  const finderOpen = useApp((s) => s.finderOpen);
  const compareOpen = useApp((s) => s.compareOpen);
  const landerOpen = useApp((s) => s.landerOpen);
  const roverOpen = useApp((s) => s.roverOpen);
  const porkchopOpen = useApp((s) => s.porkchopOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const s = useApp.getState();
      if (e.key === "h" || e.key === "H") s.toggleCinema();
      else if (e.key === " ") {
        e.preventDefault();
        s.togglePlaying();
      } else if (e.key === "ArrowRight") s.setHour(s.hour + (e.shiftKey ? 24 : 1));
      else if (e.key === "ArrowLeft") s.setHour(s.hour - (e.shiftKey ? 24 : 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [progress, setProgress] = useState({ fraction: 0, label: "Starting" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedData) return;
    startedData = true;
    loadAppData((fraction, label) => setProgress({ fraction, label }))
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [setData]);

  useEffect(() => {
    if (!data) return;
    applyEarly();
    const id = setInterval(syncUrl, 1000);
    return () => clearInterval(id);
  }, [data]);

  useEffect(() => {
    if (!data || startedField) return;
    startedField = true;
    const s = useApp.getState();
    loadField(s.setFieldProgress)
      .then(s.setField)
      .catch((e: Error) => s.setFieldError(e.message));
    loadGlobe()
      .then(s.setGlobe)
      .catch((e: Error) => console.warn("Globe data failed to load:", e.message));
  }, [data]);

  usePlayback();

  if (!data) {
    return (
      <div className="loader">
        <div className="loader-box">
          <div className="brand" style={{ justifyContent: "center" }}>
            <div className="brand-mark" />
            LUNAR WINDOW
          </div>
          <div className="loader-bar">
            <b style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
          </div>
          <div className={error ? "loader-label error" : "loader-label"}>{error ?? progress.label}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${cinema ? "cinema" : ""}`}>
      <main className="stage">
        <Scene3D />
      </main>
      <TopBar />
      {roverOpen ? <RoverPanel /> : landerOpen ? <LanderPanel /> : finderOpen ? <FinderPanel /> : <SiteList />}
      <LayerControls />
      <SitePanel />
      {porkchopOpen ? <PorkchopPanel /> : compareOpen && <ComparePanel />}
      <Timeline />
      <Tour />
      <div className="kbd-hint">WASD move · R F up/down · Q E turn · drag look · right-drag pan · scroll zoom · click adds a point · Space play · ← → hour · H hide</div>
    </div>
  );
}
