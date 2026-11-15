import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppData, Site } from "../data/load";
import type { Candidate, FinderResult } from "../gpu/finder";

const { addPointAt } = vi.hoisted(() => ({
  addPointAt: vi.fn<(lat: number, lon: number, name?: string) => Site | null>(),
}));

// Only the terrain/GPU lookup is replaced. Encoding, parsing, restore order and store selection run normally.
vi.mock("../lib/points", () => ({ addPointAt }));

function site(id: string, name = id, lat = -89.44, lon = -137.37): Site {
  return { id, name, lat, lon, group: "Custom", terrain: true, height_m: 0, horizon: [] };
}

const builtin = site("connecting-ridge-b", "Connecting ridge B");
const data: AppData = {
  sites: [builtin],
  replay: null,
  ephem: { startMs: Date.UTC(2026, 0, 1), stepHours: 1, count: 10000, data: new Float32Array(), dsn: new Int8Array(), stations: [] },
};

function finder(): FinderResult {
  const candidates: Candidate[] = [1, 2].map((rank) => ({
    rank, score: 0.9, sun: 1, earth: 0.5, link: 0.5, nightHours: 0, safePct: 100, x: 0, y: 0,
    site: site(`best:${rank}`, `Best spot #${rank}`, -88.6 - rank / 1000, -67.72 - rank / 1000),
  }));
  return {
    params: { startHour: 7635, missionDays: 14, maxNightHours: 50, minSafePct: 50, weights: { sun: 1, earth: 1, link: 1, flat: 1 } },
    candidates, scores: new Float32Array(), evaluated: 102400, rejected: 0, millis: 1,
  };
}

async function freshPage(hash = "") {
  vi.resetModules();
  vi.stubGlobal("window", {});
  vi.stubGlobal("location", { hash });
  const { useApp } = await import("./store");
  const share = await import("./share");
  useApp.setState({ data });
  addPointAt.mockImplementation((lat, lon, name) => {
    const point = site(`custom:${lat},${lon}`, name, lat, lon);
    useApp.getState().setCustomSite(point);
    return point;
  });
  return { useApp, share };
}

async function restore(hash: string) {
  const page = await freshPage(hash);
  page.share.applyEarly();
  page.share.applyLate();
  return page;
}

afterEach(() => {
  vi.unstubAllGlobals();
  addPointAt.mockReset();
});

describe("shared landing finder results", () => {
  it.each([1, 2])("restores selected result #%s as a named point in a fresh page", async (rank) => {
    const { useApp, share } = await freshPage();
    const result = finder();
    useApp.getState().setFinder(result);
    useApp.setState({ selectedId: `best:${rank}`, hour: 7635, rangeDays: 90, view: "3d" });
    const hash = share.encodeState();
    // Sharing must not promote the point or otherwise alter the source page's selection/results.
    expect(useApp.getState().customSites).toEqual([]);
    expect(useApp.getState().finder).toBe(result);
    expect(useApp.getState().selectedId).toBe(`best:${rank}`);

    const restored = await restore(hash);
    const state = restored.useApp.getState();
    const selected = state.customSites.find((point) => point.id === state.selectedId);
    expect(selected?.name).toBe(`Best spot #${rank}`);
    expect(selected!.lat).toBeCloseTo(result.candidates[rank - 1].site.lat, 4);
    expect(selected!.lon).toBeCloseTo(result.candidates[rank - 1].site.lon, 4);
    expect(state).toMatchObject({ hour: 7635, rangeDays: 90, view: "3d", finder: null, layer: "terrain" });

    // A recipient can share the restored point again, without a finder result or duplicate points.
    const again = await restore(restored.share.encodeState());
    expect(again.useApp.getState().customSites).toHaveLength(1);
    expect(again.useApp.getState().customSites[0]).toMatchObject({ name: `Best spot #${rank}`, lat: selected!.lat, lon: selected!.lon });
  });

  it("keeps existing custom points and a supported layer when sharing a finder result", async () => {
    const { useApp, share } = await freshPage();
    const custom = site("custom:existing", "Audit point 100%, A;B", -89.1, 20.5);
    useApp.getState().setCustomSite(custom);
    useApp.getState().setFinder(finder());
    useApp.setState({ layer: "sun", view: "2d" });
    const restored = await restore(share.encodeState());
    const state = restored.useApp.getState();
    expect(state.customSites).toHaveLength(2);
    expect(state.customSites.some((point) => point.name === custom.name && point.lat === custom.lat && point.lon === custom.lon)).toBe(true);
    expect(state.customSites.find((point) => point.id === state.selectedId)?.name).toBe("Best spot #1");
    expect(state).toMatchObject({ view: "2d", layer: "sun" });
  });

  it("keeps the selected finder result when the custom point list is already full", async () => {
    const { useApp, share } = await freshPage();
    const points = Array.from({ length: 20 }, (_, i) => site(`custom:${i}`, `Point ${i}`, -89, i));
    useApp.setState({ customSites: points });
    useApp.getState().setFinder(finder());
    const hash = share.encodeState();
    expect(useApp.getState().customSites).toBe(points);
    const restored = await restore(hash);
    const state = restored.useApp.getState();
    expect(state.customSites).toHaveLength(20);
    expect(state.customSites.find((point) => point.id === state.selectedId)?.name).toBe("Best spot #1");
    expect(state.customSites.some((point) => point.name === "Point 19")).toBe(true);
    expect(state.customSites.some((point) => point.name === "Point 0")).toBe(false);
  });

  it("keeps built-in site sharing unchanged even when finder results exist", async () => {
    const { useApp, share } = await freshPage();
    useApp.getState().setFinder(finder());
    useApp.getState().select(builtin.id);
    const hash = share.encodeState();
    expect(new URLSearchParams(hash.slice(1)).get("p")).toBeNull();
    const restored = await restore(hash);
    expect(restored.useApp.getState().selectedId).toBe(builtin.id);
    expect(restored.useApp.getState().customSites).toEqual([]);
  });

  it("keeps an existing custom point selected and its name intact when finder results exist", async () => {
    const { useApp, share } = await freshPage();
    const custom = site("custom:existing", "Audit point 100%, A;B", -89.1, 20.5);
    useApp.getState().setCustomSite(custom);
    useApp.getState().setFinder(finder());
    useApp.getState().select(custom.id);
    const restored = await restore(share.encodeState());
    const state = restored.useApp.getState();
    expect(state.customSites).toHaveLength(1);
    expect(state.customSites.find((point) => point.id === state.selectedId)).toMatchObject({ name: custom.name, lat: custom.lat, lon: custom.lon });
  });
});
