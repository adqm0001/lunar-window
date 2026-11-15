import { describe, expect, it } from "vitest";
import { spreadLabels } from "./labelLayout";

// Boxes are centred on y + dy; two boxes overlap when their centres are closer than half of each height plus the gap.
function overlaps(ys: number[], hs: number[], dys: number[], gap: number) {
  const c = ys.map((y, i) => ({ y: y + dys[i], h: hs[i] })).sort((a, b) => a.y - b.y);
  return c.some((b, i) => i > 0 && b.y - c[i - 1].y < (b.h + c[i - 1].h) / 2 + gap - 1e-9);
}

describe("spreading cutaway labels", () => {
  it("leaves labels that don't touch where they are", () => {
    expect(spreadLabels([100, 300, 500], [37, 37, 37], 4).dy).toEqual([0, 0, 0]);
  });

  it("separates the three core labels from the issue (about 11 px apart, 37 px tall)", () => {
    const ys = [494.6, 484.3, 473.0, 300, 120];
    const hs = [37, 37, 37, 37, 37];
    const dys = spreadLabels(ys, hs, 4).dy;
    expect(overlaps(ys, hs, dys, 4)).toBe(false);
    expect(dys[3]).toBe(0);
    expect(dys[4]).toBe(0);
  });

  it("keeps the labels in the same top-to-bottom order as their layers", () => {
    const ys = [494.6, 484.3, 473.0];
    const dys = spreadLabels(ys, [37, 37, 37], 4).dy;
    const placed = ys.map((y, i) => y + dys[i]);
    expect(placed[2]).toBeLessThan(placed[1]);
    expect(placed[1]).toBeLessThan(placed[0]);
  });

  it("centres a pushed group on its layers instead of pushing it all one way", () => {
    const ys = [400, 400, 400];
    const dys = spreadLabels(ys, [30, 30, 30], 0).dy;
    expect(dys.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 6);
  });

  it("doesn't push a group back into the label above it", () => {
    const ys = [100, 140, 141, 142];
    const hs = [37, 37, 37, 37];
    expect(overlaps(ys, hs, spreadLabels(ys, hs, 4).dy, 4)).toBe(false);
  });

  it("puts labels that had to be spread apart in one group, and leaves the others on their own", () => {
    const { group } = spreadLabels([494.6, 484.3, 473.0, 300, 120], [37, 37, 37, 37, 37], 4);
    expect(group[0]).toBe(group[1]);
    expect(group[1]).toBe(group[2]);
    expect(new Set(group).size).toBe(3);
  });
});
