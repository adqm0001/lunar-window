// Points in a share link: #...&s=site&p=lat,lon,name;lat,lon,name

export interface LinkPoint {
  lat: number;
  lon: number;
  name: string;
}

interface Point extends LinkPoint {
  id: string;
}

/** As many custom points as the app keeps (see setCustomSite in state/store.ts). */
export const MAX_LINK_POINTS = 20;

export const fix = (n: number, d: number) => Number(n.toFixed(d));

const decodeName = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // a link cut off in the middle of an escape
  }
};

/**
 * The `p` and `s` values for a link. `spot` is the selected site when it exists only in this browser (a landing-finder
 * result, whose `best:N` id means nothing elsewhere); it is shared as one more named point and selected by index. When
 * that would go over the app's limit the oldest custom point is left out, as the receiving page would drop it anyway.
 */
export function linkPoints(custom: Point[], selectedId: string, spot: Point | null): { p: string | null; s: string } {
  const points = spot ? [...custom.slice(Math.max(0, custom.length + 1 - MAX_LINK_POINTS)), spot] : custom;
  const pi = points.findIndex((c) => c.id === selectedId);
  const p = points.length ? points.map((c) => `${fix(c.lat, 4)},${fix(c.lon, 4)},${encodeURIComponent(c.name)}`).join(";") : null;
  return { p, s: pi >= 0 ? `p${pi}` : selectedId };
}

export function parseLinkPoints(p: string): LinkPoint[] {
  return p
    .split(";")
    .map((e) => e.split(","))
    .filter((a) => a.length >= 2 && Number.isFinite(Number(a[0])) && Number.isFinite(Number(a[1])))
    .slice(0, MAX_LINK_POINTS)
    .map((a) => ({ lat: Number(a[0]), lon: Number(a[1]), name: decodeName(a.slice(2).join(",") || "") }));
}
