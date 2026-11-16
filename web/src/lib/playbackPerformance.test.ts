import { describe, expect, it } from "vitest";
import { recordRenderedFrame, setRenderFrameListener, SlowPlaybackMonitor } from "./playbackPerformance";

function run(monitor: SlowPlaybackMonitor, gaps: number[], start = 0) {
  let now = start;
  const results: boolean[] = [];
  monitor.sample(now);
  for (const gap of gaps) {
    now += gap;
    const result = monitor.sample(now);
    if (result !== null) results.push(result);
  }
  return { now, results };
}

describe("slow High-quality playback detection", () => {
  it.each([15, 20, 30, 60, 120])("keeps smooth %i FPS playback quiet", fps => {
    const { results } = run(new SlowPlaybackMonitor(), Array(fps * 24).fill(1000 / fps));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(value => value === false)).toBe(true);
  });

  it("ignores short startup stalls and waits for a full observation window", () => {
    const monitor = new SlowPlaybackMonitor();
    const { results } = run(monitor, [1000, 1000, 1000, 1000, 1000, 1000, ...Array(79).fill(100)]);
    expect(results).toEqual([]);
    expect(monitor.sample(14000)).toBe(true);
  });

  it.each([7, 11, 14])("identifies sustained %i FPS after startup", fps => {
    const { results } = run(new SlowPlaybackMonitor(), Array(fps * 24).fill(1000 / fps));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(value => value === true)).toBe(true);
  });

  it("identifies repeated long gaps even when the mean FPS is above 20", () => {
    const gaps = [...Array(360).fill(1000 / 60), 350, ...Array(120).fill(1000 / 60),
      450, ...Array(120).fill(1000 / 60), 550, ...Array(180).fill(1000 / 60)];
    expect(run(new SlowPlaybackMonitor(), gaps).results).toContain(true);
  });

  it("does not warn for one isolated long frame", () => {
    const gaps = [...Array(480).fill(1000 / 60), 1500, ...Array(600).fill(1000 / 60)];
    expect(run(new SlowPlaybackMonitor(), gaps).results.every(value => !value)).toBe(true);
  });

  it("clears the slow result after a healthy window", () => {
    const monitor = new SlowPlaybackMonitor();
    const slow = run(monitor, Array(160).fill(100));
    expect(slow.results).toContain(true);
    const recovered = run(monitor, Array(600).fill(1000 / 60), slow.now);
    expect(recovered.results.at(-1)).toBe(false);
  });

  it("does not count a hidden-tab or paused interval after reset", () => {
    const monitor = new SlowPlaybackMonitor();
    run(monitor, Array(160).fill(100));
    monitor.reset();
    const { results } = run(monitor, Array(120).fill(1000 / 60), 300000);
    expect(results).toEqual([]);
  });

  it("stops receiving rendered frames when detached", () => {
    const frames: number[] = [];
    const detach = setRenderFrameListener(now => frames.push(now));
    recordRenderedFrame(10);
    detach();
    recordRenderedFrame(20);
    expect(frames).toEqual([10]);
  });

  it("keeps a replacement listener when old StrictMode cleanup runs", () => {
    const frames: number[] = [];
    const old = setRenderFrameListener(() => { throw new Error("stale listener"); });
    const current = setRenderFrameListener(now => frames.push(now));
    old();
    recordRenderedFrame(30);
    current();
    expect(frames).toEqual([30]);
  });
});
