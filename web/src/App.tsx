import { useEffect, useState } from "react";
import { loadAppData } from "./data/load";
import { loadField } from "./data/field";
import { useApp } from "./state/store";
import { usePlayback } from "./state/usePlayback";
import TopBar from "./components/TopBar";
import SiteList from "./components/SiteList";
import MapView from "./components/MapView";
import SitePanel from "./components/SitePanel";
import Timeline from "./components/Timeline";
import Scene3D from "./components/Scene3D";
import LayerControls from "./components/LayerControls";
import FinderPanel from "./components/FinderPanel";

export default function App() {
  const data = useApp((s) => s.data);
  const setData = useApp((s) => s.setData);
  const view = useApp((s) => s.view);
  const cinema = useApp((s) => s.cinema);
  const finderOpen = useApp((s) => s.finderOpen);

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
    loadAppData((fraction, label) => setProgress({ fraction, label }))
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [setData]);

  useEffect(() => {
    if (!data) return;
    const s = useApp.getState();
    loadField(s.setFieldProgress)
      .then(s.setField)
      .catch((e: Error) => s.setFieldError(e.message));
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
      <main className="stage">{view === "3d" ? <Scene3D /> : <MapView />}</main>
      <TopBar />
      {finderOpen ? <FinderPanel /> : <SiteList />}
      <LayerControls />
      <SitePanel />
      <Timeline />
      <div className="kbd-hint">H hide panels · Space play · ← → hour · Shift ← → day · drag to orbit · click terrain to analyze</div>
    </div>
  );
}
