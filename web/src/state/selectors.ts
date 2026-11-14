import { useMemo } from "react";
import { siteSeries, siteStateAt } from "../lib/visibility";
import { useApp } from "./store";

export function useSites() {
  const data = useApp((s) => s.data)!;
  const custom = useApp((s) => s.customSite);
  const finder = useApp((s) => s.finder);
  return useMemo(() => {
    const out = [...data.sites];
    if (finder) out.push(...finder.candidates.map((c) => c.site));
    if (custom) out.push(custom);
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

export function useSeries() {
  const data = useApp((s) => s.data)!;
  const site = useSelectedSite();
  return useMemo(() => siteSeries(data.ephem, site), [data, site]);
}
