import { create } from "zustand";
import type { AppData, Site } from "../data/load";
import type { FieldData } from "../data/field";
import type { GlobeData } from "../data/globe";
import type { LayerId, Palette } from "../gpu/layers";
import type { Quality } from "../three/lod";
import type { FinderResult } from "../gpu/finder";
import type { FieldMetrics } from "../gpu/engine";
import { LANDER_PRESETS, type Lander, type SurvivalInputs } from "../lib/lander";
import type { MonteCarloResult } from "../lib/montecarlo";
import { isRoute, type RoverFailure, type RoverRoute } from "../lib/rover";

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
  cutaway: boolean;
  toggleCutaway: () => void;
  quality: Quality;
  setQuality: (q: Quality) => void;
  palette: Palette;
  setPalette: (p: Palette) => void;
  porkchopOpen: boolean;
  setPorkchopOpen: (o: boolean) => void;
  poleField: FieldData | null;
  regionStatus: { label: string; progress: number; error?: string } | null;
  setRegionStatus: (s: { label: string; progress: number; error?: string } | null) => void;
  setActiveField: (f: FieldData) => void;
  landerOpen: boolean;
  roverOpen: boolean;
  tourStep: number | null;
  globalStatus: string | null;
  setGlobalStatus: (s: string | null) => void;
  globalInfo: { points: number; steps: number; millis: number; horizonMillis: number } | null;
  setGlobalInfo: (i: { points: number; steps: number; millis: number; horizonMillis: number } | null) => void;
  setTourStep: (n: number | null) => void;
  validationOpen: boolean;
  reportOpen: boolean;
  skylineOpen: boolean;
  setSkylineOpen: (open: boolean) => void;
  mobilePanel: "none" | "sites" | "site" | "time";
  setMobilePanel: (p: "none" | "sites" | "site" | "time") => void;
  setReportOpen: (o: boolean) => void;
  setValidationOpen: (o: boolean) => void;
  rover: RoverRoute | RoverFailure | null;
  roverDestination: Pick<Site, "id" | "name" | "lat" | "lon"> | null;
  setRoverOpen: (o: boolean) => void;
  setRover: (r: RoverRoute | RoverFailure | null, destination?: Site | null) => void;
  lander: Lander;
  survival: FieldMetrics | null;
  /** The settings `survival` was simulated with. */
  survivalFor: SurvivalInputs | null;
  mc: MonteCarloResult | null;
  flyRequest: { lat: number; lon: number; altKm: number; n: number } | null;
  setLanderOpen: (o: boolean) => void;
  setLander: (l: Lander) => void;
  setSurvival: (m: FieldMetrics | null, inputs?: SurvivalInputs | null) => void;
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
  /** Side-by-side 3D views of the first two pinned sites. */
  split: boolean;
  setSplit: (on: boolean) => void;
  finder: FinderResult | null;
  setFinderOpen: (o: boolean) => void;
  setFinder: (r: FinderResult | null) => void;
  toggleCinema: () => void;
  setView: (v: "3d" | "2d") => void;
  customSites: Site[];
  pointSeq: number;
  hour: number;
  playing: boolean;
  speedIndex: number;
  selectedId: string;
  setField: (f: FieldData) => void;
  setFieldProgress: (p: number) => void;
  setFieldError: (e: string | null) => void;
  setLayer: (l: LayerId) => void;
  setRangeDays: (d: number) => void;
  setCustomSite: (s: Site) => void;
  removeCustomSite: (id: string) => void;
  renameCustomSite: (id: string, name: string) => void;
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

