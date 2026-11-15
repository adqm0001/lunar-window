import { LAYERS, type LayerId } from "../gpu/layers";
import { addPointAt } from "../lib/points";
import type { MoonScene, ViewState } from "../three/MoonScene";
import { useApp } from "./store";

// The whole view lives in the URL hash so a link opens exactly what you were looking at:
// #t=hour&s=site&l=layer&r=days&v=3d&p=lat,lon,name;...&c=orbit,tLat,tLon,cLat,cLon,altKm

interface Shared {
  t?: number;
  s?: string;
  l?: LayerId;
  r?: number;
  v?: "2d" | "3d";
  p?: { lat: number; lon: number; name: string }[];
  c?: ViewState;
}

let scene: MoonScene | null = null;
export function registerScene(s: MoonScene | null) {
  scene = s;
}

export function currentScene() {
  return scene;
}

const fix = (n: number, d: number) => Number(n.toFixed(d));
const MAX_SHARED_POINTS = 20;

function parse(hash: string): Shared | null {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  if ([...q.keys()].length === 0) return null;
  const out: Shared = {};
  const t = Number(q.get("t"));
  if (q.has("t") && Number.isFinite(t)) out.t = t;
  if (q.get("s")) out.s = q.get("s")!;
  const l = q.get("l");
  if (l && LAYERS.some((x) => x.id === l)) out.l = l as LayerId;
  const r = Number(q.get("r"));
  if (q.has("r") && r > 0) out.r = r;
  const v = q.get("v");
  if (v === "2d" || v === "3d") out.v = v;
  const p = q.get("p");
  if (p)
    out.p = p
      .split(";")
      .map((e) => e.split(","))
      .filter((a) => a.length >= 2 && Number.isFinite(Number(a[0])) && Number.isFinite(Number(a[1])))
      .slice(0, MAX_SHARED_POINTS)
      .map((a) => ({ lat: Number(a[0]), lon: Number(a[1]), name: decodeURIComponent(a.slice(2).join(",") || "") }));
  const c = q.get("c")?.split(",").map(Number);
  if (c && c.length === 6 && c.every(Number.isFinite)) out.c = { orbit: c[0] === 1, t: [c[1], c[2]], c: [c[3], c[4], c[5]] };
  return out;
}

const pending = typeof location !== "undefined" ? parse(location.hash) : null;
let applied = !pending;

export function openedFromLink(): boolean {
  return !!pending;
}

export function sharedCamera(): ViewState | null {
  return pending?.c ?? null;
}

export function encodeState(): string {
  const st = useApp.getState();
  // Finder IDs expire with the search. Share its selected result as a normal point, keeping
  // the newest points within the same 20-point limit used when adding a point in the app.
  const result = st.finder?.candidates.find((c) => c.site.id === st.selectedId)?.site;
  const points = result ? [...st.customSites.slice(-(MAX_SHARED_POINTS - 1)), result] : st.customSites;
  const q = new URLSearchParams();
  q.set("t", String(st.hour));
  const pi = points.findIndex((c) => c.id === st.selectedId);
  q.set("s", pi >= 0 ? `p${pi}` : st.selectedId);
  q.set("l", st.layer);
  q.set("r", String(st.rangeDays));
  q.set("v", st.view);
  if (points.length)
    q.set("p", points.map((c) => `${fix(c.lat, 4)},${fix(c.lon, 4)},${encodeURIComponent(c.name)}`).join(";"));
  const cam = scene?.getView();
  if (cam && st.view === "3d")
    q.set("c", [cam.orbit ? 1 : 0, fix(cam.t[0], 4), fix(cam.t[1], 4), fix(cam.c[0], 4), fix(cam.c[1], 4), fix(cam.c[2], 3)].join(","));
  return "#" + q.toString();
}

// Called once the ephemeris is loaded: time, layer, range, view and a built-in site.
export function applyEarly() {
  if (!pending) return;
  const st = useApp.getState();
  if (pending.t !== undefined) st.setHour(pending.t);
  if (pending.r) st.setRangeDays(pending.r);
  if (pending.v) st.setView(pending.v);
  if (pending.l && pending.l !== "score" && pending.l !== "survive") st.setLayer(pending.l);
  if (pending.s && !/^p\d+$/.test(pending.s) && st.data?.sites.some((x) => x.id === pending.s)) st.select(pending.s);
}

// Called once the globe and terrain field are loaded: custom points, then the camera.
export function applyLate() {
  if (applied || !pending) return;
  applied = true;
  const ids: string[] = [];
  for (const p of pending.p ?? []) {
    const s = addPointAt(p.lat, p.lon, p.name || undefined);
    if (s) ids.push(s.id);
  }
  const st = useApp.getState();
  const m = pending.s?.match(/^p(\d+)$/);
  if (m && ids[Number(m[1])]) st.select(ids[Number(m[1])]);
  else if (pending.s && st.data?.sites.some((x) => x.id === pending.s)) st.select(pending.s);
  if (pending.c) setTimeout(() => scene?.setView(pending.c!), 50);
}

export function isShareApplied() {
  return applied;
}

let lastHash = "";
export function syncUrl() {
  if (!applied) return;
  const h = encodeState();
  if (h !== lastHash) {
    lastHash = h;
    history.replaceState(null, "", h);
  }
}

export async function copyShareLink(): Promise<boolean> {
  syncUrl();
  const url = location.href.split("#")[0] + encodeState();
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // The async clipboard is refused in some browsers and embedded views; the older copy command often still works.
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
