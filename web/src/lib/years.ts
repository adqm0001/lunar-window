import type { Ephemeris } from "../data/load";

/** First and last UTC calendar year with ephemeris data, and a label such as "2026–2036". */
export function ephemYears(ephem: Pick<Ephemeris, "startMs" | "stepHours" | "count">) {
  const first = new Date(ephem.startMs).getUTCFullYear();
  const last = new Date(ephem.startMs + (ephem.count - 1) * ephem.stepHours * 3600e3).getUTCFullYear();
  return { first, last, label: first === last ? String(first) : `${first}–${last}` };
}
