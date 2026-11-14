import { useEffect, useState } from "react";
import { loadAppData } from "./data/load";
import { useApp } from "./state/store";
import { usePlayback } from "./state/usePlayback";
import TopBar from "./components/TopBar";
import SiteList from "./components/SiteList";
import MapView from "./components/MapView";
import SitePanel from "./components/SitePanel";
import Timeline from "./components/Timeline";

export default function App() {
  const data = useApp((s) => s.data);
  const setData = useApp((s) => s.setData);
  const [progress, setProgress] = useState({ fraction: 0, label: "Starting" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAppData((fraction, label) => setProgress({ fraction, label }))
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [setData]);

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
      <TopBar />
      <SiteList />
      <main className="main">
        <MapView />
      </main>
      <SitePanel />
      <Timeline />
    </div>
  );
}
