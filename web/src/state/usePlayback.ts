import { useEffect } from "react";
import { SPEEDS, useApp } from "./store";

/** Longest frame time counted, so a hidden tab does not jump; 0.5 s keeps playback true down to 2 fps. */
export const MAX_FRAME_SECONDS = 0.5;

/** Hour to play from: pressing play on the last hour restarts from the beginning of the data. */
export function startHour(hour: number, count: number): number {
  return hour >= count - 1 ? 0 : hour;
}

/** One playback frame: the new hour, and whether it reached the end of the data. */
export function nextHour(
  hour: number,
  dtSeconds: number,
  hoursPerSecond: number,
  count: number,
): { hour: number; done: boolean } {
  const max = count - 1;
  const next = hour + hoursPerSecond * Math.min(MAX_FRAME_SECONDS, dtSeconds);
  return next >= max ? { hour: max, done: true } : { hour: next, done: false };
}

export function usePlayback() {
  const playing = useApp((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    const start = useApp.getState();
    const count = start.data?.ephem.count ?? 1;
    const from = startHour(start.hour, count);
    if (from !== start.hour) start.setHour(from);
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const s = useApp.getState();
      const r = nextHour(s.hour, dt, SPEEDS[s.speedIndex].hoursPerSecond, s.data?.ephem.count ?? 1);
      s.setHour(r.hour);
      if (r.done) {
        s.togglePlaying();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}
