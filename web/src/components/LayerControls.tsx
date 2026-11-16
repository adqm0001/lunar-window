import Icon from "./Icon";
import { useSelectedSite } from "../state/selectors";
import { lazy, useLayoutEffect, useRef } from "react";
import { gradientCss, layerDef, LAYERS, PALETTE_LAYERS, type Palette } from "../gpu/layers";
import { useFieldMetrics } from "../gpu/useFieldMetrics";
import { formatUtc, hourToDate, useApp } from "../state/store";
import ControlMenu from "./ControlMenu";
import { iceCovered } from "../gpu/thermal";
import LazyPanel from "./LazyPanel";

const RegionReport = lazy(() => import("./RegionReport"));

const RANGES = [7, 30, 90, 365];

function PaletteControls({ palette, onChange }: { palette: Palette; onChange: (p: Palette) => void }) {
  return (
    <div className="seg" role="group" aria-label="Map color palette" onKeyDown={(event) => {
      // Let the focused button use Space before the app's playback shortcut.
      if (event.key === " ") event.stopPropagation();
    }}>
      <button className={`chip ${palette === "default" ? "sel" : ""}`} aria-pressed={palette === "default"}
        onClick={() => onChange("default")} title="Original layer colors">Default colors</button>
      <button className={`chip ${palette === "viridis" ? "sel" : ""}`} aria-pressed={palette === "viridis"}
        onClick={() => onChange("viridis")} title="A color-blind-friendly map palette">Viridis</button>
    </div>
  );
}

