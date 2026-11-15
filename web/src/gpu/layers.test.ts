import { describe, expect, it } from "vitest";
import { paintSurvival } from "./layers";

// Paints a 1 x 1 survival map whose lived channel is `lived` and returns the pixel colour.
function colour(lived: number): number[] {
  const img = { data: new Uint8ClampedArray(4) } as ImageData;
  paintSurvival({ size: 1, hours: 4400, stride: 1, millis: 0, data: new Float32Array([lived, 0, 0, lived >= 1 ? -1 : 4400]) }, img);
  return Array.from(img.data.subarray(0, 3));
}

describe("survival map colours", () => {
  const GREEN = [61, 220, 151];

  it("paints a battery that never dies green", () => {
    expect(colour(1)).toEqual(GREEN);
  });

  it("does not paint a battery that dies in the last step of the longest map green", () => {
    // the most a dying battery can reach: 4399 of 4400 steps (the map never runs more than 4400 steps)
    expect(colour(Math.fround(4399 / 4400))).toEqual([255, 230, 120]);
  });
});
