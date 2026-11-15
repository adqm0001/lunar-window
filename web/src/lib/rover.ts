import type { FieldData } from "../data/field";
import type { VisibilityBits } from "../gpu/engine";

// Time-dependent route search for a solar rover. Shadows move every hour, so the best path
// depends on when you drive. The search tracks the earliest time the rover can reach each grid
// cell (A* on arrival time). From a cell it can wait while the Sun is up, then drive to a
// neighbour if the ground is gentle enough and both ends are sunlit (and, optionally, Earth is in
// view for the drive). Waiting in darkness is only allowed at the start (parked, hibernating).
// Because waiting is only allowed in sunlight, the result is a good route but not guaranteed to be the fastest possible.

export interface RoverParams {
  start: { col: number; row: number };
  goal: { col: number; row: number };
  speedKmh: number;
  maxSlopeDeg: number;
  needLink: boolean;
}

export interface RouteStop {
  col: number;
  row: number;
  arrive: number;
  depart: number;
}

export interface RoverRoute {
  startHour: number;
  stops: RouteStop[];
  arriveHour: number;
  distanceKm: number;
  driveHours: number;
  waitHours: number;
  litPct: number;
  linkPct: number;
  expanded: number;
  millis: number;
  gpuMillis: number;
}

export interface RoverFailure {
  reason: string;
  expanded: number;
  millis: number;
}

// Binary min-heap with lazy deletion: a key may be pushed again with a lower priority; each heap
// entry carries its own priority, so the older, stale entry stays correctly ordered and the caller
// skips it when it pops a key it has already closed.
export class Heap {
  private k: number[] = [];
  private pri: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k;
    const q = this.pri;
    let i = k.length;
    k.push(key);
    q.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (q[p] <= val) break;
      k[i] = k[p];
      q[i] = q[p];
      i = p;
    }
    k[i] = key;
    q[i] = val;
  }
  pop(): number {
    const k = this.k;
    const q = this.pri;
    const top = k[0];
    const lastK = k.pop()!;
    const lastQ = q.pop()!;
    const n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && q[r] < q[l] ? r : l;
        if (q[m] >= lastQ) break;
        k[i] = k[m];
        q[i] = q[m];
        i = m;
      }
      k[i] = lastK;
      q[i] = lastQ;
    }
    return top;
  }
}

