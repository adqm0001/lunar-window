import { describe, expect, it } from "vitest";
import { linkPoints, MAX_LINK_POINTS, parseLinkPoints } from "./shareLink";

const pt = (id: string, lat: number, lon: number, name: string) => ({ id, lat, lon, name });
const roundTrip = (p: string | null) => parseLinkPoints(new URLSearchParams(new URLSearchParams({ p: p ?? "" }).toString()).get("p") ?? "");

describe("share link points", () => {
  it("keeps a built-in site id as it is", () => {
    expect(linkPoints([pt("custom:1", -89, 10, "A")], "shackleton-a", null)).toEqual({ p: "-89,10,A", s: "shackleton-a" });
  });

  it("refers to a selected custom point by its index", () => {
    expect(linkPoints([pt("custom:1", -89, 10, "A"), pt("custom:2", -88, 20, "B")], "custom:2", null).s).toBe("p1");
  });

  it("adds a selected finder spot as a named point after the custom points and selects it", () => {
    const spot = pt("best:1", -89.46338444, -136.86767883, "Best spot #1");
    const link = linkPoints([pt("custom:1", -89, 10, "A")], "best:1", spot);
    expect(link.s).toBe("p1");
    expect(roundTrip(link.p)).toEqual([
      { lat: -89, lon: 10, name: "A" },
      { lat: -89.4634, lon: -136.8677, name: "Best spot #1" },
    ]);
  });

  it("keeps the finder spot when the link already has the 20 custom points the app holds", () => {
    const custom = Array.from({ length: 20 }, (_, i) => pt(`custom:${i}`, -80 - i / 10, i, `P${i}`));
    const link = linkPoints(custom, "best:3", pt("best:3", -88.5, -67.7, "Best spot #3"));
    const points = roundTrip(link.p);
    expect(link.s).toBe("p20");
    expect(points).toHaveLength(21);
    expect(points[20].name).toBe("Best spot #3");
  });

  it("caps the points read from a link", () => {
    const many = Array.from({ length: MAX_LINK_POINTS + 5 }, (_, i) => `-80,${i},P${i}`).join(";");
    expect(parseLinkPoints(many)).toHaveLength(MAX_LINK_POINTS);
  });

  it("round-trips names with commas, semicolons, percent and hash signs", () => {
    const link = linkPoints([pt("custom:1", -89, 10, "Audit point 100%, A;B #2")], "custom:1", null);
    expect(roundTrip(link.p)[0].name).toBe("Audit point 100%, A;B #2");
  });

  it("writes no points when there are none", () => {
    expect(linkPoints([], "shackleton-a", null)).toEqual({ p: null, s: "shackleton-a" });
  });
});
