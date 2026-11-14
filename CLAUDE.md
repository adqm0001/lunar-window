# Working on Lunar Window

Start here every session:

1. Read [ARCHITECTURE.md](ARCHITECTURE.md): coordinate frames, data formats, engines, conventions, gotchas.
2. Pick or continue a task from [TASKS.md](TASKS.md). Each task has Files / Spec / Verify. Implement exactly that task, nothing extra.
3. Work on a branch `task-<number>-<short-name>`, never directly on `main` (every push to `main` deploys the live site).

## Commands (from `web/`)

```bash
npm install
npm run dev               # http://localhost:5173
npx tsc --noEmit -p .     # must pass
npm run build             # must pass before any PR
npm test                  # once task 20 is done
```

## Rules

- Three.js positions are **km**; heights and polar-map coordinates are **metres**. Use `MoonScene.mapToWorld` / `worldFromLatLon`, never ad-hoc conversions.
- New GPU work goes in `src/gpu/` as a fullscreen fragment pass, split into scissored bands with `gl.flush()` if it can run long.
- Scene changes must set `dirty = true` (render on demand).
- Physics changes need a cited source in a comment and an update to `src/components/ValidationPanel.tsx` if numbers shown to users change.
- Check visual changes with the console snippet in ARCHITECTURE.md §5 and compare before/after screenshots.
- Commit messages: one plain sentence describing the change. No prefixes, no co-author or sign-off lines.
- Never commit `notes/` or `data/raw/`.
- When a task is done, tick its box in TASKS.md in the same PR. If a spec was wrong, correct it there and explain in the PR.
