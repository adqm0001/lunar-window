import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import numpy as np

from ephemeris import Ephemeris
from horizon import altaz
from sites import SITES

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
BODIES = {"Sun": "10", "Earth": "399"}


def query(body, lat, lon, start, stop, step):
    params = {
        "format": "json",
        "COMMAND": f"'{body}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon % 360:.4f},{lat:.4f},0'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{step}'",
        "QUANTITIES": "'4'",
        "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "'YES'",
    }
    with urllib.request.urlopen(f"{API}?{urllib.parse.urlencode(params)}", timeout=60) as r:
        text = json.load(r)["result"]
    rows = text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    times, az, el = [], [], []
    for row in rows:
        cols = [c.strip() for c in row.split(",")]
        times.append(datetime.strptime(cols[0], "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc))
        az.append(float(cols[3]))
        el.append(float(cols[4]))
    return times, np.array(az), np.array(el)


def angle_diff(a, b):
    return (a - b + 180) % 360 - 180


def main():
    e = Ephemeris()
    picks = [s for s in SITES if s["id"] in ("connecting-ridge-b", "malapert-m1", "apollo-11")]
    print("Our ephemeris vs JPL Horizons (airless apparent az/el), daily samples through 2027")
    print(f"{'site':22s} {'body':6s} {'n':>4s} {'max |d az|':>11s} {'max |d el|':>11s} {'rms d el':>9s}")
    worst = 0.0
    for s in picks:
        for name, code in BODIES.items():
            times, h_az, h_el = query(code, s["lat"], s["lon"], "2027-01-01", "2027-12-31", "1 d")
            t = e.ts.from_datetimes(times)
            sun, earth = e.moon_fixed(t)
            vec = sun if name == "Sun" else earth
            az, el = altaz(vec, s["lat"], s["lon"], 0.0)
            daz = np.abs(angle_diff(az, h_az))
            daz = np.where(np.abs(h_el) > 89, 0, daz)
            dele = el - h_el
            worst = max(worst, float(np.abs(dele).max()))
            print(f"{s['name']:22s} {name:6s} {len(times):4d} {daz.max():10.4f} deg {np.abs(dele).max():10.4f} deg {np.sqrt((dele**2).mean()):8.4f} deg")
    print(f"worst elevation difference: {worst:.4f} deg (Sun disc is 0.53 deg wide)")


if __name__ == "__main__":
    main()
