import { create } from "zustand";
import type { AppData } from "../data/load";

export const SPEEDS = [
  { label: "1 h/s", hoursPerSecond: 1 },
  { label: "6 h/s", hoursPerSecond: 6 },
  { label: "1 d/s", hoursPerSecond: 24 },
  { label: "4 d/s", hoursPerSecond: 96 },
];

interface AppState {
  data: AppData | null;
  hour: number;
  playing: boolean;
  speedIndex: number;
  selectedId: string;
  setData: (d: AppData) => void;
  setHour: (h: number) => void;
  togglePlaying: () => void;
  setSpeedIndex: (i: number) => void;
  select: (id: string) => void;
}

export const useApp = create<AppState>((set, get) => ({
  data: null,
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
