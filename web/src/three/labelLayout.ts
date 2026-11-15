/**
 * Vertical offsets (px) that stop label boxes centred on screen heights `ys` from overlapping, keeping at least `gap`
 * px between them and their top-to-bottom order. Boxes that would collide are packed into a group, and each group is
 * centred on its own anchors (so it spreads both ways) without running into the group above it.
 */
export function spreadLabels(ys: number[], heights: number[], gap: number): { dy: number[]; group: number[] } {
  // a label without a usable screen position (NaN or ±Infinity) stays put and in a group of its own
  const order = ys
    .map((_, i) => i)
    .filter((i) => Number.isFinite(ys[i]))
    .sort((a, b) => ys[a] - ys[b]);
  // each group: its items (in order), each item's centre relative to the group's first centre, and that first centre
  const groups: { items: number[]; rel: number[]; top: number }[] = [];
  const bottom = (g: (typeof groups)[number]) => g.top + g.rel[g.rel.length - 1] + heights[g.items[g.items.length - 1]] / 2;
  for (const i of order) {
    let g = { items: [i], rel: [0], top: ys[i] };
    for (;;) {
      const prev = groups[groups.length - 1];
      if (!prev || bottom(prev) + gap <= g.top - heights[g.items[0]] / 2) break;
      groups.pop();
      // append g below prev, then centre the merged group on the mean of its anchors
      const lastPrev = prev.items[prev.items.length - 1];
      const shift = prev.rel[prev.rel.length - 1] + (heights[lastPrev] + heights[g.items[0]]) / 2 + gap;
      const items = [...prev.items, ...g.items];
      const rel = [...prev.rel, ...g.rel.map((r) => r + shift)];
      const top = items.reduce((s, it, k) => s + ys[it] - rel[k], 0) / items.length;
      g = { items, rel, top };
    }
    groups.push(g);
  }
  const dy = new Array<number>(ys.length).fill(0);
  const group = ys.map((_, i) => -1 - i); // skipped labels keep these unique ids
  groups.forEach((g, gi) =>
    g.items.forEach((it, k) => {
      dy[it] = g.top + g.rel[k] - ys[it];
      group[it] = gi;
    }),
  );
  return { dy, group };
}
