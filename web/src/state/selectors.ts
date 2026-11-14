import { useMemo } from "react";
import { siteStateAt, type SiteSeries } from "../lib/visibility";
import { getSeries, useSeriesVersion } from "./seriesCache";
import { useApp } from "./store";

export function useSites() {
  const data = useApp((s) => s.data)!;
  const custom = useApp((s) => s.customSites);
  const finder = useApp((s) => s.finder);
  return useMemo(() => {
    const out = [...data.sites];
    if (finder) out.push(...finder.candidates.map((c) => c.site));
    out.push(...custom);
    return out;
  }, [data, custom, finder]);
}

export function useSelectedSite() {
  const sites = useSites();
  const id = useApp((s) => s.selectedId);
  return useMemo(() => sites.find((s) => s.id === id) ?? sites[0], [sites, id]);
}

export function useSiteState() {
  const data = useApp((s) => s.data)!;
  const hour = useApp((s) => s.hour);
  const site = useSelectedSite();
  return useMemo(() => siteStateAt(data.ephem, site, hour), [data, site, hour]);
}

/** The selected site's series, or null while the compute worker is still working on it. */
export function useSeries(): SiteSeries | null {
  const data = useApp((s) => s.data)!;
  const site = useSelectedSite();
  const version = useSeriesVersion();
  return useMemo(() => getSeries(data.ephem, site), [data, site, version]);
}
