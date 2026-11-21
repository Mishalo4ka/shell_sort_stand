import csv
import hashlib
import io
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from itertools import product
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from shell_sort_stand.benchmark import DEFAULT_GAPS, dataset, gaps_for, run
from shell_sort_stand.shell_sort import shell_sort


class BenchmarkTests(unittest.TestCase):
    def test_sort_matches_reference(self):
        for size in range(6):
            for values in product((-1, 0, 1), repeat=size):
                for name in (*DEFAULT_GAPS, "ciura_extended", "4,1"):
                    work = list(values)
                    shell_sort(work, gaps_for(name, size))
                    self.assertEqual(work, sorted(values), (name, values))

    def test_dataset_shapes(self):
        values = dataset("random", 200, 911)
        self.assertEqual(dataset("random", 200, 911), values)
        self.assertEqual(dataset("sorted", 200, 911), sorted(values))
        self.assertEqual(dataset("reverse", 200, 911), sorted(values, reverse=True))
        self.assertCountEqual(dataset("nearly", 200, 911), values)
        self.assertLessEqual(set(dataset("few", 200, 911)), set(range(8)))

    def test_both_languages_and_csv(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "input.txt"
            source.write_text("0 -2147483648 7 7 2147483647 -1", encoding="utf-8")
            out = Path(temp) / "test.csv"
            cmd = [sys.executable, "-m", "shell_sort_stand.benchmark", "--input", str(source),
                   "--gaps", "ciura", "3,1", "--repeats", "3", "--output", str(out)]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            with out.open(newline="", encoding="utf-8") as file:
                rows = list(csv.DictReader(file))
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            self.assertEqual({r["sha256"] for r in rows}, {digest})
            self.assertEqual(len(rows), 12)
            for name, steps in [("ciura", "4,1"), ("3,1", "3,1")]:
                for lang in ("python", "cpp"):
                    case = [r for r in rows if (r["sequence"], r["language"]) == (name, lang)]
                    self.assertEqual([r["trial"] for r in case], ["1", "2", "3"])
                    self.assertEqual({r["gaps"] for r in case}, {steps})
                    times = sorted(int(r["time_ns"]) for r in case)
                    self.assertGreaterEqual(times[0], 0)
                    self.assertIn(f"{name} | {lang} | {times[1] / 1e6:.6f}", result.stdout)
            first = [(r["sequence"], r["language"]) for r in rows if r["trial"] == "1"]
            last = [(r["sequence"], r["language"]) for r in rows if r["trial"] == "3"]
            self.assertEqual(first, last[::-1])

    def test_interruption_keeps_finished_block(self):
        with tempfile.TemporaryDirectory() as temp:
            args = SimpleNamespace(input=None, sizes=[10], data=["random"], seed=42,
                                   languages=["python"], gaps=["shell", "knuth"], repeats=2,
                                   device="test", output=Path(temp) / "test.csv")
            with patch("shell_sort_stand.benchmark.measure_python",
                       side_effect=[[123], KeyboardInterrupt]), redirect_stdout(io.StringIO()):
                with self.assertRaises(KeyboardInterrupt):
                    run(args, Path(temp))
            with args.output.open(newline="", encoding="utf-8") as file:
                rows = list(csv.DictReader(file))
            self.assertEqual([(r["sequence"], r["time_ns"]) for r in rows], [("shell", "123")])

    def test_duplicate_cases_rejected(self):
        cmd = [sys.executable, "-m", "shell_sort_stand.benchmark", "--gaps", "ciura", "ciura"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("--gaps", result.stderr)
