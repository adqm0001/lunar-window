import { useEffect, useMemo, useRef, useState } from "react";
import { toMap } from "../lib/astro";
import { changedSurvivalInputs, LANDER_PRESETS, PANEL_LABEL, simulate, survivalInputs, type Lander, type PanelMode, type SimResult } from "../lib/lander";
import { monteCarlo } from "../lib/montecarlo";
import { inField } from "../data/field";
import { getEngine } from "../gpu/useFieldMetrics";
import { currentScene } from "../state/share";
import { formatDuration, formatUtc, hourToDate, useApp } from "../state/store";
import { useSelectedSite } from "../state/selectors";

const MISSIONS = [7, 14, 30, 90];
const MISSES: [string, number][] = [
  ["100 m", 100],
  ["Athena ~400 m", 400],
  ["1 km", 1000],
  ["2 km", 2000],
];

export default function LanderPanel() {
  const data = useApp((s) => s.data)!;
  const field = useApp((s) => s.field);
  const hour = useApp((s) => s.hour);
  const lander = useApp((s) => s.lander);
  const survival = useApp((s) => s.survival);
  const survivalFor = useApp((s) => s.survivalFor);
  const mc = useApp((s) => s.mc);
  const { setLander, setLanderOpen, setSurvival, setMc } = useApp.getState();
  const site = useSelectedSite();
  // Reopening the panel picks up the mission length the current map was simulated with.
  const [missionDays, setMissionDays] = useState(() => {
    const d = (useApp.getState().survivalFor?.hours ?? 0) / 24;
    return MISSIONS.includes(d) ? d : 14;
  });
  const [miss, setMiss] = useState(400);
  const [busy, setBusy] = useState(false);
  const start = Math.floor(hour);

  const sim: SimResult = useMemo(() => simulate(data.ephem, site, lander, start, missionDays * 24), [data, site, lander, start, missionDays]);

  const siteInField = useMemo(() => {
    if (!field) return false;
    const [x, y] = toMap(site.lat, site.lon);
    return inField(field, x, y);
  }, [field, site]);

  const inputs = useMemo(() => survivalInputs(lander, start, missionDays * 24), [lander, start, missionDays]);
  // The map and the landing odds belong to the settings they were simulated with; say which ones have changed since.
  const stale = survival && survivalFor ? changedSurvivalInputs(survivalFor, inputs) : [];

  const set = (patch: Partial<Lander>) => setLander({ ...lander, ...patch, name: "Custom" });

  const runMap = () => {
    if (!field) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const e = getEngine();
        if (!e) return;
        const m = e.computeSurvival(start, missionDays * 24, {
          panelW: lander.panelW,
          batteryWh: lander.batteryWh,
          dayLoadW: lander.dayLoadW,
          nightLoadW: lander.nightLoadW,
          minSocPct: lander.minSocPct,
          horizontal: lander.panel === "horizontal",
        });
        setSurvival(m, inputs);
        if (siteInField) {
          const [x, y] = toMap(site.lat, site.lon);
          setMc(monteCarlo(field, m, x, y, miss));
        } else setMc(null);
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  useEffect(() => {
    if (!survival || !field || !siteInField) return;
    const [x, y] = toMap(site.lat, site.lon);
    setMc(monteCarlo(field, survival, x, y, miss));
  }, [miss, site, survival, field, siteInField]);

  const survived = sim.diedAtHour === null;

  return (
    <aside className="left finder lander">
      <div className="finder-head">
        <div>
          <div className="finder-title">Lander simulator</div>
          <div className="finder-sub">Hour-by-hour battery at {site.name}</div>
        </div>
        <button className="icon-btn" onClick={() => setLanderOpen(false)} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="chips">
        {LANDER_PRESETS.map((p) => (
          <button key={p.name} className={`chip ${p.name === lander.name ? "sel" : ""}`} onClick={() => setLander(p)}>
            {p.name}
          </button>
        ))}
      </div>

      <label className="f-label">Solar panels</label>
      <div className="chips">
        {(Object.keys(PANEL_LABEL) as PanelMode[]).map((m) => (
          <button key={m} className={`chip ${m === lander.panel ? "sel" : ""}`} onClick={() => set({ panel: m })}>
            {PANEL_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="num-grid">
        <Num label="Panel power" unit="W" value={lander.panelW} onChange={(v) => set({ panelW: v })} />
        <Num label="Battery" unit="Wh" value={lander.batteryWh} onChange={(v) => set({ batteryWh: v })} />
        <Num label="Load (sunlit)" unit="W" value={lander.dayLoadW} onChange={(v) => set({ dayLoadW: v })} />
        <Num label="Load (dark, heaters)" unit="W" value={lander.nightLoadW} onChange={(v) => set({ nightLoadW: v })} />
        {lander.panel === "vertical" && (
          <label className="num">
            <span>Panel faces</span>
            <span className="chips">
              <button className={`chip ${lander.panelAz < 0 ? "sel" : ""}`} onClick={() => set({ panelAz: -1 })}>Sun at landing</button>
              <button className={`chip ${lander.panelAz >= 0 ? "sel" : ""}`} onClick={() => set({ panelAz: Math.round(sim.panelAz) })}>{lander.panelAz >= 0 ? `${lander.panelAz}°` : "Fixed"}</button>
            </span>
          </label>
        )}
        <Num label="Dead below" unit="%" value={lander.minSocPct} onChange={(v) => set({ minSocPct: v })} />
      </div>

      <label className="f-label">Mission from {formatUtc(hourToDate(data, start)).slice(0, 16)} UTC</label>
      <div className="chips">
        {MISSIONS.map((d) => (
          <button key={d} className={`chip ${d === missionDays ? "sel" : ""}`} onClick={() => setMissionDays(d)}>
            {d} d
          </button>
        ))}
      </div>

      <div className={`verdict ${survived ? "ok" : "bad"}`}>
        {survived ? `Survives ${missionDays} days` : `Battery dead after ${formatDuration(sim.diedAtHour)}`}
        <span>
          lowest charge {Math.round(sim.minSocPct)}% · {sim.energyInKWh.toFixed(1)} kWh collected
        </span>
      </div>
      <SocChart sim={sim} minSoc={lander.minSocPct} />

      <button
        className="btn view-lander"
        onClick={() => {
          useApp.getState().setView("3d");
          setTimeout(() => currentScene()?.viewLander(), 60);
        }}
      >
        👁 See the lander on the ground
      </button>

      <button className="btn primary search-btn" onClick={runMap} disabled={!field || busy}>
        {busy ? "Simulating…" : `Simulate ${field ? (field.meta.horizon.size ** 2).toLocaleString() : ""} landing spots`}
      </button>
      {survival && (
        <div className="f-stats">
          Every spot simulated hour by hour on the GPU in {survival.millis.toFixed(0)} ms (vertical panels modeled as Sun-tracking on the map)
        </div>
      )}
      {stale.length > 0 && (
        <div className="f-hint warn" role="status">
          Out of date: the {joinNames(stale)} changed since the map was simulated, so the map and the landing odds below are for the earlier
          settings. Simulate again to update them.
        </div>
      )}

      <label className="f-label">Landing miss (how far off target you might touch down)</label>
      <div className="chips">
        {MISSES.map(([l, m]) => (
          <button key={l} className={`chip ${m === miss ? "sel" : ""}`} onClick={() => setMiss(m)}>
            {l}
          </button>
        ))}
      </div>
      {!survival && <div className="f-hint">Run the map simulation first, then 4,000 random touchdowns are scored around this site.</div>}
      {survival && !siteInField && <div className="f-hint">Landing-miss odds need a detailed area here. Use “⚡ Analyze this area in detail” in the right panel.</div>}
      {mc && siteInField && (
        <div className={stale.length ? "mc stale" : "mc"}>
          <div className="mc-big" style={{ color: mc.okPct >= 90 ? "var(--link)" : mc.okPct >= 60 ? "#ffd27a" : "var(--danger)" }}>
            {mc.okPct.toFixed(1)}%
          </div>
          <div className="mc-text">
            of {mc.points.length.toLocaleString()} simulated touchdowns within ~{miss >= 1000 ? `${miss / 1000} km` : `${miss} m`} survive the full mission. Worst case
            lasts {Math.round(mc.worstLived * 100)}% of it. Green and red dots show each touchdown in 3D.
          </div>
        </div>
      )}
    </aside>
  );
}

function joinNames(names: string[]) {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function Num({ label, unit, value, onChange }: { label: string; unit: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="num">
      <span>{label}</span>
      <span className="num-in">
        <input type="number" value={value} min={0} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
        <i>{unit}</i>
      </span>
    </label>
  );
}

function SocChart({ sim, minSoc }: { sim: SimResult; minSoc: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const n = sim.hours;
    const maxP = Math.max(1, ...sim.power);
    for (let k = 0; k < n; k++) {
      const v = sim.power[k] / maxP;
      if (v <= 0.01) continue;
      g.fillStyle = `rgba(255,181,71,${0.08 + 0.25 * v})`;
      g.fillRect((k / n) * w, 0, Math.max(1, w / n + 0.5), h);
    }
    g.strokeStyle = "rgba(255,93,108,0.6)";
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(0, h - (minSoc / 100) * h);
    g.lineTo(w, h - (minSoc / 100) * h);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = sim.diedAtHour === null ? "#3ddc97" : "#ff5d6c";
    g.lineWidth = 1.6;
    g.beginPath();
    for (let k = 0; k <= n; k++) {
      const x = (k / n) * w;
      const y = h - (sim.soc[k] / 100) * (h - 2) - 1;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = "#7d889b";
    g.font = "9px JetBrains Mono, monospace";
    g.fillText("battery %", 4, 10);
    g.fillText(`${Math.round(n / 24)} d`, w - 22, h - 3);
  }, [sim, minSoc]);
  return <canvas ref={ref} className="soc-chart" />;
}
