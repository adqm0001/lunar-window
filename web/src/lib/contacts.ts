import type { Ephemeris } from "../data/load";
import type { SiteSeries } from "./visibility";
import { DSN_MIN_ELEVATION_DEG } from "./astro";

// Contact windows: hours when Earth is above this site's real horizon AND a given Deep Space
// Network station sees the Moon at least 10° above its own horizon.

export interface ContactWindow {
  station: string;
  start: number;
  end: number;
}

export function contactWindows(e: Ephemeris, series: SiteSeries, from: number, hours: number): { windows: ContactWindow[]; totalHours: number } {
  const ns = e.stations.length;
  const to = Math.min(e.count, from + hours);
  const windows: ContactWindow[] = [];
  const open: (number | null)[] = new Array(ns).fill(null);
  let total = 0;
  for (let i = from; i <= to; i++) {
    const earthUp = i < to && series.earth[i] === 1;
    let any = false;
    for (let k = 0; k < ns; k++) {
      const up = earthUp && e.dsn[i * ns + k] >= DSN_MIN_ELEVATION_DEG;
      if (up) any = true;
      if (up && open[k] === null) open[k] = i;
      if (!up && open[k] !== null) {
        windows.push({ station: e.stations[k].name, start: open[k]!, end: i });
        open[k] = null;
      }
    }
    if (any && i < to) total++;
  }
  windows.sort((a, b) => a.start - b.start);
  return { windows, totalHours: total };
}
