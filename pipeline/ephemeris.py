import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from skyfield.api import Loader, wgs84
from skyfield.planetarylib import PlanetaryConstants

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"

DSN = {
    "Goldstone": (35.4259, -116.8895, 1001.0),
    "Madrid": (40.4313, -4.2480, 865.0),
    "Canberra": (-35.4024, 148.9813, 692.0),
}


class Ephemeris:
    def __init__(self):
        load = Loader(str(RAW), verbose=False)
        self.ts = load.timescale(builtin=True)
        self.eph = load("de421.bsp")
        pc = PlanetaryConstants()
        pc.read_text(load("moon_080317.tf"))
        pc.read_binary(load("moon_pa_de421_1900-2050.bpc"))
        self.frame = pc.build_frame_named("MOON_ME_DE421")
        self.moon = self.eph["moon"]
        self.earth = self.eph["earth"]
        self.sun = self.eph["sun"]

    def hourly(self, start: datetime, hours: int):
        return self.ts.utc(start.year, start.month, start.day, start.hour + np.arange(hours))

    def moon_fixed(self, t):
        moon_at = self.moon.at(t)
        sun = moon_at.observe(self.sun).apparent().frame_xyz(self.frame).km
        earth = moon_at.observe(self.earth).apparent().frame_xyz(self.frame).km
        return sun.T, earth.T

    def dsn_elevations(self, t):
        cols = []
        for lat, lon, elev in DSN.values():
            station = self.earth + wgs84.latlon(lat, lon, elevation_m=elev)
            alt, _, _ = station.at(t).observe(self.moon).apparent().altaz()
            cols.append(alt.degrees)
        return np.stack(cols, axis=1)


def main():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end = datetime(2037, 1, 1, tzinfo=timezone.utc)
    hours = int((end - start).total_seconds() // 3600)
    e = Ephemeris()
    write_ephemeris(e, start, hours)

    # Include every hourly sample on March 31; the end boundary is exclusive.
    replay_start = datetime(2025, 2, 15, tzinfo=timezone.utc)
    replay_end = datetime(2025, 4, 1, tzinfo=timezone.utc)
    replay_hours = int((replay_end - replay_start).total_seconds() // 3600)
    write_ephemeris(e, replay_start, replay_hours, suffix="_2025")


def write_ephemeris(e: Ephemeris, start: datetime, hours: int, suffix: str = ""):
    t = e.hourly(start, hours)
    sun, earth = e.moon_fixed(t)
    dsn = e.dsn_elevations(t)
    OUT.mkdir(parents=True, exist_ok=True)
    np.concatenate([sun, earth], axis=1).astype("<f4").tofile(OUT / f"ephem{suffix}.bin")
    np.clip(np.round(dsn), -90, 90).astype(np.int8).tofile(OUT / f"dsn{suffix}.bin")
    meta = {
        "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stepHours": 1,
        "count": hours,
        "frame": "MOON_ME_DE421",
        "units": "km, Moon center to body, apparent",
        "layout": "float32 [count][sunX, sunY, sunZ, earthX, earthY, earthZ]",
        "dsn": {"layout": "int8 degrees [count][station]", "stations": [{"name": k, "lat": v[0], "lon": v[1]} for k, v in DSN.items()]},
    }
    if suffix:
        # Each replay needs DSN elevations covering the same hours as its vectors.
        meta["dsn"]["file"] = f"dsn{suffix}.bin"
    (OUT / f"ephem{suffix}.json").write_text(json.dumps(meta, indent=2))
    print(f"ephem{suffix}: {hours} hours written, sun dist {np.linalg.norm(sun[0]):.4g} km, earth dist {np.linalg.norm(earth[0]):.4g} km")


if __name__ == "__main__":
    main()