const NB: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export function planRoute(field: FieldData, bits: VisibilityBits, p: RoverParams): RoverRoute | RoverFailure {
  const t0 = performance.now();
  const n = field.meta.horizon.size;
  const cellKm = field.meta.horizon.cellMeters / 1000;
  const W = bits.words;
  const H = bits.hours;
  const slopeSize = field.meta.slope.size;
  const bit = (arr: Uint32Array, cell: number, h: number) => {
    if (h < 0 || h >= H) return false;
    return ((arr[cell * W + (h >> 5)] >>> (h & 31)) & 1) === 1;
  };
  const slopeAt = (col: number, row: number) => {
    const c = Math.min(slopeSize - 1, Math.floor((col * slopeSize) / n));
    const r = Math.min(slopeSize - 1, Math.floor((row * slopeSize) / n));
    return field.slope[r * slopeSize + c] / 4;
  };
  const startCell = p.start.row * n + p.start.col;
  const goalCell = p.goal.row * n + p.goal.col;
  const arrive = new Float64Array(n * n).fill(Infinity);
  const departFrom = new Float64Array(n * n);
  const parent = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);
  const heap = new Heap();
  const hKm = (cell: number) => {
    const c = cell % n;
    const r = (cell - c) / n;
    return Math.hypot(c - p.goal.col, r - p.goal.row) * cellKm;
  };
  arrive[startCell] = 0;
  heap.push(startCell, hKm(startCell) / p.speedKmh);
  let expanded = 0;

  while (heap.size) {
    const cell = heap.pop();
    if (closed[cell]) continue;
    closed[cell] = 1;
    expanded++;
    if (cell === goalCell) break;
    const tc = arrive[cell];
    const col = cell % n;
    const row = (cell - col) / n;
    for (const [dc, dr] of NB) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= n || nr >= n) continue;
      const next = nr * n + nc;
      if (closed[next]) continue;
      if (next !== goalCell && slopeAt(nc, nr) > p.maxSlopeDeg) continue;
      const moveH = (Math.hypot(dc, dr) * cellKm) / p.speedKmh;
      // earliest departure: wait (in sunlight, or anywhere at the start) until the move is possible
      let td = tc;
      let found = -1;
      for (let guard = 0; guard < H; guard++) {
        const hd = Math.floor(td);
        if (hd >= H) break;
        const hereOk = cell === startCell || bit(bits.sun, cell, hd);
        if (!hereOk) break;
        const ta = td + moveH;
        const ha = Math.floor(ta);
        // A move can span several hours: apply both rules at both ends in every sampled hour.
        // Contact, like sunlight, includes the arrival hour; waiting itself does not require contact.
        let ok = true;
        for (let h = hd; ok && h <= ha; h++) {
          ok = bit(bits.sun, cell, h) && bit(bits.sun, next, h)
            && (!p.needLink || (bit(bits.link, cell, h) && bit(bits.link, next, h)));
        }
        if (ok) {
          found = ta;
          break;
        }
        td = hd + 1;
      }
      if (found < 0 || found >= arrive[next]) continue;
      arrive[next] = found;
      parent[next] = cell;
      departFrom[next] = td;
      heap.push(next, found + hKm(next) / p.speedKmh);
    }
  }
  const millis = performance.now() - t0;
  if (!Number.isFinite(arrive[goalCell])) {
    return {
      reason: `No sunlit, drivable route found within ${Math.round(H / 24)} days. Try a gentler slope limit, turning off the Earth-link rule, or another start time.`,
      expanded,
      millis,
    };
  }
  const chain: number[] = [];
  for (let c = goalCell; c !== -1; c = parent[c]) chain.push(c);
  chain.reverse();
  const stops: RouteStop[] = chain.map((c, i) => {
    const col = c % n;
    const row = (c - col) / n;
    const next = chain[i + 1];
    return { col, row, arrive: arrive[c], depart: next !== undefined ? departFrom[next] : arrive[c] };
  });
  let dist = 0;
  let drive = 0;
  let linkH = 0;
  let litH = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    dist += Math.hypot(a.col - b.col, a.row - b.row) * cellKm;
    drive += b.arrive - a.depart;
  }
  const total = stops[stops.length - 1].arrive;
  for (let h = 0; h < Math.ceil(total); h++) {
    let i = 0;
    while (i < stops.length - 1 && stops[i + 1].arrive <= h) i++;
    const c = stops[i].row * n + stops[i].col;
    if (bit(bits.sun, c, h)) litH++;
    if (bit(bits.link, c, h)) linkH++;
  }
  const hrs = Math.max(1, Math.ceil(total));
  return {
    startHour: bits.start,
    stops,
    arriveHour: bits.start + total,
    distanceKm: dist,
    driveHours: drive,
    waitHours: total - drive,
    litPct: (100 * litH) / hrs,
    linkPct: (100 * linkH) / hrs,
    expanded,
    millis,
    gpuMillis: bits.millis,
  };
}

// Position along the route at an absolute hour: [col, row] in grid units (fractional).
export function roverAt(route: RoverRoute, hour: number): [number, number] {
  const t = hour - route.startHour;
  const s = route.stops;
  if (t <= s[0].depart) return [s[0].col, s[0].row];
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1];
    const b = s[i];
    if (t < a.depart) return [a.col, a.row];
    if (t < b.arrive) {
      const k = (t - a.depart) / Math.max(1e-6, b.arrive - a.depart);
      return [a.col + (b.col - a.col) * k, a.row + (b.row - a.row) * k];
    }
  }
  const last = s[s.length - 1];
  return [last.col, last.row];
}

export const isRoute = (r: RoverRoute | RoverFailure | null): r is RoverRoute => !!r && "stops" in r;
