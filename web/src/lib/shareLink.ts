// Points in a share link: #...&s=site&p=lat,lon,name;lat,lon,name

export interface LinkPoint {
  lat: number;
  lon: number;
  name: string;
}

interface Point extends LinkPoint {
  id: string;
}

/** The 20 custom points the app keeps, plus a selected landing-finder spot. */
export const MAX_LINK_POINTS = 21;

const fix = (n: number, d: number) => Number(n.toFixed(d));

/**
 * The `p` and `s` values for a link. `spot` is the selected site when it exists only in this browser (a landing-finder
 * result, whose `best:N` id means nothing elsewhere); it is shared as one more named point and selected by index.
 */
export function linkPoints(custom: Point[], selectedId: string, spot: Point | null): { p: string | null; s: string } {
  const points = spot ? [...custom, spot] : custom;
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
    .map((a) => ({ lat: Number(a[0]), lon: Number(a[1]), name: decodeURIComponent(a.slice(2).join(",") || "") }));
}
