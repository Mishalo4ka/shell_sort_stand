import unittest

from shell_sort_stand.benchmark import DEFAULT_GAPS, gaps_for


class GapTests(unittest.TestCase):
    def test_new_sequences(self):
        cases = [
            ("shell", 15, [7, 3, 1]),
            ("knuth", 41, [40, 13, 4, 1]),
            ("9,5,1", 9, [5, 1]),
            ("hibbard", 32, [31, 15, 7, 3, 1]),
            ("sedgewick", 327, [109, 41, 19, 5, 1]),
            ("sedgewick", 326, [41, 19, 5, 1]),
            ("pratt", 32, [16, 12, 9, 8, 6, 4, 3, 2, 1]),
            ("fibonacci", 21, [13, 8, 5, 3, 2, 1]),
        ]
        for name, size, expected in cases:
            with self.subTest(name=name, size=size):
                self.assertEqual(gaps_for(name, size), expected)

    def test_ciura_fixed_gaps(self):
        steps = [1750, 701, 301, 132, 57, 23, 10, 4, 1]
        self.assertEqual(gaps_for("ciura", 1750), steps[1:])
        self.assertEqual(gaps_for("ciura", 1751), steps)
        self.assertEqual(gaps_for("ciura", 10000), steps)

    def test_ciura_extended(self):
        for size in (0, 1, 2, 1750, 1751, 3937):
            self.assertEqual(gaps_for("ciura_extended", size), gaps_for("ciura", size))
        base = gaps_for("ciura", 100000)
        self.assertEqual(gaps_for("ciura_extended", 3938), [3937] + base)
        self.assertEqual(gaps_for("ciura_extended", 100000), [44842, 19930, 8858, 3937] + base)

    def test_small_arrays(self):
        for name in DEFAULT_GAPS:
            with self.subTest(name=name):
                self.assertEqual(gaps_for(name, 0), [])
                self.assertEqual(gaps_for(name, 1), [])
                self.assertEqual(gaps_for(name, 2), [1])
