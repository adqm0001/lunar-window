import type { FinderParams } from "../gpu/finder";

export const sameWeights = (a: FinderParams["weights"], b: FinderParams["weights"]) =>
  a.sun === b.sun && a.link === b.link && a.earth === b.earth && a.flat === b.flat;

/** Names of the search settings that differ between a finished search and the current form, in form order. */
export function changedFinderParams(was: FinderParams, now: FinderParams): string[] {
  const out: string[] = [];
  if (was.startHour !== now.startHour) out.push("landing time");
  if (was.missionDays !== now.missionDays) out.push("mission length");
  if (was.maxNightHours !== now.maxNightHours) out.push("night limit");
  if (was.minSafePct !== now.minSafePct) out.push("flat-ground limit");
  if (!sameWeights(was.weights, now.weights)) out.push("priority");
  return out;
}
