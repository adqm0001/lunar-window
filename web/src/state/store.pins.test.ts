import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppData, Site } from "../data/load";
import type { FinderResult } from "../gpu/finder";

const site = (id: string, lat: number, lon = 0): Site => ({ id, name: id, lat, lon, height_m: 0, horizon: [0], group: "Test", terrain: true });
const base = site("base", -89);
const first = { ...site("best:1", -89.687, -162.753), name: "Best spot #1" };
const second = { ...site("best:1", -89.44, -137.37), name: "Best spot #1" };
function finder(s: Site): FinderResult {
  return {
    params: { startHour: 0, missionDays: 14, maxNightHours: 50, minSafePct: 50, weights: { sun: 1, earth: 1, link: 1, flat: 1 } },
    candidates: [{ rank: 1, score: 1, sun: 1, earth: 1, link: 1, nightHours: 0, safePct: 100, x: 0, y: 0, site: s }],
    scores: new Float32Array(), evaluated: 1, rejected: 0, millis: 0,
  };
}
async function fresh() {
  vi.resetModules();
  vi.stubGlobal("window", {});
  const { useApp } = await import("./store");
  const data: AppData = { sites: [base], replay: null, ephem: { startMs: 0, stepHours: 1, count: 10, data: new Float32Array(60), dsn: new Int8Array(), stations: [] } };
  useApp.setState({ data });
  return useApp;
}
afterEach(() => vi.unstubAllGlobals());

describe("finder snapshot pins", () => {
  it("recognizes the same location if its rank changes in a later search", async () => {
    const app = await fresh();
    app.getState().togglePin(first);
    app.getState().togglePin({ ...first, id: "best:2", name: "Best spot #2" });
    expect(app.getState().pinned).toHaveLength(0);
  });

  it("preserves the first snapshot when a different search reuses best:1", async () => {
    const app = await fresh();
    app.getState().setFinder(finder(first));
    app.getState().togglePin(first);
    app.getState().setFinder(null);
    app.getState().setFinder(finder(second));
    app.getState().togglePin(second);
    const pins = app.getState().pinned;
    expect(pins).toHaveLength(2);
    expect(pins.map((p) => p.lat)).toEqual([first.lat, second.lat]);
    expect(new Set(pins.map((p) => p.id)).size).toBe(2);
    expect(pins[0]).toMatchObject({ name: first.name, lon: first.lon, horizon: first.horizon });
    expect(app.getState().compareOpen).toBe(true);
    expect(first.id).toBe("best:1");
  });

  it("unpins just the selected snapshot, leaving the other coordinate intact", async () => {
    const app = await fresh();
    app.getState().togglePin(first);
    app.getState().togglePin(second);
    const [oldPin] = app.getState().pinned;
    app.getState().setSplit(true);
    app.getState().togglePin(oldPin);
    expect(app.getState().pinned).toHaveLength(1);
    expect(app.getState().pinned[0].lat).toBe(second.lat);
    expect(app.getState().split).toBe(false);
  });

  it("can unpin the current result using its original rank id", async () => {
    const app = await fresh();
    app.getState().togglePin(first);
    app.getState().togglePin(second);
    app.getState().togglePin(second);
    expect(app.getState().pinned.map((p) => p.lat)).toEqual([first.lat]);
  });

  it("retains a selected snapshot after clearing finder results or changing fields", async () => {
    const app = await fresh();
    app.getState().setFinder(finder(first));
    app.getState().togglePin(first);
    const pin = app.getState().pinned[0];
    app.getState().select(pin.id);
    app.getState().setFinder(null);
    expect(app.getState().selectedId).toBe(pin.id);
    app.getState().setActiveField(null as never);
    expect(app.getState().selectedId).toBe(pin.id);
  });

  it("falls back to a valid site when the selected snapshot is unpinned", async () => {
    const app = await fresh();
    app.getState().togglePin(first);
    const pin = app.getState().pinned[0];
    app.getState().select(pin.id);
    app.getState().togglePin(pin);
    expect(app.getState().selectedId).toBe(base.id);
    expect(app.getState().compareOpen).toBe(false);
  });

  it("keeps only the newest six pins with distinct identities and resolves an evicted selection", async () => {
    const app = await fresh();
    app.getState().togglePin(first);
    app.getState().select(app.getState().pinned[0].id);
    for (let i = 1; i <= 6; i++) app.getState().togglePin(site("best:1", -89 + i / 100));
    expect(app.getState().pinned).toHaveLength(6);
    expect(new Set(app.getState().pinned.map((p) => p.id)).size).toBe(6);
    expect(app.getState().selectedId).toBe(base.id);
  });

  it("keeps built-in and custom ids, including custom rename/removal behavior", async () => {
    const app = await fresh();
    const point = site("custom:a", -88);
    app.getState().togglePin(base);
    app.getState().setCustomSite(point);
    app.getState().togglePin(point);
    expect(app.getState().pinned.map((p) => p.id)).toEqual([base.id, point.id]);
    app.getState().renameCustomSite(point.id, "Renamed");
    expect(app.getState().pinned[1].name).toBe("Renamed");
    app.getState().removeCustomSite(point.id);
    expect(app.getState().pinned.map((p) => p.id)).toEqual([base.id]);
  });
});
