import { lazy, useEffect, useState } from "react";
import { loadAppData } from "./data/load";
import { loadField } from "./data/field";
import { loadGlobe, startPolar80 } from "./data/globe";
import { useApp } from "./state/store";
import { applyEarly, currentScene, openedFromLink, syncUrl } from "./state/share";
import { usePlayback } from "./state/usePlayback";
import TopBar, { type PanelAppearance } from "./components/TopBar";
import PanelResizeHandle from "./components/PanelResizeHandle";
import SiteList from "./components/SiteList";
import SitePanel from "./components/SitePanel";
import Timeline from "./components/Timeline";
import Scene3D from "./components/Scene3D";
import LayerControls from "./components/LayerControls";
import Tour from "./components/Tour";
import MobileNav from "./components/MobileNav";
import PlaybackQualityNotice from "./components/PlaybackQualityNotice";
import LazyPanel from "./components/LazyPanel";

const FinderPanel = lazy(() => import("./components/FinderPanel"));
const ComparePanel = lazy(() => import("./components/ComparePanel"));
const LanderPanel = lazy(() => import("./components/LanderPanel"));
const RoverPanel = lazy(() => import("./components/RoverPanel"));
const PorkchopPanel = lazy(() => import("./components/PorkchopPanel"));

let startedField = false;
let startedData = false;
let startedReplay = false;

export default function App() {
  const [panelAppearance, setPanelAppearance] = useState<PanelAppearance>(() => {
    try {
      const saved = localStorage.getItem("lw-panel-appearance");
      if (saved === "solid") return saved;
    } catch {
      // Glass is the default appearance when storage is unavailable.
    }
    return "glass";
  });
  useEffect(() => {
    try { localStorage.setItem("lw-panel-appearance", panelAppearance); } catch { /* optional persistence */ }
  }, [panelAppearance]);
  const data = useApp((s) => s.data);
  const setData = useApp((s) => s.setData);
  const cinema = useApp((s) => s.cinema);
  const finderOpen = useApp((s) => s.finderOpen);
  const compareOpen = useApp((s) => s.compareOpen);
  const landerOpen = useApp((s) => s.landerOpen);
  const roverOpen = useApp((s) => s.roverOpen);
  const mobilePanel = useApp((s) => s.mobilePanel);
  const porkchopOpen = useApp((s) => s.porkchopOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, select, textarea, [contenteditable=true]")) return;
      // Space presses a focused button, link, select or chip; it only plays/pauses from the page or the 3D view.
      if (e.key === " " && e.target instanceof Element && e.target.closest("button, a, select, textarea, [role=button], [contenteditable=true]")) return;
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

  // Opened from a "Replay" entry (not from a shared link, which already says where to look): jump to the replay's
  // start, select its site, show the lander and play at 1 h/s. The camera flies to the lander once the 3D scene,
  // terrain and lander are up.
  useEffect(() => {
    if (!data?.replay || openedFromLink() || startedReplay) return;
    startedReplay = true;
    const r = data.replay;
    const s = useApp.getState();
    s.setHour((Date.parse(r.startUtc) - data.ephem.startMs) / 3600e3);
    s.select(r.siteId);
    s.setLanderOpen(true);
    s.setSpeedIndex(0);
    if (!s.playing) s.togglePlaying();
    const t0 = Date.now();
    const id = setInterval(() => {
      const st = useApp.getState();
      const scene = currentScene();
      if (scene && st.field && st.globe && st.landerOpen) {
        clearInterval(id);
        setTimeout(() => currentScene()?.viewLander(), 300);
      } else if (Date.now() - t0 > 30000) clearInterval(id);
    }, 250);
  }, [data]);

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
      .then((g) => {
        s.setGlobe(g);
        startPolar80(g, {
          focus: () => currentScene()?.polarFocus() ?? null,
          onStart: () => currentScene()?.beginPolar80(),
          onTile: (t) => currentScene()?.applyPolar80Tile(t),
        }).catch((e: Error) => console.warn("80 m polar terrain failed to load:", e.message));
      })
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
    <div className={`app ${cinema ? "cinema" : ""} m-${mobilePanel}`} data-panel-appearance={panelAppearance}>
      <main className="stage">
        <Scene3D />
      </main>
      <TopBar panelAppearance={panelAppearance} setPanelAppearance={setPanelAppearance} />
      {roverOpen ? (
        <LazyPanel key="rover" name="the rover route planner" onClose={() => useApp.getState().setRoverOpen(false)}>
          <RoverPanel />
        </LazyPanel>
      ) : landerOpen ? (
        <LazyPanel key="lander" name="the lander simulator" onClose={() => useApp.getState().setLanderOpen(false)}>
          <LanderPanel />
        </LazyPanel>
      ) : finderOpen ? (
        <LazyPanel key="finder" name="the landing spot finder" onClose={() => useApp.getState().setFinderOpen(false)}>
          <FinderPanel />
        </LazyPanel>
      ) : (
        <SiteList />
      )}
      <LayerControls />
      <SitePanel />
      <PanelResizeHandle side="left" />
      <PanelResizeHandle side="right" />
      {porkchopOpen ? (
        <LazyPanel key="porkchop" name="the landing dates chart" onClose={() => useApp.getState().setPorkchopOpen(false)}>
          <PorkchopPanel />
        </LazyPanel>
      ) : (
        compareOpen && (
          <LazyPanel key="compare" name="the compare table" onClose={() => useApp.getState().setCompareOpen(false)}>
            <ComparePanel />
          </LazyPanel>
        )
      )}
      <Timeline />
      <Tour />
      <MobileNav />
      <PlaybackQualityNotice />
    </div>
  );
}
