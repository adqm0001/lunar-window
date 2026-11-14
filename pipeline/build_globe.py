import gzip
import json
from pathlib import Path

import numpy as np

from terrain import RAW

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
GLOBE_PPD = 8
GLOBE_STEP_M = 5.0
POLAR_EXTENT_M = 200_000.0
POLAR_CELL_M = 240.0


def delta_rows(q):
    return np.diff(q.astype(np.int32), axis=1, prepend=0).astype("<i2")


def build_globe():
    z = np.fromfile(RAW / "ldem_16.img", "<i2").reshape(2880, 5760).astype(np.float32) * 0.5
    f = 16 // GLOBE_PPD
    a = z.reshape(2880 // f, f, 5760 // f, f).mean(axis=(1, 3))
    q = np.round(a / GLOBE_STEP_M)
    (OUT / "globe_8ppd.bin.gz").write_bytes(gzip.compress(delta_rows(q).tobytes(), 9))
    return a.shape


def build_polar():
    n = 3812
    z = np.fromfile(RAW / "ldem_75s_240m.img", "<i2").reshape(n, n)
    center = (n - 1) / 2
    half = int(POLAR_EXTENT_M / POLAR_CELL_M)
    c0 = int(round(center - half + 0.5))
    crop = z[c0 : c0 + 2 * half, c0 : c0 + 2 * half].astype(np.float32) * 0.5
    q = np.round(crop)
    (OUT / "polar_240m.bin.gz").write_bytes(gzip.compress(delta_rows(q).tobytes(), 9))
    first_center = (c0 - center) * POLAR_CELL_M
    return crop.shape[0], first_center


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    gshape = build_globe()
    psize, first = build_polar()
    meta = {
        "globe": {
            "file": "globe_8ppd.bin.gz",
            "width": gshape[1],
            "height": gshape[0],
            "pixelsPerDegree": GLOBE_PPD,
            "stepMeters": GLOBE_STEP_M,
            "layout": "int16 [row][col] row 0 = 90N, col 0 starts at lon 0 east; value = height / stepMeters; stored as deltas along each row; gzip",
        },
        "polar": {
            "file": "polar_240m.bin.gz",
            "size": psize,
            "cellMeters": POLAR_CELL_M,
            "firstCenterMeters": first,
            "layout": "int16 meters [row][col], south polar stereographic like the field (row 0 = +y); deltas along each row; gzip",
        },
        "color": {"file": "moon_color_4k.jpg", "preview": "moon_color_1k.jpg", "layout": "equirectangular, left edge = lon -180, NASA SVS CGI Moon Kit (LRO LROC)"},
    }
    (OUT / "globe.json").write_text(json.dumps(meta, indent=2))
    sizes = {p.name: p.stat().st_size for p in OUT.glob("*") if p.name.startswith(("globe_", "polar_", "moon_color"))}
    print(meta["globe"]["width"], meta["globe"]["height"], psize, sizes)


if __name__ == "__main__":
    main()
