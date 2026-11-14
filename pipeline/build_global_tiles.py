import gzip
import json
from pathlib import Path

import numpy as np

from terrain import RAW

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data" / "tiles64"
W, H = 23040, 11520
PPD = 64
TILE = 480


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    z = np.memmap(RAW / "ldem_64.img", dtype="<i2", mode="r", shape=(H, W))
    total = 0
    count = 0
    for ty in range(H // TILE):
        for tx in range(W // TILE):
            t = np.round(z[ty * TILE : (ty + 1) * TILE, tx * TILE : (tx + 1) * TILE].astype(np.float32) * 0.5).astype(np.int32)
            d = np.diff(t, axis=1, prepend=0)
            d = ((d + 32768) % 65536 - 32768).astype("<i2")
            data = gzip.compress(d.tobytes(), 6)
            (OUT / f"{tx}_{ty}.bin.gz").write_bytes(data)
            total += len(data)
            count += 1
    index = {
        "tile": TILE,
        "pixelsPerDegree": PPD,
        "columns": W // TILE,
        "rows": H // TILE,
        "source": "LRO LOLA LDEM_64 (NASA PDS)",
        "layout": "tile (tx, ty): int16 meters [row][col], deltas along rows, gzip. Pixel (col, row) of the full map covers lon (col+0.5)/64 east, lat 90-(row+0.5)/64.",
    }
    (OUT / "index.json").write_text(json.dumps(index))
    print(f"{count} tiles, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
