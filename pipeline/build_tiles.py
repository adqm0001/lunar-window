import gzip
import json
from pathlib import Path

import numpy as np

from terrain import RAW

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data" / "tiles40"
SOURCE = "ldem_80s_40m.img"
N = 15200
CELL = 40.0
TILE = 512
MAX_RADIUS_M = 250_000.0


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    z = np.memmap(RAW / SOURCE, dtype="<i2", mode="r", shape=(N, N))
    c0 = N // 2
    span = TILE * CELL
    k = int(np.ceil(MAX_RADIUS_M / span))
    written = []
    total = 0
    for j in range(-k, k):
        for i in range(-k, k):
            x_lo, x_hi = i * span, (i + 1) * span
            y_hi, y_lo = -j * span, -(j + 1) * span
            nx = min(max(0.0, x_lo), x_hi) if not (x_lo <= 0 <= x_hi) else 0.0
            ny = min(max(0.0, y_lo), y_hi) if not (y_lo <= 0 <= y_hi) else 0.0
            if np.hypot(nx, ny) > MAX_RADIUS_M:
                continue
            r0 = c0 + j * TILE
            q0 = c0 + i * TILE
            if r0 < 0 or q0 < 0 or r0 + TILE > N or q0 + TILE > N:
                continue
            tile = np.round(z[r0 : r0 + TILE, q0 : q0 + TILE].astype(np.float32) * 0.5).astype(np.int32)
            delta = np.diff(tile, axis=1, prepend=0).astype("<i2")
            data = gzip.compress(delta.tobytes(), 6)
            (OUT / f"{i}_{j}.bin.gz").write_bytes(data)
            written.append(f"{i}_{j}")
            total += len(data)
    index = {
        "tile": TILE,
        "cellMeters": CELL,
        "source": "LRO LOLA LDEM_80S_40M (NASA PDS)",
        "layout": "tile (i, j): int16 meters [row][col], deltas along rows, gzip. First pixel center x = i*tile*cell + cell/2, first row center y = -j*tile*cell - cell/2; rows go toward -y.",
        "tiles": written,
    }
    (OUT / "index.json").write_text(json.dumps(index))
    print(f"{len(written)} tiles, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
