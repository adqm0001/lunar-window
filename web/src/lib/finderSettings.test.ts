import { describe, expect, it } from "vitest";
import type { FinderParams } from "../gpu/finder";
import { changedFinderParams } from "./finderSettings";

const DEFAULT_WEIGHTS = { sun: 0.4, link: 0.3, earth: 0.1, flat: 0.2 };

const was: FinderParams = { startHour: 7649, missionDays: 90, maxNightHours: 50, minSafePct: 50, weights: DEFAULT_WEIGHTS };

describe("finder search settings", () => {
  it("reports nothing for the same settings, even with a copied weights object", () => {
    expect(changedFinderParams(was, { ...was, weights: { ...DEFAULT_WEIGHTS } })).toEqual([]);
  });

  it("names every changed setting in form order", () => {
    const now: FinderParams = { startHour: 7650, missionDays: 14, maxNightHours: 1e9, minSafePct: 0, weights: { sun: 0.8, link: 0.05, earth: 0.05, flat: 0.1 } };
    expect(changedFinderParams(was, now)).toEqual(["landing time", "mission length", "night limit", "flat-ground limit", "priority"]);
  });
});
