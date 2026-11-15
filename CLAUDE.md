# Working on Lunar Window

Start here every session:

1. Read [ARCHITECTURE.md](ARCHITECTURE.md): coordinate frames, data formats, engines, conventions, gotchas.
2. Pick or continue a task from [TASKS.md](TASKS.md). Each task has Files / Spec / Verify. Implement exactly that task, nothing extra.
   Before starting, check its GitHub issue (`gh issue list --search "Task <number>:" --state all`): if it is closed, assigned to someone else, or has a "taking this" comment from someone else, do not work on it. Otherwise claim it (`gh issue edit <n> --add-assignee @me`, or `gh issue comment <n> --body "taking this"` if you can't be assigned).
3. Work on a branch `task-<number>-<short-name>`, never directly on `main` (every push to `main` deploys the live site). The PR description must contain `Closes #<issue number>`. PRs must pass the automatic checks (type check, tests, build) before they can be merged.
4. **Merging your own PR** (see [REVIEWING.md](REVIEWING.md)): wait for the reviewer. PRs opened from the owner's account can't get a GitHub approval from that same account, so the reviewer approves by posting a comment that starts with `okay to merge`. Merge only when all of these hold:
   - there is a GitHub approval, or a comment starting with `okay to merge`, posted after your last commit other than merges from `main` (`gh pr view <n> --comments`);
   - the branch is up to date (`gh pr update-branch <n>` if not) and `checks` is green (`gh pr checks <n> --watch`);
   - no unresolved "request changes" review.

   Then `gh pr merge <n> --squash --delete-branch` and confirm the issue closed and the deploy on `main` succeeded (`gh run list --workflow pages.yml --limit 1`). If you merge several PRs, do them one at a time: each merge puts the others behind `main`.

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
- **Marking tasks done:** after finishing a task, run its **Verify** steps yourself, plus `npx tsc --noEmit -p .` and `npm run build`. Only when all of them pass, change that task's `- [ ]` to `- [x]` in TASKS.md, in the same commit or PR. Never tick a task you haven't verified; if part of it can't be checked, leave it unchecked and explain why.
- If a spec in TASKS.md turns out to be wrong, correct the spec there and explain in the PR.
