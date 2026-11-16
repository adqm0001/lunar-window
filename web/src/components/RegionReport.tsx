import { useEffect, useState } from "react";
import Modal from "./Modal";
import { ARTEMIS_SOURCE } from "../data/artemis";
import { getGlobalMetrics } from "../gpu/globalOverlay";
import { ICE_HOURS, iceCovered } from "../gpu/thermal";
import { addPointAt } from "../lib/points";
import { regionReport, type RegionRow } from "../lib/regionReport";
import { formatDuration, formatUtc, hourToDate, useApp } from "../state/store";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function RegionReport({ onClose }: { onClose: () => void }) {
  const data = useApp((s) => s.data)!;
  const hour = useApp((s) => s.hour);
  const rangeDays = useApp((s) => s.rangeDays);
  const globe = useApp((s) => s.globe);
  const start = Math.floor(hour / 24) * 24;
  // Ice stability needs a full year of temperatures; near the end of the data (or in a short replay) it is left out.
  const iceOk = iceCovered(data.ephem.count, start);
  const [rows, setRows] = useState<RegionRow[] | null>(null);
  const [status, setStatus] = useState("Computing on your GPU…");

  useEffect(() => {
    if (!globe) return;
    let cancelled = false;
    setRows(null);
    (async () => {
      const light = await getGlobalMetrics("light", start, rangeDays * 24);
      const thermal = iceOk ? await getGlobalMetrics("thermal", start, ICE_HOURS) : null;
      if (cancelled) return;
      if (!light || (iceOk && !thermal)) {
        setStatus("The whole-Moon engine could not start on this GPU.");
        return;
      }
      setRows(regionReport(light, thermal));
    })();
    return () => {
      cancelled = true;
    };
  }, [globe, start, rangeDays, iceOk]);

  const go = (r: RegionRow) => {
    const st = useApp.getState();
    st.setView("3d");
    addPointAt(r.best.lat, r.best.lon, `Best in ${r.region.name}`);
    onClose();
  };

  return (
    <Modal className="report" title="Artemis III candidate regions"
      subtitle={<>{formatUtc(hourToDate(data, start)).slice(0, 10)} + {rangeDays} days (change with the timeline and the Layers range) ·{" "}
        {iceOk ? "ice uses a full year" : "ice left out: it needs a full year of data and the data ends sooner"}</>}
      onClose={onClose}>
        {!rows && <div className="legend-gpu">{status}</div>}
        {rows && (
          <table className="vtable report-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Region</th>
                <th title="Average over the region / at its best spot">Sunlit avg / best</th>
                <th>Earth in view</th>
                <th title="Sun up, Earth up and a DSN dish in view at once">Sun + DSN best</th>
                <th>Longest night (best)</th>
                <th title="Share of the region where water ice is stable within 80 cm of the surface">Ice-stable area</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.region.name}>
                  <td>{i + 1}</td>
                  <td>{r.region.name}</td>
                  <td>
                    {pct(r.sunAvg)} / <b style={{ color: "var(--sun)" }}>{pct(r.sunBest)}</b>
                  </td>
                  <td>{pct(r.earthAvg)}</td>
                  <td style={{ color: "var(--link)" }}>{pct(r.linkBest)}</td>
                  <td>{formatDuration(r.nightBestH)}</td>
                  <td style={{ color: "var(--earth)" }} title={iceOk ? undefined : "Needs a full year of data"}>
                    {iceOk ? pct(r.iceArea) : "—"}
                  </td>
                  <td>
                    <button className="btn small" onClick={() => go(r)} title="Add the best spot as a point and fly there">
                      Go to best spot
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted report-note">
          Ranked by sunlight and Earth contact at each region's best spot, the length of its longest night
          {iceOk ? ", and how much ice-stable ground is nearby" : " (not ice: there isn't a full year of data from this date)"}. Computed
          from the whole-Moon models (about 1.4 km cells); open a region in detail with "Analyze area" for 250 m cells. {ARTEMIS_SOURCE}
        </p>
    </Modal>
  );
}
