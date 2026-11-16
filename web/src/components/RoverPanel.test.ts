import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldData } from "../data/field";
import type { AppData, Site } from "../data/load";
import type { RoverRoute } from "../lib/rover";

// Render the client state in Node without a DOM. Keep the real store and actions; SSR would
// otherwise read Zustand's initial (not yet loaded) snapshot instead of this test's state.
vi.mock("../state/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/store")>();
  return {
    ...actual,
    useApp: Object.assign((selector: (state: ReturnType<typeof actual.useApp.getState>) => unknown) => selector(actual.useApp.getState()), actual.useApp),
  };
});

let useApp: typeof import("../state/store").useApp;
let RoverPanel: typeof import("./RoverPanel").default;

const site = (id: string, name: string, lat: number, lon: number): Site => ({ id, name, lat, lon, group: "Test", terrain: true, height_m: 0, horizon: [] });
const from = site("connecting-ridge-b", "Connecting ridge B", -89.44, -137.37);
const targetA = site("shackleton-a", "Shackleton ridge A", -89.687, -162.753);
const targetC = site("de-gerlache-c", "de Gerlache ridge C", -88.67, -68.382);
const data: AppData = {
  sites: [from, targetA, targetC], replay: null,
  ephem: { startMs: Date.UTC(2026, 0, 1), stepHours: 1, count: 10000, data: new Float32Array(), dsn: new Int8Array(), stations: [] },
};
const field: FieldData = {
  meta: {
    extentMeters: 40000,
    horizon: { size: 2, cellMeters: 40000, azimuthBins: 1, observerHeightM: 2, decode: { offsetDeg: -8, stepDeg: 0.1 } },
    heights: { size: 2, cellMeters: 40000, min: 0, max: 0 }, slope: { size: 2, cellMeters: 40000 },
  },
  horizon: new Uint8Array(4), heights: new Int16Array(4), slope: new Uint8Array(8),
};
const route: RoverRoute = {
  startHour: 7649, arriveHour: 7700, distanceKm: 25.5, driveHours: 40, waitHours: 11, litPct: 100, linkPct: 80,
  expanded: 100, millis: 1, gpuMillis: 1,
  stops: [{ col: 0, row: 0, arrive: 7649, depart: 7649 }, { col: 1, row: 1, arrive: 7700, depart: 7700 }],
};

beforeAll(async () => {
  vi.stubGlobal("window", {});
  ({ useApp } = await import("../state/store"));
  ({ default: RoverPanel } = await import("./RoverPanel"));
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  useApp.setState(useApp.getInitialState(), true);
  useApp.setState({ data, field, hour: 7649 });
});

const destinationButton = () => renderToStaticMarkup(createElement(RoverPanel)).match(/<button\b[^>]*>Go to [\s\S]*?<\/button>/)?.[0];

describe("completed rover route destination", () => {
  it("retains the planned destination when the panel closes and reopens", () => {
    useApp.getState().setRover(route, targetC);
    useApp.getState().setRoverOpen(false);
    useApp.getState().setRoverOpen(true);
    expect(useApp.getState().roverDestination).toEqual({ id: targetC.id, name: targetC.name, lat: targetC.lat, lon: targetC.lon });
  });

  it("uses the completed route's destination when a reopened form defaults to another target", () => {
    useApp.getState().setRover(route, targetC);
    // This fresh component defaults its To field to targetA; the completed route went to targetC.
    const button = destinationButton();
    expect(button).toContain("Go to de Gerlache ridge C");
    expect(button).not.toContain("disabled");
  });

  it("uses the current name for the same destination after a rename", () => {
    useApp.getState().setRover(route, targetC);
    useApp.setState({ data: { ...data, sites: [from, targetA, { ...targetC, name: "Renamed destination" }] } });
    expect(destinationButton()).toContain("Go to Renamed destination");
  });

  it("disables the action if the destination was removed", () => {
    useApp.getState().setRover(route, targetC);
    useApp.setState({ data: { ...data, sites: [from, targetA] } });
    expect(destinationButton()).toContain("disabled");
  });

  it("does not navigate to a different point reusing the same id", () => {
    useApp.getState().setRover(route, targetC);
    useApp.setState({ data: { ...data, sites: [from, targetA, { ...targetC, lat: -89.1, lon: 20 }] } });
    expect(destinationButton()).toContain("disabled");
  });

  it.each(["clear", "failure", "field"])("clears the destination on %s", (change) => {
    useApp.getState().setRover(route, targetC);
    if (change === "clear") useApp.getState().setRover(null);
    if (change === "failure") useApp.getState().setRover({ reason: "No route", expanded: 1, millis: 1 }, targetA);
    if (change === "field") useApp.getState().setActiveField({ ...field });
    expect(useApp.getState().roverDestination).toBeNull();
  });
});
