// Pure mapping for scrubbing the timeline. The zoomed view is anchored to the hour (a third of the span before it);
// while a drag is in progress the view start must stay frozen, otherwise each pointermove moves the view under the
// pointer and the hour runs away.

/** First hour shown by the zoomed view when the playhead is at `hour`. */
export function viewStart(hour: number, span: number, total: number): number {
  return Math.max(0, Math.min(total - span, hour - span / 3));
}

/** Hour under pointer fraction `f` (0..1 across the track): the whole ephemeris in the overview, else the view. */
export function scrubHour(f: number, mode: "main" | "overview", start: number, span: number, total: number): number {
  const c = Math.max(0, Math.min(1, f));
  return mode === "overview" ? c * total : start + c * span;
}

/** View left in place by the last main-track scrub: the start it used, the hour that scrub produced and the span. */
export interface HeldView {
  start: number;
  hour: number;
  span: number;
}

/**
 * View start to draw. A main-track scrub holds its view (during the drag and after release) for as long as the hour is
 * still the one the scrub set and is inside that view; any other change (playback, keys, jumps, a new window length)
 * re-anchors the view to the hour as before. Overview drags never hold a view.
 */
export function resolveStart(held: HeldView | null, hour: number, span: number, total: number): number {
  if (held && held.span === span && held.hour === hour && hour >= held.start && hour <= held.start + span) return held.start;
  return viewStart(hour, span, total);
}
