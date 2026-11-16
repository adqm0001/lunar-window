import { describe, expect, it } from "vitest";
import { shouldHandleShortcut, type ShortcutEvent } from "./shortcuts";

/** Minimal element stand-in: closest() matches when the element or a fake ancestor matches the selector's tags. */
function el(tagName: string, opts: { contentEditable?: boolean; ancestors?: string[]; role?: string } = {}) {
  const chain = [tagName.toLowerCase(), ...(opts.ancestors ?? []).map((t) => t.toLowerCase())];
  return {
    tagName: tagName.toUpperCase(),
    isContentEditable: !!opts.contentEditable,
    closest(sel: string) {
      const parts = sel.split(",").map((p) => p.trim());
      if (opts.role && parts.includes(`[role=${opts.role}]`)) return {};
      if (opts.contentEditable && parts.includes("[contenteditable=true]")) return {};
      return chain.some((t) => parts.includes(t)) ? {} : null;
    },
  };
}
const ev = (key: string, over: Partial<ShortcutEvent> = {}): ShortcutEvent => ({
  key,
  target: el("div"),
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  ...over,
});

describe("shouldHandleShortcut", () => {
  it("handles plain keys on the page", () => {
    for (const k of ["h", "H", " ", "ArrowRight", "ArrowLeft"]) expect(shouldHandleShortcut(ev(k))).toBe(true);
  });
  it("ignores keys typed into inputs, selects, textareas and contenteditable", () => {
    for (const t of [el("input"), el("select"), el("textarea"), el("div", { contentEditable: true }), el("span", { ancestors: ["select"] })]) {
      for (const k of ["h", " ", "ArrowRight", "ArrowLeft"]) expect(shouldHandleShortcut(ev(k, { target: t }))).toBe(false);
    }
  });
  it("ignores shortcuts with ctrl, alt or meta held", () => {
    for (const m of ["ctrlKey", "altKey", "metaKey"] as const) {
      expect(shouldHandleShortcut(ev("h", { [m]: true }))).toBe(false);
      expect(shouldHandleShortcut(ev("ArrowLeft", { [m]: true }))).toBe(false);
    }
  });
  it("ignores auto-repeat for the toggle keys but not for arrows", () => {
    expect(shouldHandleShortcut(ev("h", { repeat: true }))).toBe(false);
    expect(shouldHandleShortcut(ev(" ", { repeat: true }))).toBe(false);
    expect(shouldHandleShortcut(ev("ArrowRight", { repeat: true }))).toBe(true);
  });
  it("keeps the Space rule: buttons, links and role=button keep Space; arrows still step from a button", () => {
    expect(shouldHandleShortcut(ev(" ", { target: el("button") }))).toBe(false);
    expect(shouldHandleShortcut(ev(" ", { target: el("a") }))).toBe(false);
    expect(shouldHandleShortcut(ev(" ", { target: el("div", { role: "button" }) }))).toBe(false);
    expect(shouldHandleShortcut(ev("ArrowRight", { target: el("button") }))).toBe(true);
    expect(shouldHandleShortcut(ev("h", { target: el("button") }))).toBe(true);
  });
  it("tolerates a non-element target (window/document)", () => {
    expect(shouldHandleShortcut(ev("h", { target: null }))).toBe(true);
    expect(shouldHandleShortcut(ev(" ", { target: {} }))).toBe(true);
  });
});
