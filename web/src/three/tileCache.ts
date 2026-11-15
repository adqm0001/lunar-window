import * as THREE from "three";
import { getGlobalTile, onGlobalTile, requestGlobalTile } from "../data/globalTiles";

const TILE = 480;
const COLS = 48;
const ROWS = 24;
export const CACHE_LAYERS = 48;

export class GpuTileCache {
  readonly array: THREE.DataArrayTexture;
  private data: Int16Array;
  readonly index: THREE.DataTexture;
  private layerOf = new Map<number, number>();
  private keyOf: number[] = new Array(CACHE_LAYERS).fill(-1);
  // When each layer was last needed (use() calls); the least recently needed one is replaced first.
  private lastUse: number[] = new Array(CACHE_LAYERS).fill(-1);
  private tick = 0;
  private indexData = new Int16Array(COLS * ROWS).fill(-1);

  constructor() {
    this.data = new Int16Array(TILE * TILE * CACHE_LAYERS);
    this.array = new THREE.DataArrayTexture(this.data, TILE, TILE, CACHE_LAYERS);
    this.array.format = THREE.RedIntegerFormat;
    this.array.type = THREE.ShortType;
    this.array.internalFormat = "R16I";
    this.array.minFilter = THREE.NearestFilter;
    this.array.magFilter = THREE.NearestFilter;
    this.array.unpackAlignment = 1;
    this.array.needsUpdate = true;
    this.index = new THREE.DataTexture(this.indexData, COLS, ROWS, THREE.RedIntegerFormat, THREE.ShortType);
    this.index.internalFormat = "R16I";
    this.index.minFilter = THREE.NearestFilter;
    this.index.magFilter = THREE.NearestFilter;
    this.index.unpackAlignment = 1;
    this.index.needsUpdate = true;
    onGlobalTile((key) => this.add(key));
  }

  /**
   * Marks the tiles the visible terrain needs. Any that were pushed out of the GPU (or out of memory) are
   * brought back, so the shader never falls back to the 4x coarser global heights under the camera.
   */
  use(keys: Iterable<number>) {
    this.tick++;
    for (const key of keys) {
      const layer = this.layerOf.get(key);
      if (layer !== undefined) this.lastUse[layer] = this.tick;
      else if (getGlobalTile(key)) this.add(key);
      else requestGlobalTile(key);
    }
  }

  private add(key: number) {
    if (this.layerOf.has(key)) return;
    const tile = getGlobalTile(key);
    if (!tile) return;
    let layer = 0;
    for (let i = 1; i < CACHE_LAYERS; i++) if (this.lastUse[i] < this.lastUse[layer]) layer = i;
    this.lastUse[layer] = this.tick;
    const old = this.keyOf[layer];
    if (old >= 0) {
      this.layerOf.delete(old);
      this.indexData[old] = -1;
    }
    this.keyOf[layer] = key;
    this.layerOf.set(key, layer);
    this.data.set(tile, layer * TILE * TILE);
    this.array.addLayerUpdate(layer);
    this.array.needsUpdate = true;
    this.indexData[key] = layer;
    this.index.needsUpdate = true;
  }
}

export const TILE_CACHE_GLSL = /* glsl */ `
precision highp isampler2DArray;
uniform isampler2DArray uT64;
uniform isampler2D uT64Index;

bool pix64(ivec2 g, out float v) {
  int W = 48 * 480;
  int x = ((g.x % W) + W) % W;
  int y = clamp(g.y, 0, 24 * 480 - 1);
  int tx = x / 480;
  int ty = y / 480;
  int layer = texelFetch(uT64Index, ivec2(tx, ty), 0).r;
  if (layer < 0) { v = 0.0; return false; }
  v = float(texelFetch(uT64, ivec3(x - tx * 480, y - ty * 480, layer), 0).r);
  return true;
}

float h64(float latDeg, float lonDeg, out bool ok) {
  float px = mod(lonDeg + 360.0, 360.0) * 64.0 - 0.5;
  float py = (90.0 - latDeg) * 64.0 - 0.5;
  ivec2 p = ivec2(floor(vec2(px, py)));
  vec2 f = vec2(px, py) - floor(vec2(px, py));
  float a; float b; float d; float e;
  // Fast path: all four pixels in one tile (all but ~0.4% of lookups), so the tile index is read once
  // instead of four times. Same result as the general path below. Shadow rays call this up to 90 times per pixel.
  int W = 48 * 480;
  int x = ((p.x % W) + W) % W;
  int tx = x / 480;
  int ty = p.y / 480;
  int lx = x - tx * 480;
  int ly = p.y - ty * 480;
  if (p.y >= 0 && lx < 479 && ly < 479) {
    int layer = texelFetch(uT64Index, ivec2(tx, ty), 0).r;
    ok = layer >= 0;
    if (!ok) return 0.0;
    a = float(texelFetch(uT64, ivec3(lx, ly, layer), 0).r);
    b = float(texelFetch(uT64, ivec3(lx + 1, ly, layer), 0).r);
    d = float(texelFetch(uT64, ivec3(lx, ly + 1, layer), 0).r);
    e = float(texelFetch(uT64, ivec3(lx + 1, ly + 1, layer), 0).r);
    return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
  }
  ok = pix64(p, a) && pix64(p + ivec2(1, 0), b) && pix64(p + ivec2(0, 1), d) && pix64(p + ivec2(1, 1), e);
  if (!ok) return 0.0;
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
}
`;
