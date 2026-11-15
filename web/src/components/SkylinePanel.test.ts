import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppData, Site } from "../data/load";

vi.mock("../state/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/store")>();
  return {
    ...actual,
    useApp: Object.assign((selector: (state: ReturnType<typeof actual.useApp.getState>) => unknown) => selector(actual.useApp.getState()), actual.useApp),
  };
});
// Exercise the real chart without a browser portal or focus trap.
vi.mock("./Modal", () => ({ default: ({ children }: { children: ReactNode }) => createElement("section", null, children) }));

let useApp: typeof import("../state/store").useApp;
let SkylinePanel: typeof import("./SkylinePanel").default;
beforeAll(async () => {
  vi.stubGlobal("window", {});
  ({ useApp } = await import("../state/store"));
  ({ default: SkylinePanel } = await import("./SkylinePanel"));
});
afterAll(() => vi.unstubAllGlobals());

const vectors = new Float32Array(720 * 6);
for (let h = 0; h < 720; h++) { vectors[h * 6] = 149_600_000; vectors[h * 6 + 3] = 384_400; }
const data: AppData = {
  sites: [], replay: null,
  ephem: { startMs: Date.UTC(2026, 0, 1), stepHours: 1, count: 720, data: vectors, dsn: new Int8Array(), stations: [] },
};

function profile(horizon: number[]): number[] {
  useApp.setState(useApp.getInitialState(), true);
  useApp.setState({ data, hour: 0 });
  const site: Site = { id: "test", name: "Test", lat: -89, lon: 0, height_m: 0, terrain: true, group: "Test", horizon };
  const html = renderToStaticMarkup(createElement(SkylinePanel, { site, onClose: () => {} }));
  const path = html.match(/<path d="([^"]+)" fill="#2a2724"/)?.[1] ?? "";
  const vertices = [...path.matchAll(/L([\d.-]+),([\d.-]+)/g)].slice(0, -1); // Omit the final lower-right fill corner.
  expect(vertices).toHaveLength(721);
  // Fixtures peak at 4°: the rendered vertical range is -3° to 5°, height 230.
  return vertices.map((v) => 5 - (Number(v[2]) / 230) * 8);
}

describe("skyline horizon resolution", () => {
  it("plots a 180-bin eastern peak once, at east rather than once in every quadrant", () => {
    const horizon = new Array<number>(180).fill(0);
    horizon[45] = 4; // 45 * 2° = east.
    const elevations = profile(horizon);
    expect(elevations[180]).toBeCloseTo(4, 2);
    for (const az of [22.5, 112.5, 202.5, 292.5]) expect(elevations[az * 2]).toBeCloseTo(0, 2);
    expect(elevations.filter((v) => v > 3.99)).toHaveLength(1);
  });

  it("interpolates half-degree chart vertices between two-degree source bins", () => {
    const horizon = new Array<number>(180).fill(0);
    horizon[1] = 4;
    const elevations = profile(horizon);
    for (const [index, value] of [0, 1, 2, 3, 4].entries()) expect(elevations[index]).toBeCloseTo(value, 2);
  });

  it("interpolates across the north seam and closes on the first horizon sample", () => {
    const horizon = new Array<number>(180).fill(0);
    horizon[179] = 4;
    const elevations = profile(horizon);
    expect(elevations[716]).toBeCloseTo(4, 2); // 358°
    expect(elevations[719]).toBeCloseTo(1, 2); // 359.5°
    expect(elevations[720]).toBeCloseTo(elevations[0], 2);
  });

  it("preserves every vertex of a 720-bin named-site profile", () => {
    const horizon = Array.from({ length: 720 }, (_, i) => (i % 9) / 2);
    const elevations = profile(horizon);
    elevations.forEach((value, i) => expect(value).toBeCloseTo(horizon[i % 720], 2));
  });
});