function loadPalette(): Palette {
  try {
    return localStorage.getItem("lw-palette") === "viridis" ? "viridis" : "default";
  } catch {
    return "default";
  }
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
  cutaway: false,
  toggleCutaway: () => set((s) => ({ cutaway: !s.cutaway, view: "3d" })),
  quality: loadQuality(),
  setQuality: (quality) => {
    try {
      localStorage.setItem("lw-quality", quality);
    } catch (e) {
      void e;
    }
    set({ quality });
  },
  palette: loadPalette(),
  setPalette: (palette) => {
    try {
      localStorage.setItem("lw-palette", palette);
    } catch (e) {
      void e;
    }
    set({ palette });
  },
  porkchopOpen: false,
  setPorkchopOpen: (porkchopOpen) => set((s) => ({ porkchopOpen, compareOpen: porkchopOpen ? false : s.compareOpen, split: porkchopOpen ? false : s.split })),
  poleField: null,
  regionStatus: null,
  setRegionStatus: (regionStatus) => set({ regionStatus }),
  setActiveField: (field) =>
    set((s) => ({
      field,
      finder: null,
      survival: null,
      survivalFor: null,
      mc: null,
      rover: null,
      roverDestination: null,
      layer: s.layer === "score" || s.layer === "survive" ? "terrain" : s.layer,
      selectedId: resolveSelection(s.selectedId, s.data, s.customSites, null),
    })),
  landerOpen: false,
  roverOpen: false,
  tourStep: null,
  globalStatus: null,
  setGlobalStatus: (globalStatus) => set({ globalStatus }),
  globalInfo: null,
  setGlobalInfo: (globalInfo) => set({ globalInfo }),
  setTourStep: (tourStep) => set({ tourStep }),
  validationOpen: false,
  reportOpen: false,
  skylineOpen: false,
  setSkylineOpen: (skylineOpen) => set({ skylineOpen }),
  mobilePanel: "none",
  setMobilePanel: (mobilePanel) => set({ mobilePanel }),
  setReportOpen: (reportOpen) => set({ reportOpen }),
  setValidationOpen: (validationOpen) => set({ validationOpen }),
  rover: null,
  roverDestination: null,
  setRoverOpen: (roverOpen) => set((s) => ({ roverOpen, landerOpen: roverOpen ? false : s.landerOpen, finderOpen: roverOpen ? false : s.finderOpen })),
  setRover: (rover, destination = null) => set({
    rover,
    roverDestination: isRoute(rover) && destination
      ? { id: destination.id, name: destination.name, lat: destination.lat, lon: destination.lon }
      : null,
  }),
  lander: LANDER_PRESETS[0],
  survival: null,
  survivalFor: null,
  mc: null,
  flyRequest: null,
  setLanderOpen: (landerOpen) => set((s) => ({ landerOpen, finderOpen: landerOpen ? false : s.finderOpen, roverOpen: landerOpen ? false : s.roverOpen })),
  setLander: (lander) => set({ lander }),
  setSurvival: (survival, inputs = null) => set((s) => ({ survival, survivalFor: survival ? inputs : null, layer: survival ? "survive" : s.layer === "survive" ? "terrain" : s.layer })),
  setMc: (mc) => set({ mc }),
  flyTo: (lat, lon, altKm) => set((s) => ({ flyRequest: { lat, lon, altKm, n: (s.flyRequest?.n ?? 0) + 1 }, view: "3d" })),
  globe: null,
  setGlobe: (globe) => set({ globe }),
  orbitRequest: 0,
  requestOrbit: () => set((s) => ({ orbitRequest: s.orbitRequest + 1, view: "3d", split: false, compareOpen: false })),
  pinned: [],
  compareOpen: false,
  togglePin: (site) =>
    set((s) => {
      const has = s.pinned.some((p) => p.id === site.id);
      const pinned = has ? s.pinned.filter((p) => p.id !== site.id) : [...s.pinned, site].slice(-6);
      const compareOpen = pinned.length >= 2 ? true : pinned.length === 0 ? false : s.compareOpen;
      return { pinned, compareOpen, split: s.split && pinned.length >= 2, porkchopOpen: compareOpen ? false : s.porkchopOpen };
    }),
  setCompareOpen: (compareOpen) => set((s) => ({ compareOpen, split: compareOpen && s.split, porkchopOpen: compareOpen ? false : s.porkchopOpen })),
  split: false,
  setSplit: (on) => set((s) => ({ split: on && s.pinned.length >= 2 })),
  finder: null,
  setFinderOpen: (finderOpen) => set((s) => ({ finderOpen, landerOpen: finderOpen ? false : s.landerOpen, roverOpen: finderOpen ? false : s.roverOpen })),
  setFinder: (finder) => set((s) => ({ finder, layer: finder ? "score" : s.layer === "score" ? "terrain" : s.layer, selectedId: finder?.candidates[0]?.site.id ?? resolveSelection(s.selectedId, s.data, s.customSites, finder) })),
  toggleCinema: () => set((s) => ({ cinema: !s.cinema })),
  setView: (view) => set((s) => ({ view, layer: view === "3d" && s.layer === "now" ? "terrain" : s.layer })),
  customSites: [],
  pointSeq: 0,
  setField: (field) => set({ field, poleField: field }),
  setFieldProgress: (fieldProgress) => set({ fieldProgress }),
  setFieldError: (fieldError) => set({ fieldError }),
  setLayer: (layer) => set({ layer }),
  setRangeDays: (rangeDays) => set({ rangeDays }),
  setCustomSite: (site) =>
    set((s) => {
      const i = s.customSites.findIndex((c) => c.id === site.id);
      if (i >= 0) {
        const next = [...s.customSites];
        next[i] = { ...site, name: s.customSites[i].name };
        // A pinned copy of this point follows the replacement (same id, kept name).
        return { customSites: next, pinned: s.pinned.map((p) => (p.id === site.id ? next[i] : p)), selectedId: site.id };
      }
      const seq = s.pointSeq + 1;
      const named = site.name === "Custom point" ? { ...site, name: `Point ${seq}` } : site;
      return { customSites: [...s.customSites, named].slice(-20), pointSeq: seq, selectedId: site.id };
    }),
  removeCustomSite: (id) =>
    set((s) => {
      const customSites = s.customSites.filter((c) => c.id !== id);
      const pinned = s.pinned.filter((p) => p.id !== id);
      return {
        customSites,
        pinned,
        compareOpen: s.compareOpen && pinned.length > 0,
        split: s.split && pinned.length >= 2,
        selectedId: s.selectedId === id ? resolveSelection(id, s.data, customSites, s.finder) : s.selectedId,
      };
    }),
  renameCustomSite: (id, name) =>
    set((s) => ({
      customSites: s.customSites.map((c) => (c.id === id ? { ...c, name } : c)),
      pinned: s.pinned.map((p) => (p.id === id ? { ...p, name } : p)),
    })),
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

/** Keep `id` if it names a built-in site, a custom point or a finder candidate; otherwise the first built-in site. */
function resolveSelection(id: string, data: AppData | null, customSites: Site[], finder: FinderResult | null) {
  if (data?.sites.some((x) => x.id === id) || customSites.some((x) => x.id === id) || finder?.candidates.some((c) => c.site.id === id)) return id;
  return data?.sites[0]?.id ?? id;
}

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
