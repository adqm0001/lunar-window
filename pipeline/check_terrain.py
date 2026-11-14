import numpy as np

from geo import destination
from terrain import Terrain

SHACKLETON = (-89.67, 129.78)
SHACKLETON_RIM_RADIUS_M = 10500


def main():
    terrain = Terrain()
    lat, lon = SHACKLETON
    floor = float(terrain.height(lat, lon))
    rim_lat, rim_lon = destination(lat, lon, np.arange(0, 360, 5), SHACKLETON_RIM_RADIUS_M)
    rim = terrain.height(rim_lat, rim_lon)
    depth = float(np.mean(rim)) - floor
    print(f"Shackleton floor  {floor:8.0f} m")
    print(f"Shackleton rim    {np.mean(rim):8.0f} m (mean of {rim.size} points)")
    print(f"depth             {depth:8.0f} m  (published: ~4200 m)")
    assert 3500 < depth < 4800, "projection or orientation is wrong"
    print("terrain check passed")


if __name__ == "__main__":
    main()
