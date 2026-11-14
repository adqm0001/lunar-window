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

export default function App() {
  const data = useApp((s) => s.data);
  const setData = useApp((s) => s.setData);
  const view = useApp((s) => s.view);
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
    <div className="app">
      <main className="stage">{view === "3d" ? <Scene3D /> : <MapView />}</main>
      <TopBar />
      <SiteList />
      <LayerControls />
      <SitePanel />
      <Timeline />
    </div>
  );
}