export default function LayerControls() {
  const actionsRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const actions = actionsRef.current;
    if (!actions) return;
    const update = () => document.body.style.setProperty("--map-actions-h", actions.offsetHeight + "px");
    const resize = new ResizeObserver(update);
    resize.observe(actions);
    update();
    return () => {
      resize.disconnect();
      document.body.style.removeProperty("--map-actions-h");
    };
  }, []);
  const selectedSite = useSelectedSite();
  const split = useApp((s) => s.split);
  const data = useApp((s) => s.data)!;
  const field = useApp((s) => s.field);
  const fieldProgress = useApp((s) => s.fieldProgress);
  const fieldError = useApp((s) => s.fieldError);
  const layer = useApp((s) => s.layer);
  const cinema = useApp((s) => s.cinema);
  const palette = useApp((s) => s.palette);
  const setPalette = useApp((s) => s.setPalette);
  const rangeDays = useApp((s) => s.rangeDays);
  const view = useApp((s) => s.view);
  const visibleFieldError = view === "2d" ? fieldError : null;
  const poleField = useApp((s) => s.poleField);
  const cutaway = useApp((s) => s.cutaway);
  const regionStatus = useApp((s) => s.regionStatus);
  const globalStatus = useApp((s) => s.globalStatus);
  const globalInfo = useApp((s) => s.globalInfo);
  const hasFinder = useApp((s) => !!s.finder);
  const hasSurvival = useApp((s) => !!s.survival);
  const landerOpen = useApp((s) => s.landerOpen);
  const porkchopOpen = useApp((s) => s.porkchopOpen);
  const finderOpen = useApp((s) => s.finderOpen);
  const roverOpen = useApp((s) => s.roverOpen);
  const report = useApp((s) => s.reportOpen);
  const setReport = useApp((s) => s.setReportOpen);
  const { setLayer, setRangeDays, setView } = useApp.getState();
  const { metrics, error: gpuError, start, hours } = useFieldMetrics();
  // Near the end of the ephemeris the GPU only has the hours that are left; say so instead of showing the full range.
  const covered = Math.max(0, Math.min(hours, data.ephem.count - start));
  const def = layerDef(layer, palette);
  const hasPalette = PALETTE_LAYERS.includes(layer);

  return (
    <>
      <div className="glass layer-bar" aria-label="Map controls" role="group">
        <div className="seg control-options view-options" role="group" aria-label="Map view">
          {(["3d", "2d"] as const).map((v) => (
            <button key={v} className="control-action" aria-pressed={v === view} onClick={() => setView(v)}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>
        {!cinema && (
          <>
            <ControlMenu label="Layers" value={view === "3d" && layer === "terrain" ? "Shadows" : def.short}>
              {(close) => (
                <>
                  <div className="layer-context">
                    <div className="legend-title">{view === "3d" && layer === "terrain" ? "Real-time shadows" : def.label}</div>
                    {def.stops.length > 0 && (
                      <>
                        <div className="legend-bar" style={{ background: gradientCss(def.stops) }} />
                        <div className="legend-ends">
                          <span>{def.legend[0]}</span>
                          <span>{def.legend[1]}</span>
                        </div>
                      </>
                    )}
                    {(def.ranged || layer === "ice") && (
                      <div className="legend-desc mono">
                        {formatUtc(hourToDate(data, start)).slice(0, 10)} → {formatUtc(hourToDate(data, start + covered)).slice(0, 10)}
                        {covered < hours && ` · data ends: ${covered < 48 ? `${covered} h` : `${Math.round(covered / 24)} d`} of ${Math.round(hours / 24)} d`}
                      </div>
                    )}
        {layer === "ice" && !iceCovered(data.ephem.count, start) && (
          <div className="legend-desc warn" role="status">
            Not shown: ice stability needs a full year of sunlight and the data ends sooner.{" "}
            {iceCovered(data.ephem.count, 0)
              ? "Move the timeline back at least a year before the end."
              : `This dataset covers only ${Math.round(data.ephem.count / 24)} days.`}
          </div>
        )}
                    {globalInfo && view === "3d" && !globalStatus && (
                      <div className="legend-gpu">
                        Whole Moon · {globalInfo.points.toLocaleString()} points × {globalInfo.steps.toLocaleString()} steps · {globalInfo.millis.toFixed(0)} ms
                      </div>
                    )}
                    <details className="legend-details">
                      <summary>Layer details</summary>
                      <div className="legend-desc">
                        {view === "3d" && layer === "terrain" ? "Every pixel tests the Sun against its own terrain horizon, every frame." : def.describe}
                      </div>
                      {metrics && (def.ranged || layer === "ice") && (
                        <div className="legend-gpu">
                          GPU · {(metrics.size * metrics.size).toLocaleString()} points × {Math.round(metrics.hours / metrics.stride).toLocaleString()} steps
                          {(layer === "temp" || layer === "ice") && " × 14 soil layers"} · {metrics.millis.toFixed(0)} ms
                        </div>
                      )}
                      {(layer === "temp" || layer === "ice") && (
                        <div className="legend-desc">
                          Soil physics from Hayne et al. 2017 (Diviner). Light and heat bounced off surrounding slopes follow Ingersoll et al. 1992, which keeps Shackleton's
                          shadowed floor at roughly 40–100 K instead of the ~25 K you'd get from direct sunlight alone. Other craters differ with their depth and Sun angle.
                        </div>
                      )}
                      {field && <div className="legend-desc mono">Detailed area: {field.meta.label ?? "south pole (C++ engine, 40 m)"}</div>}
                      {field?.meta.source && <div className="legend-desc mono">{field.meta.source}</div>}
                    </details>
                    {field?.meta.label && poleField && (
                      <button className="chip" style={{ marginTop: 6 }} onClick={() => { useApp.getState().setActiveField(poleField); close(); }}>
                        ← Back to south pole area
                      </button>
                    )}
                  </div>
                  {LAYERS.filter((l) => !(view === "3d" && l.id === "now") && (l.id !== "score" || hasFinder) && (l.id !== "survive" || hasSurvival)).map((l) => (
                    <button key={l.id} className="control-action" aria-pressed={l.id === layer}
                      onClick={() => { setLayer(l.id); close(); }} title={l.describe}>
                      {view === "3d" && l.id === "terrain" ? "Real-time shadows" : l.label}
                    </button>
                  ))}
                  {hasPalette && (
                    <>
                      <div className="control-label">Palette</div>
                      <PaletteControls palette={palette} onChange={setPalette} />
                    </>
                  )}
                </>
              )}
            </ControlMenu>
            {def.ranged && (
              <label className="range-control">
                <span>Range</span>
                <select aria-label="Date range" value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))}>
                  {RANGES.map((d) => <option key={d} value={d}>{d === 365 ? "1 year" : d + " days"}</option>)}
                </select>
              </label>
            )}
            <ControlMenu label="Tools" align="end">
              {(close) => (
                <>
                  <div className="control-label">Mission planning</div>
                  <button className="control-action" aria-pressed={finderOpen}
                    onClick={() => { close(); useApp.getState().setFinderOpen(!finderOpen); }}>Landing site finder</button>
                  <button className="control-action" aria-pressed={porkchopOpen}
                    onClick={() => { close(); useApp.getState().setPorkchopOpen(!porkchopOpen); }}>Landing date analysis</button>
                  <button className="control-action" aria-pressed={landerOpen}
                    onClick={() => { close(); useApp.getState().setLanderOpen(!landerOpen); }}>Lander sim</button>
                  <button className="control-action" aria-pressed={roverOpen}
                    onClick={() => { close(); useApp.getState().setRoverOpen(!roverOpen); }}>Rover route</button>
                  <button className="control-action" onClick={() => { close(); setReport(true); }}>Artemis III report</button>
                  <div className="control-label">Moon view</div>
                  <button className="control-action" onClick={() => { close(); useApp.getState().requestOrbit(); }}>Zoom out to Moon</button>
                  <button className="control-action" aria-pressed={cutaway}
                    onClick={() => { close(); useApp.getState().toggleCutaway(); }}>Inside the Moon</button>
                </>
              )}
            </ControlMenu>
          </>
        )}
        {report && (
          <LazyPanel name="the Artemis III report" onClose={() => setReport(false)}>
            <RegionReport onClose={() => setReport(false)} />
          </LazyPanel>
        )}
      </div>

      <nav ref={actionsRef} className="glass map-actions" aria-label="Mission planning">
        <button className="control-trigger mission-primary" aria-pressed={finderOpen}
          title="Rank sites for your landing time, mission length, and limits"
          onClick={() => {
            useApp.getState().setFinderOpen(!finderOpen);
            useApp.getState().setMobilePanel(finderOpen ? "none" : "sites");
          }}>
          <Icon name="target" /> Find best site
        </button>
        <button className="control-trigger" aria-pressed={porkchopOpen} onClick={() => {
          useApp.getState().setPorkchopOpen(!porkchopOpen);
          useApp.getState().setMobilePanel("none");
        }}>
          <Icon name="calendar" /> Landing dates
        </button>
        <button className="control-trigger" onClick={() => {
          const state = useApp.getState();
          if (split) {
            state.setSplit(false);
            state.setCompareOpen(false);
            return;
          }
          if (!state.pinned.some((site) => site.id === selectedSite.id)) state.togglePin(selectedSite);
          state.setCompareOpen(true);
          state.setMobilePanel("none");
        }}>
          <Icon name="compare" /> {split ? "Exit comparison" : "Compare sites"}
        </button>
        <button className="control-trigger" onClick={() => useApp.getState().requestOrbit()}>
          <Icon name="moon" /> Whole Moon
        </button>
      </nav>
      {(globalStatus || regionStatus || (!field && !fieldError) || visibleFieldError || gpuError) && (
        <div className="glass layer-job" role="status">
          {globalStatus && <div>{globalStatus}</div>}
          {regionStatus && (
            <div className={regionStatus.error ? "error" : undefined}>
              {regionStatus.error ?? `Computing ${regionStatus.label} horizons… ${Math.round(regionStatus.progress * 100)}%`}
            </div>
          )}
          {!field && !fieldError && <div>Loading terrain field {Math.round(fieldProgress * 100)}%</div>}
          {(visibleFieldError || gpuError) && <div className="error">{visibleFieldError ?? gpuError}</div>}
        </div>
      )}
    </>
  );
}
