"""Small builder regressions: python -m unittest discover -s pipeline -p 'test_*.py'."""

import unittest

import numpy as np

import build_site_field as field
from terrain import to_map


class SiteFieldTests(unittest.TestCase):
    def test_grid_extent_spacing_and_row_order(self):
        n, x, y = field.site_grid(field.CELL_M)
        cx, cy = field.field_center()
        self.assertEqual(n, 250)
        self.assertEqual(x.shape, (250, 250))
        np.testing.assert_array_equal(np.diff(x, axis=1), 20)
        np.testing.assert_array_equal(np.diff(y, axis=0), -20)
        self.assertEqual(x[0, 0], cx - 2490)
        self.assertEqual(y[0, 0], cy + 2490)
        self.assertEqual(x[-1, -1], cx + 2490)
        self.assertEqual(y[-1, -1], cy - 2490)
        sx, sy = to_map(field.SITE["lat"], field.SITE["lon"])
        self.assertLess(np.hypot(cx - sx, cy - sy), 5)

    def test_delta_wrap_layer_order_and_clamping(self):
        # Adjacent layers exercise both negative and positive byte wrapping.
        q = np.tile([0, 255, 1, 254, 128, 2], 30).reshape(1, 1, 180)
        q = np.broadcast_to(q, (2, 2, 180)).copy()
        q[1, 0, 4] = 42  # catches row/column/azimuth transposition
        h = (q * 0.1 - 8).reshape(4, 180)
        h[0, 0], h[0, 1] = -90, 90
        raw = np.frombuffer(field.encode_horizons(h, 2), dtype=np.uint8).reshape(180, 2, 2)
        decoded = np.cumsum(raw, axis=0) % 256
        np.testing.assert_array_equal(decoded, q.transpose(2, 0, 1))

    def test_nonfinite_and_wrong_shape_horizons_rejected(self):
        for h in (np.zeros((4, 179)), np.full((4, 180), np.nan), np.full((4, 180), np.inf)):
            with self.assertRaises(ValueError):
                field.encode_horizons(h, 2)

    def test_flat_ground_is_safe(self):
        slope = field.slope_layers(np.full((8, 8), 1700.0))
        np.testing.assert_array_equal(slope[0], np.zeros((2, 2)))
        np.testing.assert_array_equal(slope[1], np.full((2, 2), 100))

    def test_plane_slope_units_and_safe_threshold(self):
        r, c = np.mgrid[:8, :8] * field.SLOPE_SAMPLE_M
        for z in (0.5 * r, 0.5 * c):
            slope = field.slope_layers(z)
            # arctan(0.5) = 26.565 degrees, quantized at 0.25 degrees.
            np.testing.assert_array_equal(slope[0], np.full((2, 2), 106))
            np.testing.assert_array_equal(slope[1], np.zeros((2, 2)))
        gentle = field.slope_layers(0.1 * c)
        np.testing.assert_array_equal(gentle[0], np.full((2, 2), 23))
        np.testing.assert_array_equal(gentle[1], np.full((2, 2), 100))


if __name__ == "__main__":
    unittest.main()
