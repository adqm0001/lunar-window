import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
EXE = ROOT / "engine" / ("horizon.exe" if sys.platform == "win32" else "horizon")


def build():
    src = ROOT / "engine" / "horizon.cpp"
    if EXE.exists() and EXE.stat().st_mtime >= src.stat().st_mtime:
        return
    flags = ["-O3", "-march=native", "-fopenmp", "-std=c++17"]
    if sys.platform == "win32":
        flags.append("-static")
    subprocess.run(["g++", *flags, "-o", str(EXE), str(src)], check=True)


def horizon(lat_deg, lon_deg, n_az, observer_height_m=2.0, max_dist_m=250_000.0):
    build()
    lat = np.atleast_1d(np.asarray(lat_deg, dtype=np.float64))
    lon = np.atleast_1d(np.asarray(lon_deg, dtype=np.float64))
    with tempfile.TemporaryDirectory() as tmp:
        pts = Path(tmp) / "points.f64"
        out = Path(tmp) / "horizon.f32"
        np.stack([lat, lon], axis=1).astype("<f8").tofile(pts)
        subprocess.run([str(EXE), str(RAW), str(pts), str(out), str(n_az), str(observer_height_m), str(max_dist_m)], check=True)
        return np.fromfile(out, dtype="<f4").reshape(lat.size, n_az)
