import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppData, Site } from "../data/load";
import type { Candidate, FinderResult } from "../gpu/finder";

function site(id: string, name = id, height_m = 0): Site {
  return { id, name, lat: -89.44, lon: -137.37, group: "Custom", terrain: true, height_m, horizon: [] };
}
const ridge = site("connecting-ridge-b");
const shack = site("shackleton-a");
const data = (sites: Site[]): AppData => ({
  sites,
  replay: null,
  ephem: { startMs: Date.UTC(2026, 0, 1), stepHours: 1, count: 10000, data: new Float32Array(), dsn: new Int8Array(), stations: [] },
});
function finder(): FinderResult {
  const candidates: Candidate[] = [1, 2].map((rank) => ({
    rank, score: 0.9, sun: 1, earth: 0.5, link: 0.5, nightHours: 0, safePct: 100, x: 0, y: 0,
    site: site(`best:${rank}`, `Best spot #${rank}`),
  }));
  return { params: { startHour: 0, missionDays: 14, maxNightHours: 50, minSafePct: 50, weights: { sun: 1, earth: 1, link: 1, flat: 1 } }, candidates, scores: new Float32Array(), evaluated: 1, rejected: 0, millis: 1 };
}
async function fresh(sites: Site[] = [shack, ridge]) {
  vi.resetModules();
  vi.stubGlobal("window", {});
  vi.stubGlobal("location", { hash: "", search: "" });
  const { useApp } = await import("./store");
  useApp.setState({ data: data(sites) });
  return useApp;
}
afterEach(() => vi.unstubAllGlobals());

describe("stale selection", () => {
  it("setFinder(null) moves a best:N selection to the first built-in site", async () => {
    const app = await fresh();
    app.getState().setFinder(finder());
    app.getState().select("best:2");
    app.getState().setFinder(null);
    expect(app.getState().selectedId).toBe("shackleton-a");
  });
  it("setFinder(null) keeps a still-valid selection", async () => {
    const app = await fresh();
    app.getState().setFinder(finder());
    app.getState().select("connecting-ridge-b");
    app.getState().setFinder(null);
    expect(app.getState().selectedId).toBe("connecting-ridge-b");
  });
  it("a new result selects its #1", async () => {
    const app = await fresh();
    app.getState().setFinder(finder());
    app.getState().select("best:2");
    app.getState().setFinder(finder());
    expect(app.getState().selectedId).toBe("best:1");
  });
  it("setActiveField moves a best:N selection to the first built-in site", async () => {
    const app = await fresh();
    app.getState().setFinder(finder());
    app.getState().select("best:2");
    app.getState().setActiveField(null as never);
    expect(app.getState().selectedId).toBe("shackleton-a");
  });
  it("removing the selected custom point falls back to an existing built-in site", async () => {
    const app = await fresh([shack]);
    app.getState().setCustomSite(site("custom:a", "A"));
    app.getState().removeCustomSite("custom:a");
    expect(app.getState().selectedId).toBe("shackleton-a");
  });
});

describe("compare state", () => {
  it("compareOpen closes when removing pins leaves fewer than two, and at none", async () => {
    const app = await fresh();
    const a = site("custom:a", "A");
    const b = site("custom:b", "B");
    const g = app.getState();
    g.setCustomSite(a);
    g.setCustomSite(b);
    g.togglePin(a);
    g.togglePin(b);
    expect(app.getState().compareOpen).toBe(true);
    app.getState().removeCustomSite("custom:a");
    expect(app.getState().pinned.length).toBe(1);
    app.getState().removeCustomSite("custom:b");
    expect(app.getState().pinned.length).toBe(0);
    expect(app.getState().compareOpen).toBe(false);
  });
  it("pinning one site after removals does not reopen Compare", async () => {
    const app = await fresh();
    const a = site("custom:a", "A");
    const b = site("custom:b", "B");
    app.getState().setCustomSite(a);
    app.getState().setCustomSite(b);
    app.getState().togglePin(a);
    app.getState().togglePin(b);
    app.getState().removeCustomSite("custom:a");
    app.getState().removeCustomSite("custom:b");
    app.getState().togglePin(ridge);
    expect(app.getState().compareOpen).toBe(false);
  });
});

describe("pinned custom points stay in sync", () => {
  it("rename updates the pinned copy", async () => {
    const app = await fresh();
    const a = site("custom:a", "Point 1");
    app.getState().setCustomSite(a);
    app.getState().togglePin(a);
    app.getState().renameCustomSite("custom:a", "Base camp");
    expect(app.getState().pinned[0].name).toBe("Base camp");
  });
  it("replacing a custom point updates the pinned copy, keeping its name", async () => {
    const app = await fresh();
    const a = site("custom:a", "Point 1");
    app.getState().setCustomSite(a);
    app.getState().togglePin(a);
    app.getState().setCustomSite(site("custom:a", "Custom point", 99));
    const p = app.getState().pinned[0];
    expect(p.height_m).toBe(99);
    expect(p.name).toBe("Point 1");
  });
});
