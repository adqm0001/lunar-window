import { create } from "zustand";
import type { AppData, Site } from "../data/load";
import type { FieldData } from "../data/field";
import type { LayerId } from "../gpu/layers";
import type { FinderResult } from "../gpu/finder";

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
  finder: null,
  setFinderOpen: (finderOpen) => set({ finderOpen }),
  setFinder: (finder) => set((s) => ({ finder, layer: finder ? "score" : s.layer === "score" ? "terrain" : s.layer, selectedId: finder?.candidates[0]?.site.id ?? s.selectedId })),
  toggleCinema: () => set((s) => ({ cinema: !s.cinema })),
  setView: (view) => set((s) => ({ view, layer: view === "3d" && s.layer === "now" ? "terrain" : s.layer })),
  customSite: null,
  setField: (field) => set({ field }),
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
