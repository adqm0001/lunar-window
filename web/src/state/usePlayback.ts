import { useEffect } from "react";
import { SPEEDS, useApp } from "./store";

export function usePlayback() {
  const playing = useApp((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = useApp.getState();
      const next = s.hour + SPEEDS[s.speedIndex].hoursPerSecond * dt;
      const max = (s.data?.ephem.count ?? 1) - 1;
      if (next >= max) {
        s.setHour(max);
        s.togglePlaying();
        return;
      }
      s.setHour(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}
