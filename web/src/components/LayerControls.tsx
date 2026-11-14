import { gradientCss, layerDef, LAYERS } from "../gpu/layers";
import { useFieldMetrics } from "../gpu/useFieldMetrics";
import { formatUtc, hourToDate, useApp } from "../state/store";

const RANGES = [7, 30, 90, 365];

export default function LayerControls() {
  const data = useApp((s) => s.data)!;
  const field = useApp((s) => s.field);
  const fieldProgress = useApp((s) => s.fieldProgress);
  const fieldError = useApp((s) => s.fieldError);
  const layer = useApp((s) => s.layer);
  const rangeDays = useApp((s) => s.rangeDays);
  const view = useApp((s) => s.view);
  const hasFinder = useApp((s) => !!s.finder);
  const finderOpen = useApp((s) => s.finderOpen);
  const { setLayer, setRangeDays, setView } = useApp.getState();
  const { metrics, error: gpuError, start, hours } = useFieldMetrics();
  const def = layerDef(layer);

  return (
    <>
      <div className="glass layer-bar">
        <div className="seg">
          {(["3d", "2d"] as const).map((v) => (
            <button key={v} className={`chip ${v === view ? "sel" : ""}`} onClick={() => setView(v)}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="chip-sep" />
        {LAYERS.filter((l) => !(view === "3d" && l.id === "now") && (l.id !== "score" || hasFinder)).map((l) => (
          <button key={l.id} className={`chip ${l.id === layer ? "sel" : ""}`} onClick={() => setLayer(l.id)} title={l.describe}>
            {view === "3d" && l.id === "terrain" ? "Shadows" : l.short}
          </button>
        ))}
        <span className="chip-sep" />
        <button className={`chip find ${finderOpen ? "sel" : ""}`} onClick={() => useApp.getState().setFinderOpen(!finderOpen)}>
          ★ Find landing spot
        </button>
        {def.ranged && (
          <>
            <span className="chip-sep" />
            {RANGES.map((d) => (
              <button key={d} className={`chip ${d === rangeDays ? "sel" : ""}`} onClick={() => setRangeDays(d)}>
                {d === 365 ? "1y" : `${d}d`}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="glass map-legend">
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
        <div className="legend-desc">
          {view === "3d" && layer === "terrain" ? "Every pixel tests the Sun against its own terrain horizon, every frame." : def.describe}
        </div>
        {def.ranged && (
          <div className="legend-desc mono">
            {formatUtc(hourToDate(data, start)).slice(0, 10)} → {formatUtc(hourToDate(data, start + hours)).slice(0, 10)}
          </div>
        )}
        {metrics && def.ranged && (
          <div className="legend-gpu">
            GPU · {(metrics.size * metrics.size).toLocaleString()} points × {Math.round(metrics.hours / metrics.stride).toLocaleString()} steps ·{" "}
            {metrics.millis.toFixed(0)} ms
          </div>
        )}
        {!field && !fieldError && <div className="legend-gpu">Loading terrain field {Math.round(fieldProgress * 100)}%</div>}
        {(fieldError || gpuError) && <div className="legend-gpu error">{fieldError ?? gpuError}</div>}
      </div>
    </>
  );
}
