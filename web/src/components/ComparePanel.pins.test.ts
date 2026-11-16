import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppData, Site } from "../data/load";
import type { FinderResult } from "../gpu/finder";

vi.mock("../state/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/store")>();
  return { ...actual, useApp: Object.assign((selector: (s: ReturnType<typeof actual.useApp.getState>) => unknown) => selector(actual.useApp.getState()), actual.useApp) };
});
vi.mock("../state/seriesCache", () => ({ getSeries: () => null, getThermal: () => null, useSeriesVersion: () => 0 }));
// Expose the real Add site choices without the menu's unrelated browser focus/positioning effects.
vi.mock("./ControlMenu", () => ({ default: ({ children }: { children: (close: () => void) => ReactNode }) => createElement("nav", { "aria-label": "Add site" }, children(() => {})) }));

let useApp: typeof import("../state/store").useApp;
let ComparePanel: typeof import("./ComparePanel").default;
let SitePanel: typeof import("./SitePanel").default;
beforeAll(async () => {
  vi.stubGlobal("window", {});
  ({ useApp } = await import("../state/store"));
  ({ default: ComparePanel } = await import("./ComparePanel"));
  ({ default: SitePanel } = await import("./SitePanel"));
});
afterAll(() => vi.unstubAllGlobals());
const site = (id: string, lat: number, lon: number): Site => ({ id, name: "Best spot #1", lat, lon, height_m: 0, horizon: [0], group: "Best landing spots", terrain: true });
const a = site("best:1", -89.687, -162.753);
const b = site("best:1", -89.44, -137.37);
const base = { ...a, id: "base", name: "Base" };
const data: AppData = {
  sites: [base], replay: null,
  ephem: { startMs: Date.UTC(2026, 0, 1), stepHours: 1, count: 1, data: new Float32Array([149600000, 0, 0, 384400, 0, 0]), dsn: new Int8Array([30]), stations: [{ name: "Test dish", lat: 0, lon: 0 }] },
};
function result(s: Site): FinderResult {
  return {
    params: { startHour: 0, missionDays: 14, maxNightHours: 50, minSafePct: 50, weights: { sun: 1, earth: 1, link: 1, flat: 1 } },
    candidates: [{ rank: 1, score: 1, sun: 1, earth: 1, link: 1, nightHours: 0, safePct: 100, x: 0, y: 0, site: s }],
    scores: new Float32Array(), evaluated: 1, rejected: 0, millis: 0,
  };
}
const inspector = () => renderToStaticMarkup(createElement(SitePanel));
const compare = () => renderToStaticMarkup(createElement(ComparePanel));
beforeEach(() => {
  useApp.setState(useApp.getInitialState(), true);
  useApp.setState({ data, hour: 0 });
  useApp.getState().setFinder(result(a));
  useApp.getState().togglePin(a);
  useApp.getState().setFinder(result(b));
});

describe("finder snapshot comparison controls", () => {
  it("offers to pin the new result instead of marking a different older location Added", () => {
    expect(inspector()).toContain("Add this site to comparison");
    expect(inspector()).not.toContain("Remove from comparison");
    expect(compare().match(/<nav aria-label="Add site">([\s\S]*?)<\/nav>/)?.[1]).toContain("Best spot #1");
    useApp.getState().togglePin(b);
    expect(inspector()).toContain("Remove from comparison");
    const html = compare();
    expect(html).toContain("89.687°S 162.753°W");
    expect(html).toContain("89.440°S 137.370°W");
    expect(html.match(/aria-label="Unpin Best spot #1"/g)).toHaveLength(2);
    expect(html.match(/<th class="active">([\s\S]*?)<\/th>/)?.[1]).toContain("89.440°S 137.370°W");
    expect(html.match(/<nav aria-label="Add site">([\s\S]*?)<\/nav>/)?.[1]).not.toContain("Best spot #1");
  });

  it("resolves an older Compare destination through the real site selector after finder reset", () => {
    const oldPin = useApp.getState().pinned[0];
    useApp.getState().select(oldPin.id);
    useApp.getState().setFinder(null);
    const html = inspector();
    expect(html).toContain('<h2 class="panel-title">Best spot #1</h2>');
    expect(html).toContain("89.687°S 162.753°W");
    expect(html).toContain("Remove from comparison");
    expect(html).not.toContain("89.440°S 137.370°W");
  });
});
