import { beforeEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";

const tiles = vi.hoisted(() => new Map<number, Int16Array>());
const listeners = vi.hoisted(() => new Set<(key: number) => void>());
vi.mock("../data/globalTiles", async (importOriginal) => ({
  ...await importOriginal<typeof import("../data/globalTiles")>(),
  getGlobalTile: (key: number) => tiles.get(key) ?? null,
  requestGlobalTile: vi.fn(),
  onGlobalTile: (callback: (key: number) => void) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
}));

import { GpuTileCache } from "./tileCache";
import { LodTerrain } from "./lod";

function load(key: number) {
  tiles.set(key, new Int16Array(480 * 480));
  for (const callback of listeners) callback(key);
}

beforeEach(() => {
  tiles.clear();
  listeners.clear();
});

describe("visible height tiles", () => {
  it("keeps a visible tile when a burst of other downloads fills the GPU cache", () => {
    const cache = new GpuTileCache();
    load(0);
    cache.use([0]);
    for (let key = 1; key <= 64; key++) load(key);
    expect(cache.index.image.data[0]).toBeGreaterThanOrEqual(0);
  });

  it("reuploads a needed tile after it was evicted", () => {
    const cache = new GpuTileCache();
    for (let key = 0; key <= 64; key++) load(key);
    expect(cache.index.image.data[0]).toBe(-1);
    cache.use([0]);
    expect(cache.index.image.data[0]).toBeGreaterThanOrEqual(0);
  });

  it("checks pending visible tiles again when the camera has no new work", () => {
    const camera = new PerspectiveCamera();
    const neededTiles = new Set([7]);
    const use = vi.fn();
    const settled = {
      hasWork: false,
      lastCams: [camera.position.clone()],
      cache: { use },
      neededTiles,
    };
    expect(Reflect.apply(LodTerrain.prototype.update, settled, [camera])).toBe(false);
    expect(use).toHaveBeenCalledWith(neededTiles);
  });
});
