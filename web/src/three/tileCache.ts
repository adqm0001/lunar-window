import * as THREE from "three";
import { getGlobalTile, onGlobalTile } from "../data/globalTiles";

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
  private next = 0;
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

  private add(key: number) {
    if (this.layerOf.has(key)) return;
    const tile = getGlobalTile(key);
    if (!tile) return;
    const layer = this.next;
    this.next = (this.next + 1) % CACHE_LAYERS;
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
  ok = pix64(p, a) && pix64(p + ivec2(1, 0), b) && pix64(p + ivec2(0, 1), d) && pix64(p + ivec2(1, 1), e);
  if (!ok) return 0.0;
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
}
`;
