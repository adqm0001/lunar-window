import { describe, expect, it } from "vitest";
import { siteThermal } from "./siteThermal";
import { loadTestEphemeris, loadTestSites } from "./testData";

const ephem = loadTestEphemeris();
const sites = loadTestSites();
const site = (id: string) => {
  const s = sites.find((x) => x.id === id);
  if (!s) throw new Error(`site ${id} missing from sites.json`);
  return s;
};

// Diviner measures ≈95–390 K at the equator (Williams et al. 2017) and keeps permanently
// shadowed crater floors such as Shackleton's well below 110 K, where water ice is stable.
describe("siteThermal against Diviner", () => {
  it("loads the full ephemeris", () => {
    expect(ephem.data.length).toBe(ephem.count * 6);
    expect(ephem.dsn.length).toBe(ephem.count * ephem.stations.length);
  });

  it("gives an equatorial day and night range at Apollo 11", () => {
    const t = siteThermal(ephem, site("apollo-11"), 0, 24 * 365);
    expect(t.max).toBeGreaterThanOrEqual(370);
    expect(t.max).toBeLessThanOrEqual(400);
    expect(t.min).toBeGreaterThanOrEqual(80);
    expect(t.min).toBeLessThanOrEqual(100);
  });

  it("keeps the Shackleton crater floor cold enough for surface ice", () => {
    const t = siteThermal(ephem, site("shackleton-floor"), 0, 8760);
    expect(t.max).toBeLessThan(110);
    expect(t.iceDepth).toBe(0);
  });
});
