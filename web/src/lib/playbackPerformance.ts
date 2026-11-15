// Ignore startup, then check sustained low frame cadence or repeated stalls.
// MoonScene reports actual rendered frames, not GPU time or a hardware model.
let renderFrameListener: ((now: number) => void) | null = null;

export function recordRenderedFrame(now: number) {
  renderFrameListener?.(now);
}

// The app has one playback notice; stale StrictMode cleanup must not remove
// a newer listener.
export function setRenderFrameListener(listener: (now: number) => void) {
  renderFrameListener = listener;
  return () => {
    if (renderFrameListener === listener) renderFrameListener = null;
  };
}

export class SlowPlaybackMonitor {
  private started: number | null = null;
  private previous = 0;
  private windowStart: number | null = null;
  private frames = 0;
  private stalls = 0;

  reset() {
    this.started = null;
    this.windowStart = null;
    this.frames = 0;
    this.stalls = 0;
  }

  sample(now: number): boolean | null {
    if (this.started === null) {
      this.started = this.previous = now;
      return null;
    }
    const gap = now - this.previous;
    this.previous = now;
    if (now - this.started < 6000) return null;
    if (this.windowStart === null) {
      this.windowStart = now;
      return null;
    }
    this.frames++;
    if (gap >= 250) this.stalls++;
    const elapsed = now - this.windowStart;
    if (elapsed < 8000) return null;
    // Avoid classifying an exact 15 FPS trace as slow due to float rounding.
    const slow = this.frames * 1000 / elapsed < 15 - 1e-6 || this.stalls >= 3;
    this.windowStart = now;
    this.frames = this.stalls = 0;
    return slow;
  }
}
