import { describe, expect, it } from "vitest";
import { ICE_HOURS, iceVerdictPossible } from "../gpu/thermal";
import { siteThermal, terrainViewFactor, thermalSpanLabel } from "./siteThermal";
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

  // Light and heat bounced off the crater walls (Ingersoll et al. 1992) warm the floor well above
  // the ~25 K that direct sunlight alone would give.
  it("warms the Shackleton floor with light bounced off its walls", () => {
    const floor = site("shackleton-floor");
    expect(terrainViewFactor(floor.horizon)).toBeGreaterThan(0.1);
    expect(terrainViewFactor(floor.horizon)).toBeLessThan(0.2);
    const t = siteThermal(ephem, floor, 0, 8760);
    expect(t.max).toBeGreaterThan(70);
  });

  it("leaves open ground without terrain above the horizon unaffected", () => {
    expect(terrainViewFactor(site("apollo-11").horizon)).toBeLessThan(0.01);
  });
});

// Ice stability means the warmest temperature over a whole year stays below 110 K, so a shorter run can't decide it.
describe("thermal coverage", () => {
  it("allows an ice verdict only for a full year of modelled temperatures", () => {
    expect(iceVerdictPossible(ICE_HOURS)).toBe(true);
    expect(iceVerdictPossible(24 * 395)).toBe(true);
    expect(iceVerdictPossible(ICE_HOURS - 1)).toBe(false);
    expect(iceVerdictPossible(24)).toBe(false);
  });

  it("can't give an ice verdict on the last day of the data", () => {
    const t = siteThermal(ephem, site("shackleton-floor"), ephem.count - 1, 24 * 395);
    expect(t.hours).toBeLessThanOrEqual(24);
    expect(iceVerdictPossible(t.hours)).toBe(false);
  });

  it("names the span the temperatures cover", () => {
    expect(thermalSpanLabel(24 * 395)).toBe("13 months");
    expect(thermalSpanLabel(24 * 30)).toBe("30 d");
    expect(thermalSpanLabel(24)).toBe("24 h");
    expect(thermalSpanLabel(47)).toBe("47 h");
  });
});
