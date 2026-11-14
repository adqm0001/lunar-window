import { useMemo } from "react";
import { siteSeries, siteStateAt } from "../lib/visibility";
import { useApp } from "./store";

export function useSelectedSite() {
  const data = useApp((s) => s.data)!;
  const id = useApp((s) => s.selectedId);
  return useMemo(() => data.sites.find((s) => s.id === id) ?? data.sites[0], [data, id]);
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
