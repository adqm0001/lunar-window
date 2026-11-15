import { useEffect, useState } from "react";
import { setRenderFrameListener, SlowPlaybackMonitor } from "../lib/playbackPerformance";
import { useApp } from "../state/store";

export default function PlaybackQualityNotice() {
  const quality = useApp(s => s.quality);
  const playing = useApp(s => s.playing);
  const setQuality = useApp(s => s.setQuality);
  const [slow, setSlow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setSlow(false);
    setDismissed(false);
    if (quality !== "high" || !playing) return;
    const monitor = new SlowPlaybackMonitor();
    const detach = setRenderFrameListener((now: number) => {
      if (document.visibilityState === "visible") {
        const result = monitor.sample(now);
        if (result !== null) setSlow(result);
      }
    });
    const visibility = () => {
      monitor.reset();
      setSlow(false);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      detach();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [quality, playing]);

  if (quality !== "high" || !playing || !slow || dismissed) return null;
  return (
    <div className="quality-notice" role="status">
      <span>Playback is running slowly. Try Balanced graphics for smoother playback.</span>
      <div className="quality-actions">
        <button className="chip" onClick={() => setQuality("balanced")}>Use Balanced</button>
        <button className="chip" onClick={() => setDismissed(true)}>Keep High</button>
      </div>
    </div>
  );
}
