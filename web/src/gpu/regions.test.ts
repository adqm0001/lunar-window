import { afterEach, describe, expect, it, vi } from "vitest";
import type { FieldData } from "../data/field";
import type { Site } from "../data/load";

type Build = { label: string; resolve: (f: FieldData) => void; reject: (e: Error) => void; progress: (p: number) => void };

const { builds, pole } = vi.hoisted(() => ({
  builds: [] as Build[],
  pole: { meta: { label: "POLE" } } as unknown,
}));

// The GPU build cannot run under vitest: each call is held open until the test resolves it.
vi.mock("./regionField", () => ({
  buildRegionField: (_g: unknown, opts: { label: string }, progress: (p: number) => void) =>
    new Promise((resolve, reject) => builds.push({ label: opts.label, resolve, reject, progress })),
}));
// The pole field covers |x|, |y| < 100 km of map coordinates and a region field covers everything. Picking a point
// in a region field returns a site tagged with that field's label, so tests can see which field refined it.
vi.mock("../data/field", () => ({
  inField: (f: unknown, x: number, y: number) => f !== pole || (Math.abs(x) < 100000 && Math.abs(y) < 100000),
  customSiteAt: (f: { meta: { label: string } }) =>
    f === pole
      ? null
      : { id: "picked", name: "Custom point", lat: -81, lon: 10, group: "Custom", terrain: true, height_m: 0, horizon: [], refinedBy: f.meta.label },
}));

const field = (label: string) => ({ meta: { label } }) as unknown as FieldData;

