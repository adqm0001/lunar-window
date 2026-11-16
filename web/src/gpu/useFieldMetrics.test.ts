import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldData } from "../data/field";
import type { AppData } from "../data/load";
import type { FieldMetrics } from "./engine";

vi.hoisted(() => vi.stubGlobal("window", {}));
afterAll(() => vi.unstubAllGlobals());

const requests = vi.hoisted(() => [] as {
  start: number;
  wanted: () => boolean;
  resolve: (value: FieldMetrics | null) => void;
}[]);

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useMemo: (read: () => unknown) => read(),
  useSyncExternalStore: (_subscribe: unknown, read: () => number) => read(),
}));
vi.mock("../state/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/store")>();
  return {
    ...actual,
    useApp: Object.assign(
      (selector: (state: ReturnType<typeof actual.useApp.getState>) => unknown) => selector(actual.useApp.getState()),
      actual.useApp,
    ),
  };
});
vi.mock("./engine", () => ({
  GpuEngine: class {
    dispose() {}
    computeThermal(start: number, _hours: number, wanted: () => boolean) {
      return new Promise<FieldMetrics | null>((resolve) => requests.push({ start, wanted, resolve }));
    }
  },
}));

import { useApp } from "../state/store";
import { getEngine, useFieldMetrics } from "./useFieldMetrics";

const field: FieldData = {
  meta: {
    extentMeters: 500,
    horizon: { size: 1, cellMeters: 250, azimuthBins: 1, observerHeightM: 2, decode: { offsetDeg: 0, stepDeg: 1 } },
    heights: { size: 1, cellMeters: 250, min: 0, max: 0 },
    slope: { size: 1, cellMeters: 250 },
  },
  horizon: new Uint8Array(1), heights: new Int16Array(1), slope: new Uint8Array(1),
};
const data: AppData = {
  ephem: { startMs: 0, stepHours: 1, count: 20000, data: new Float32Array(), dsn: new Int8Array(), stations: [] },
  sites: [], replay: null,
};
const metrics = (start: number): FieldMetrics => ({
  size: 1, hours: 720, stride: 1, millis: 0, data: new Float32Array([start, 0, 0, 0]),
});

beforeEach(() => {
  useApp.setState(useApp.getInitialState(), true);
  useApp.setState({ field: { ...field }, data, layer: "temp", hour: 9600, rangeDays: 30 });
  getEngine();
  requests.length = 0;
});

describe("thermal request ordering", () => {
  it("finishes the requested window when the user leaves it and quickly returns", async () => {
    useFieldMetrics();
    useApp.getState().setHour(9624);
    useFieldMetrics();
    expect(requests[0].wanted()).toBe(false);
    useApp.getState().setHour(9600);
    useFieldMetrics();
    expect(requests[0].wanted()).toBe(true);
    expect(requests[1].wanted()).toBe(false);
    requests[0].resolve(requests[0].wanted() ? metrics(9600) : null);
    requests[1].resolve(requests[1].wanted() ? metrics(9624) : null);
    await Promise.resolve();
    expect(useFieldMetrics().metrics?.data[0]).toBe(9600);
    expect(requests).toHaveLength(2);
  });

  it("discards a late result from a field that has been replaced", async () => {
    useFieldMetrics();
    const old = requests[0];
    useApp.getState().setActiveField({ ...field });
    useFieldMetrics();
    const current = requests[1];
    old.resolve(metrics(1));
    await Promise.resolve();
    expect(useFieldMetrics().metrics).toBeNull();
    current.resolve(metrics(9600));
    await Promise.resolve();
    expect(useFieldMetrics().metrics?.data[0]).toBe(9600);
    expect(requests).toHaveLength(2);
  });
});
