import type { Site } from "../data/load";

// Finder rank ids are reused by later searches; a pinned location must keep its own identity.
export function pinIdentity(site: Pick<Site, "id" | "lat" | "lon">): string {
  return site.id.startsWith("best:") ? `pin:best:${site.lat},${site.lon}` : site.id;
}
