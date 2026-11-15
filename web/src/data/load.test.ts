import { describe, expect, it } from "vitest";
import { REPLAYS, replayById } from "./load";

describe("replayById", () => {
  it("returns the listed replay for a known id", () => {
    expect(replayById("im2")).toBe(REPLAYS.im2);
  });

  it.each(["constructor", "toString", "__proto__"])("returns null for the inherited name %s", (id) => {
    expect(replayById(id)).toBeNull();
  });

  it("returns null for an unknown id, an empty id and no id", () => {
    expect(replayById("nope")).toBeNull();
    expect(replayById("")).toBeNull();
    expect(replayById(null)).toBeNull();
  });
});
