import { describe, expect, it } from "vitest";
import { scrubHour, viewStart } from "./timelineScrub";

const total = 20000;
const span = 30 * 24;

describe("timeline scrubbing", () => {
  it("anchors the view a third of the span before the hour and clamps it", () => {
    expect(viewStart(5000, span, total)).toBe(5000 - span / 3);
    expect(viewStart(10, span, total)).toBe(0);
    expect(viewStart(total, span, total)).toBe(total - span);
  });

  it("maps pointer fraction linearly against a frozen view start", () => {
    const start = viewStart(7652, span, total);
    expect(scrubHour(0, "main", start, span, total)).toBe(start);
    expect(scrubHour(1, "main", start, span, total)).toBe(start + span);
    expect(scrubHour(0.5, "main", start, span, total)).toBe(start + span / 2);
  });

  it("a small drag moves the hour by a small amount and dragging back returns to the start", () => {
    const start = viewStart(7652, span, total);
    const f0 = 1 / 3;
    const a = scrubHour(f0, "main", start, span, total);
    const b = scrubHour(f0 + 0.01, "main", start, span, total);
    expect(b - a).toBeCloseTo(0.01 * span, 6);
    expect(scrubHour(f0, "main", start, span, total)).toBe(a);
  });

  it("maps the overview over the whole ephemeris and clamps the fraction", () => {
    expect(scrubHour(0.5, "overview", 123, span, total)).toBe(total / 2);
    expect(scrubHour(-1, "main", 100, span, total)).toBe(100);
    expect(scrubHour(2, "overview", 100, span, total)).toBe(total);
  });
});
