import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppData, Site } from "../data/load";
import { REPLAYS } from "../data/load";
import { siteSeries } from "../lib/visibility";
import { loadTestEphemeris, loadTestSites } from "../lib/testData";

// Read the loaded client snapshot when rendering in Node; keep the real store/actions.
vi.mock("../state/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/store")>();
  return {
    ...actual,
    useApp: Object.assign((selector: (state: ReturnType<typeof actual.useApp.getState>) => unknown) => selector(actual.useApp.getState()), actual.useApp),
  };
});
// Compute the real visibility series synchronously instead of starting a browser worker.
vi.mock("../state/seriesCache", () => ({ getSeries: siteSeries, getThermal: () => null, useSeriesVersion: () => 0 }));

let useApp: typeof import("../state/store").useApp;
let SitePanel: typeof import("./SitePanel").default;
beforeAll(async () => {
  vi.stubGlobal("window", {});
  ({ useApp } = await import("../state/store"));
  ({ default: SitePanel } = await import("./SitePanel"));
});
afterAll(() => vi.unstubAllGlobals());

const site: Site = { id: "test", name: "Test site", lat: 0, lon: 0, height_m: 0, horizon: [0], terrain: true, group: "Test" };
function fixture(count = 400, startMs = Date.UTC(2026, 0, 1)): AppData {
  const vectors = new Float32Array(count * 6);
  for (let h = 0; h < count; h++) {
    vectors[h * 6] = 149_600_000;
    vectors[h * 6 + 3] = 384_400; // Earth stays overhead; contact depends on DSN availability.
  }
  return {
    sites: [site], replay: null,
    ephem: { startMs, stepHours: 1, count, data: vectors, dsn: new Int8Array(count).fill(30), stations: [{ name: "Test dish", lat: 0, lon: 0 }] },
  };
}
function contacts(data: AppData, hour: number): string {
  useApp.setState(useApp.getInitialState(), true);
  useApp.setState({ data, hour, selectedId: data.sites[0].id });
  const html = renderToStaticMarkup(createElement(SitePanel));
  return html.match(/<details[^>]*><summary>Earth contact[\s\S]*?<\/details>/)?.[0] ?? "";
}

describe("site contact data coverage", () => {
  it.each([231, 232])("keeps the full-week label and totals with at least seven days left (hour %s)", (hour) => {
    const html = contacts(fixture(), hour);
    expect(html).toContain("Earth contact · next 7 days");
    expect(html).toContain("168 h of contact");
    expect(html).toContain("151 GB");
    expect(html).not.toContain("Contact data ends");
  });

  it("discloses 167 hours rather than rounding a clipped window back to seven days", () => {
    const html = contacts(fixture(), 233);
    expect(html).toContain("Earth contact · available 167 h");
    expect(html).toContain("167 h of contact");
    expect(html).toContain("2026-01-17 15:00 UTC");
    expect(html).not.toContain("weekly total");
  });

  it("discloses the single remaining main-data hour without a full-week conclusion", () => {
    const ephem = loadTestEphemeris();
    const shackleton = loadTestSites().find((s) => s.id === "shackleton-a")!;
    const html = contacts({ ephem, sites: [shackleton], replay: null }, ephem.count - 1);
    expect(html).toContain("Earth contact · available 1 h");
    expect(html).toContain("2036-12-31 23:00 UTC");
    expect(html).toContain("0 h of contact");
    expect(html).not.toMatch(/all week|relay satellite|next 7 days/);
  });

  it("uses the active replay's cutoff and retains passes and volume within the remaining hour", () => {
    const data = fixture(1080, Date.UTC(2025, 1, 15));
    data.replay = REPLAYS.im2;
    const html = contacts(data, 1079);
    expect(html).toContain("Earth contact · available 1 h");
    expect(html).toContain("2025-03-31 23:00 UTC");
    expect(html).toMatch(/1 h of contact · 1 pass\b/);
    expect(html).toContain("0.9 GB");
  });

  it("does not infer a blocked Earth horizon or a required relay from no DSN passes", () => {
    const data = fixture();
    data.ephem.dsn.fill(0);
    const html = contacts(data, 0);
    expect(html).toContain("No Earth/DSN contact in this interval.");
    expect(html).not.toMatch(/Earth stays below|relay satellite/);
  });
});
