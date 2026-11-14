import { create } from "zustand";
import type { AppData, Site } from "../data/load";
import type { FieldData } from "../data/field";
import type { GlobeData } from "../data/globe";
import type { LayerId } from "../gpu/layers";
import type { Quality } from "../three/lod";
import type { FinderResult } from "../gpu/finder";
import type { FieldMetrics } from "../gpu/engine";
import { LANDER_PRESETS, type Lander } from "../lib/lander";
import type { MonteCarloResult } from "../lib/montecarlo";

export const SPEEDS = [
  { label: "1 h/s", hoursPerSecond: 1 },
  { label: "6 h/s", hoursPerSecond: 6 },
  { label: "1 d/s", hoursPerSecond: 24 },
  { label: "4 d/s", hoursPerSecond: 96 },
];

interface AppState {
  data: AppData | null;
  field: FieldData | null;
  fieldProgress: number;
  fieldError: string | null;
  layer: LayerId;
  rangeDays: number;
  view: "3d" | "2d";
  cinema: boolean;
  finderOpen: boolean;
  quality: Quality;
  setQuality: (q: Quality) => void;
  porkchopOpen: boolean;
  setPorkchopOpen: (o: boolean) => void;
  poleField: FieldData | null;
  regionStatus: { label: string; progress: number; error?: string } | null;
  setRegionStatus: (s: { label: string; progress: number; error?: string } | null) => void;
  setActiveField: (f: FieldData) => void;
  landerOpen: boolean;
  lander: Lander;
  survival: FieldMetrics | null;
  mc: MonteCarloResult | null;
  flyRequest: { lat: number; lon: number; altKm: number; n: number } | null;
  setLanderOpen: (o: boolean) => void;
  setLander: (l: Lander) => void;
  setSurvival: (m: FieldMetrics | null) => void;
  setMc: (r: MonteCarloResult | null) => void;
  flyTo: (lat: number, lon: number, altKm: number) => void;
  globe: GlobeData | null;
  setGlobe: (g: GlobeData) => void;
  orbitRequest: number;
  requestOrbit: () => void;
  pinned: Site[];
  compareOpen: boolean;
  togglePin: (s: Site) => void;
  setCompareOpen: (o: boolean) => void;
  finder: FinderResult | null;
  setFinderOpen: (o: boolean) => void;
  setFinder: (r: FinderResult | null) => void;
  toggleCinema: () => void;
  setView: (v: "3d" | "2d") => void;
  customSite: Site | null;
  hour: number;
  playing: boolean;
  speedIndex: number;
  selectedId: string;
  setField: (f: FieldData) => void;
  setFieldProgress: (p: number) => void;
  setFieldError: (e: string) => void;
  setLayer: (l: LayerId) => void;
  setRangeDays: (d: number) => void;
  setCustomSite: (s: Site) => void;
  setData: (d: AppData) => void;
  setHour: (h: number) => void;
  togglePlaying: () => void;
  setSpeedIndex: (i: number) => void;
  select: (id: string) => void;
}

function loadQuality(): Quality {
  try {
    const q = localStorage.getItem("lw-quality");
    if (q === "saver" || q === "balanced" || q === "high") return q;
  } catch {
    return "balanced";
  }
  return "balanced";
}

export const useApp = create<AppState>((set, get) => ({
  data: null,
  field: null,
  fieldProgress: 0,
  fieldError: null,
  layer: "terrain",
  rangeDays: 30,
  view: "3d",
  cinema: false,
  finderOpen: false,
  quality: loadQuality(),
  setQuality: (quality) => {
    try {
      localStorage.setItem("lw-quality", quality);
    } catch (e) {
      void e;
    }
    set({ quality });
  },
  porkchopOpen: false,
  setPorkchopOpen: (porkchopOpen) => set((s) => ({ porkchopOpen, compareOpen: porkchopOpen ? false : s.compareOpen })),
  poleField: null,
  regionStatus: null,
  setRegionStatus: (regionStatus) => set({ regionStatus }),
  setActiveField: (field) =>
    set((s) => ({
      field,
      finder: null,
      survival: null,
      mc: null,
      layer: s.layer === "score" || s.layer === "survive" ? "terrain" : s.layer,
    })),
  landerOpen: false,
  lander: LANDER_PRESETS[0],
  survival: null,
  mc: null,
  flyRequest: null,
  setLanderOpen: (landerOpen) => set((s) => ({ landerOpen, finderOpen: landerOpen ? false : s.finderOpen })),
  setLander: (lander) => set({ lander }),
  setSurvival: (survival) => set((s) => ({ survival, layer: survival ? "survive" : s.layer === "survive" ? "terrain" : s.layer })),
  setMc: (mc) => set({ mc }),
  flyTo: (lat, lon, altKm) => set((s) => ({ flyRequest: { lat, lon, altKm, n: (s.flyRequest?.n ?? 0) + 1 }, view: "3d" })),
  globe: null,
  setGlobe: (globe) => set({ globe }),
  orbitRequest: 0,
  requestOrbit: () => set((s) => ({ orbitRequest: s.orbitRequest + 1, view: "3d" })),
  pinned: [],
  compareOpen: false,
  togglePin: (site) =>
    set((s) => {
      const has = s.pinned.some((p) => p.id === site.id);
      const pinned = has ? s.pinned.filter((p) => p.id !== site.id) : [...s.pinned, site].slice(-6);
      return { pinned, compareOpen: pinned.length >= 2 ? true : pinned.length === 0 ? false : s.compareOpen };
    }),
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  finder: null,
  setFinderOpen: (finderOpen) => set((s) => ({ finderOpen, landerOpen: finderOpen ? false : s.landerOpen })),
  setFinder: (finder) => set((s) => ({ finder, layer: finder ? "score" : s.layer === "score" ? "terrain" : s.layer, selectedId: finder?.candidates[0]?.site.id ?? s.selectedId })),
  toggleCinema: () => set((s) => ({ cinema: !s.cinema })),
  setView: (view) => set((s) => ({ view, layer: view === "3d" && s.layer === "now" ? "terrain" : s.layer })),
  customSite: null,
  setField: (field) => set({ field, poleField: field }),
  setFieldProgress: (fieldProgress) => set({ fieldProgress }),
  setFieldError: (fieldError) => set({ fieldError }),
  setLayer: (layer) => set({ layer }),
  setRangeDays: (rangeDays) => set({ rangeDays }),
  setCustomSite: (customSite) => set({ customSite, selectedId: customSite.id }),
  hour: 0,
  playing: false,
  speedIndex: 2,
  selectedId: "connecting-ridge-b",
  setData: (data) => {
    const now = Math.floor((Date.now() - data.ephem.startMs) / 3600e3);
    set({ data, hour: Math.max(0, Math.min(data.ephem.count - 1, now)) });
  },
  setHour: (h) => {
    const max = (get().data?.ephem.count ?? 1) - 1;
    set({ hour: Math.max(0, Math.min(max, h)) });
  },
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setSpeedIndex: (speedIndex) => set({ speedIndex }),
  select: (selectedId) => set({ selectedId }),
}));

export function hourToDate(data: AppData, hour: number) {
  return new Date(data.ephem.startMs + hour * 3600e3);
}

export function formatUtc(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function formatDuration(hours: number | null) {
  if (hours === null) return "—";
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

if (import.meta.env.DEV) (window as unknown as { __app: typeof useApp }).__app = useApp;
