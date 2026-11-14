import json
from pathlib import Path

import numpy as np

import engine
from horizon import flat_horizon
from sites import SITES
from terrain import Terrain

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
N_AZ = 720


def build(terrain=None):
    terrain = terrain or Terrain()
    result = []
    for s in SITES:
        has_terrain = terrain.covers(s["lat"], s["lon"])
        if has_terrain:
            h = engine.horizon(s["lat"], s["lon"], N_AZ)[0]
            height = float(terrain.height(s["lat"], s["lon"]))
        else:
            h = flat_horizon(N_AZ)
            height = 0.0
        result.append({**s, "terrain": has_terrain, "height_m": round(height, 1), "horizon": [round(float(v), 3) for v in h]})
        print(f"{s['name']:28s} terrain={has_terrain!s:5s} horizon {h.min():6.2f} to {h.max():6.2f} deg")
    return result


def main():
    sites = build()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "sites.json").write_text(json.dumps({"azimuthBins": N_AZ, "observerHeightM": 2.0, "sites": sites}))


if __name__ == "__main__":
    main()
