import unittest

import numpy as np

import engine
from geo import destination
from terrain import R_MOON, Terrain, to_latlon, to_map


class PolarProjectionTests(unittest.TestCase):
    def test_cardinal_directions_at_north(self):
        x, y = to_map(89, [0, 90, 180, -90], "north")
        radius = 2 * R_MOON * np.tan(np.radians(0.5))
        np.testing.assert_allclose(x, [0, radius, 0, -radius], atol=1e-9)
        np.testing.assert_allclose(y, [-radius, 0, radius, 0], atol=1e-9)

    def test_north_is_reflected_south_map(self):
        lat = np.array([85, 87, 89, 89.99])
        lon = np.array([-170, 90, 0, 179])
        nx, ny = to_map(lat, lon, "north")
        sx, sy = to_map(-lat, lon)
        np.testing.assert_array_equal(nx, sx)
        np.testing.assert_array_equal(ny, -sy)

    def test_roundtrip_across_longitude_seam(self):
        for hemisphere, sign in (("north", 1), ("south", -1)):
            lat, lon = np.meshgrid(sign * np.array([75, 85, 89, 89.999]), [-180, -90, -0.1, 0, 90, 179.999])
            x, y = to_map(lat, lon, hemisphere)
            actual_lat, actual_lon = to_latlon(x, y, hemisphere)
            np.testing.assert_allclose(actual_lat, lat, atol=1e-10)
            np.testing.assert_allclose((actual_lon - lon + 180) % 360 - 180, 0, atol=1e-10)

    def test_poles_are_origins(self):
        for hemisphere, lat in (("north", 90), ("south", -90)):
            x, y = to_map(lat, 0, hemisphere)
            self.assertEqual(x, 0)
            self.assertEqual(y, 0)
            self.assertEqual(to_latlon(0, 0, hemisphere)[0], lat)

    def test_south_default_matches_original_formula_exactly(self):
        lat = np.linspace(-90, -75, 101)
        lon = np.linspace(-180, 180, 101)
        k = 2 * R_MOON * np.tan(np.pi / 4 + np.radians(lat) / 2)
        expected = (k * np.sin(np.radians(lon)), k * np.cos(np.radians(lon)))
        for actual in (to_map(lat, lon), to_map(lat, lon, "south")):
            np.testing.assert_array_equal(actual, expected)

    def test_geodesic_destinations_work_on_both_sides_of_pole(self):
        # Great-circle geo.py operates in lat/lon and needs no hemisphere flag.
        for hemisphere, sign in (("north", 1), ("south", -1)):
            lat, lon = destination(sign * 89.9, 170, np.arange(0, 360, 45), 2000)
            x, y = to_map(lat, lon, hemisphere)
            p, l = to_latlon(x, y, hemisphere)
            np.testing.assert_allclose(p, lat, atol=1e-10)
            np.testing.assert_allclose((l - lon + 180) % 360 - 180, 0, atol=1e-10)
            u = np.stack([np.cos(np.radians(lat)) * np.cos(np.radians(lon)),
                          np.cos(np.radians(lat)) * np.sin(np.radians(lon)),
                          np.sin(np.radians(lat))], axis=-1)
            start = np.array([np.cos(np.radians(sign * 89.9)) * np.cos(np.radians(170)),
                              np.cos(np.radians(sign * 89.9)) * np.sin(np.radians(170)),
                              np.sin(np.radians(sign * 89.9))])
            np.testing.assert_allclose(np.arccos(np.clip(u @ start, -1, 1)) * R_MOON, 2000, atol=1e-5)

    def test_invalid_hemisphere_is_rejected_before_loading_or_compiling(self):
        for run in (lambda: to_map(89, 0, "typo"), lambda: to_latlon(0, 0, "typo"),
                    lambda: Terrain("typo"), lambda: engine.horizon(89, 0, 180, hemisphere="typo")):
            with self.assertRaises(ValueError):
                run()


if __name__ == "__main__":
    unittest.main()
