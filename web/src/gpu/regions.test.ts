import { afterEach, describe, expect, it, vi } from "vitest";
import type { FieldData } from "../data/field";

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
// The pole field covers |x|, |y| < 100 km of map coordinates.
vi.mock("../data/field", () => ({
  inField: (f: unknown, x: number, y: number) => f === pole && Math.abs(x) < 100000 && Math.abs(y) < 100000,
  customSiteAt: () => null,
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
});