async function fresh() {
  vi.resetModules();
  builds.length = 0;
  vi.stubGlobal("window", {});
  vi.stubGlobal("location", { hash: "", search: "" });
  const { useApp } = await import("../state/store");
  const { analyzeArea } = await import("./regions");
  useApp.setState({ globe: {} as never, field: pole as FieldData, poleField: pole as FieldData });
  const label = () => (useApp.getState().field as unknown as { meta: { label: string } } | null)?.meta.label;
  return { useApp, analyzeArea, label };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const point: Site = { id: "custom:point", name: "My point", lat: -81, lon: 10, group: "Custom", terrain: true, height_m: 0, horizon: [] };
const refinedBy = (useApp: Awaited<ReturnType<typeof fresh>>["useApp"]) =>
  (useApp.getState().customSites.find((c) => c.id === point.id) as (Site & { refinedBy?: string }) | undefined)?.refinedBy;

afterEach(() => vi.unstubAllGlobals());

describe("analyzeArea request ordering", () => {
  it("applies a finished build when it is still the latest request", async () => {
    const { useApp, analyzeArea, label } = await fresh();
    const pA = analyzeArea("Region A", -80, 0);
    expect(builds.map((b) => b.label)).toEqual(["Region A"]);
    expect(useApp.getState().regionStatus).toEqual({ label: "Region A", progress: 0 });
    builds[0].resolve(field("A"));
    await pA;
    expect(label()).toBe("A");
    expect(useApp.getState().regionStatus).toBeNull();
  });

  it("switches to the pole field at once during a build, and the build does not override it", async () => {
    const { useApp, analyzeArea, label } = await fresh();
    const pA = analyzeArea("Region A", -80, 0);
    useApp.setState({ field: field("OTHER") });
    await analyzeArea("Artemis B", -89.5, 0);
    expect(label()).toBe("POLE");
    expect(useApp.getState().regionStatus).toBeNull();

    builds[0].progress(0.5);
    expect(useApp.getState().regionStatus).toBeNull();
    builds[0].resolve(field("A"));
    await pA;
    expect(label()).toBe("POLE");
    expect(useApp.getState().regionStatus).toBeNull();

    // A's result was still cached: asking for A again switches without a new build.
    await analyzeArea("Region A", -80, 0);
    expect(label()).toBe("A");
    expect(builds).toHaveLength(1);
  });

  it("applies a cached region at once during a build, and the build does not override it", async () => {
    const { useApp, analyzeArea, label } = await fresh();
    const pA = analyzeArea("Region A", -80, 0);
    builds[0].resolve(field("A"));
    await pA;

    const pC = analyzeArea("Region C", -82, 90);
    expect(builds.map((b) => b.label)).toEqual(["Region A", "Region C"]);
    await analyzeArea("Region A", -80, 0);
    expect(label()).toBe("A");
    expect(useApp.getState().regionStatus).toBeNull();

    builds[1].resolve(field("C"));
    await pC;
    expect(label()).toBe("A");
    expect(useApp.getState().regionStatus).toBeNull();
  });

  it("remembers only the latest request that needs a build and runs it when the current build ends", async () => {
    const { useApp, analyzeArea, label } = await fresh();
    const pA = analyzeArea("Region A", -80, 0);
    const pC = analyzeArea("Region C", -82, 90);
    const pD = analyzeArea("Region D", -78, 180);
    expect(builds.map((b) => b.label)).toEqual(["Region A"]);
    expect(useApp.getState().regionStatus).toEqual({ label: "Region D", progress: 0 });

    builds[0].progress(0.7);
    expect(useApp.getState().regionStatus).toEqual({ label: "Region D", progress: 0 });
    builds[0].resolve(field("A"));
    await flush();
    expect(label()).toBe("POLE");
    expect(builds.map((b) => b.label)).toEqual(["Region A", "Region D"]);

    builds[1].progress(0.4);
    expect(useApp.getState().regionStatus).toEqual({ label: "Region D", progress: 0.4 });
    builds[1].resolve(field("D"));
    await Promise.all([pA, pC, pD]);
    expect(label()).toBe("D");
    expect(useApp.getState().regionStatus).toBeNull();
    expect(builds).toHaveLength(2);
  });

  it("drops a remembered build when a pole-field request comes after it", async () => {
    const { useApp, analyzeArea, label } = await fresh();
    const pA = analyzeArea("Region A", -80, 0);
    const pC = analyzeArea("Region C", -82, 90);
    await analyzeArea("Artemis B", -89.5, 0);
    builds[0].resolve(field("A"));
    await Promise.all([pA, pC]);
    expect(builds.map((b) => b.label)).toEqual(["Region A"]);
    expect(label()).toBe("POLE");
    expect(useApp.getState().regionStatus).toBeNull();
  });

  it("keeps the out-of-range message when an earlier build finishes", async () => {
    const { useApp, analyzeArea, label } = await fresh();
    const pA = analyzeArea("Region A", -80, 0);
    await analyzeArea("Mare X", -20, 0);
    const msg = useApp.getState().regionStatus;
    expect(msg?.error).toMatch(/below 75°S/);
    builds[0].resolve(field("A"));
    await pA;
    expect(label()).toBe("POLE");
    expect(useApp.getState().regionStatus).toEqual(msg);
  });

  it("shows a build error only while that build is the latest request", async () => {
    const { useApp, analyzeArea } = await fresh();
    const pA = analyzeArea("Region A", -80, 0);
    await analyzeArea("Artemis B", -89.5, 0);
    builds[0].reject(new Error("GPU lost"));
    await pA;
    expect(useApp.getState().regionStatus).toBeNull();

    const pC = analyzeArea("Region C", -82, 90);
    builds[1].reject(new Error("GPU lost"));
    await pC;
    expect(useApp.getState().regionStatus).toEqual({ label: "Region C", progress: 1, error: "GPU lost" });
  });

  it("treats a second request for the region already building as the same build", async () => {
    const { useApp, analyzeArea, label } = await fresh();
    useApp.setState({ customSites: [point], selectedId: point.id });
    const p1 = analyzeArea("Region A", -80, 0);
    const p2 = analyzeArea("Region A", -80, 0);
    expect(builds).toHaveLength(1);
    builds[0].progress(0.6);
    expect(useApp.getState().regionStatus).toEqual({ label: "Region A", progress: 0.6 });
    builds[0].resolve(field("A"));
    await Promise.all([p1, p2]);
    expect(builds).toHaveLength(1);
    expect(label()).toBe("A");
    expect(useApp.getState().regionStatus).toBeNull();
    expect(refinedBy(useApp)).toBe("A");
  });

  it("refines the selected custom point when a cached region is applied", async () => {
    const { useApp, analyzeArea, label } = await fresh();
    const pA = analyzeArea("Region A", -80, 0);
    builds[0].resolve(field("A"));
    await pA;
    await analyzeArea("Artemis B", -89.5, 0);
    expect(label()).toBe("POLE");

    useApp.setState({ customSites: [point], selectedId: point.id });
    await analyzeArea("Region A", -80, 0);
    expect(builds).toHaveLength(1);
    expect(label()).toBe("A");
    expect(refinedBy(useApp)).toBe("A");
  });
});
