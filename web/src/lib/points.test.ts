import { afterEach, describe, expect, it, vi } from "vitest";
import type { Site } from "../data/load";

vi.mock("../data/field", () => ({
  inField: () => true,
  customSiteAt: (_f: unknown, x: number) => ({
    id: `custom:${x}`, name: "Custom point", lat: -89, lon: 10, group: "Custom", terrain: true, height_m: 0, horizon: [],
  }),
}));
vi.mock("../data/globe", () => ({ globeHeight: () => 0 }));
vi.mock("../gpu/globalHorizon", () => ({ GlobalHorizon: class {} }));
vi.mock("../gpu/regions", () => ({ analyzeArea: vi.fn() }));

async function setup() {
  vi.resetModules();
  vi.stubGlobal("window", {});
  vi.stubGlobal("location", { hash: "" });
  const { useApp } = await import("../state/store");
  const { addPointAt } = await import("./points");
  useApp.setState({ globe: {} as never, field: {} as never });
  return { useApp, addPointAt };
}

afterEach(() => vi.unstubAllGlobals());

describe("addPointAt naming", () => {
  it("renames an existing point by default (Artemis III report behaviour)", async () => {
    const { useApp, addPointAt } = await setup();
    addPointAt(-89, 10, "My base");
    const again = addPointAt(-89, 10, "Their name") as Site;
    expect(again.name).toBe("Their name");
    expect(useApp.getState().customSites.map((c) => c.name)).toEqual(["Their name"]);
  });

  it("keeps the existing point's name with keepOwnName", async () => {
    const { useApp, addPointAt } = await setup();
    addPointAt(-89, 10, "My base");
    const again = addPointAt(-89, 10, "Their name", true) as Site;
    expect(again.name).toBe("My base");
    expect(useApp.getState().customSites.map((c) => c.name)).toEqual(["My base"]);
  });

  it("names a new point even with keepOwnName", async () => {
    const { useApp, addPointAt } = await setup();
    addPointAt(-89, 10, "Shared", true);
    expect(useApp.getState().customSites.map((c) => c.name)).toEqual(["Shared"]);
  });
});
