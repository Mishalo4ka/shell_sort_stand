import argparse
import csv
import hashlib
import os
import platform
import random
import shutil
import statistics
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

if __package__:
    from .shell_sort import shell_sort
else:
    from shell_sort import shell_sort


DATASETS = ("random", "sorted", "reverse", "nearly", "few")
DEFAULT_GAPS = ("shell", "knuth", "ciura", "hibbard", "sedgewick", "pratt", "fibonacci")
CPP_FLAGS = ("-std=c++17", "-O2")


def gaps_for(name, n):
    if name == "shell":
        gap = n // 2
        gaps = []
        while gap:
            gaps.append(gap)
            gap //= 2
        return gaps
    if name in ("knuth", "hibbard"):
        factor = 3 if name == "knuth" else 2
        gaps = []
        gap = 1
        while gap < n:
            gaps.append(gap)
            gap = factor * gap + 1
        return gaps[::-1]
    if name == "sedgewick":
        gaps = [1] if n > 1 else []
        i = 1
        while True:
            if i % 2 == 0:
                gap = 9 * (2**i - 2 ** (i // 2)) + 1
            else:
                gap = 8 * 2**i - 6 * 2 ** ((i + 1) // 2) + 1
            if 3 * gap > n:
                return gaps[::-1]
            gaps.append(gap)
            i += 1
    if name == "pratt":
        gaps = []
        power_of_two = 1
        limit = n // 2
        while power_of_two <= limit:
            gap = power_of_two
            while gap <= limit:
                gaps.append(gap)
                gap *= 3
            power_of_two *= 2
        return sorted(gaps, reverse=True)
    if name == "fibonacci":
        gaps = []
        gap, next_gap = 1, 2
        while gap < n:
            gaps.append(gap)
            gap, next_gap = next_gap, gap + next_gap
        return gaps[::-1]
    if name in ("ciura", "ciura_extended"):
        gaps = [1, 4, 10, 23, 57, 132, 301, 701, 1750]
        if name == "ciura_extended":
            while gaps[-1] < n:
                gaps.append(gaps[-1] * 9 // 4)
        gaps.reverse()
    else:
        try:
            gaps = [int(part) for part in name.split(",")]
        except ValueError:
            raise ValueError(f"Неизвестная последовательность шагов: {name}") from None
        if gaps[-1] != 1 or any(a <= b for a, b in zip(gaps, gaps[1:])):
            raise ValueError("Свои шаги указывайте по убыванию до 1, например 8,4,1.")
    return [gap for gap in gaps if gap < n]


def dataset(kind, n, seed):
    rng = random.Random(seed)
    if kind == "few":
        return [rng.randrange(8) for _ in range(n)]
    values = [rng.randint(-1_000_000, 1_000_000) for _ in range(n)]
    if kind != "random":
        values.sort(reverse=kind == "reverse")
    if kind == "nearly" and n > 1:
        for _ in range(max(1, n // 100)):
            i, j = rng.sample(range(n), 2)
            values[i], values[j] = values[j], values[i]
    return values


def measure_python(values, gaps, repeats):
    expected = sorted(values)
    samples = []
    for trial in range(repeats + 1):
        work = values.copy()
        start = time.perf_counter_ns()
        shell_sort(work, gaps)
        elapsed = time.perf_counter_ns() - start
        if work != expected:
            raise ValueError("Python вернул неверный результат сортировки.")
        if trial:
            samples.append(elapsed)
    return samples


def inputs(args):
    if args.input is not None:
        values = [
            int(token) for token in args.input.read_text(encoding="utf-8").split()
        ]
        if any(v < -(2**31) or v >= 2**31 for v in values):
            raise ValueError("Файл должен содержать целые числа в диапазоне int32.")
        return [(args.input.name, "", values)]
    return (
        (kind, args.seed, dataset(kind, size, args.seed))
        for size in args.sizes for kind in args.data
    )


def build_cpp(binary):
    compiler = os.environ.get("CXX") or shutil.which("c++") or "g++"
    source = Path(__file__).with_name("shell_sort.cpp")
    subprocess.run([compiler, *CPP_FLAGS, source, "-o", binary], check=True)
    return subprocess.check_output([compiler, "--version"], text=True).splitlines()[0]


def measure_cpp(binary, data, size, gaps, repeats):
    steps = " ".join(map(str, gaps))
    header = f"{size} {len(gaps)} {repeats}\n{steps}\n".encode("ascii")
    result = subprocess.check_output([binary], input=header + data)
    samples = [int(token) for token in result.split()]
    if len(samples) != repeats:
        raise ValueError("C++ вернул неверное число замеров.")
    return samples


def measure_dataset(values, args, binary):
    steps = {name: gaps_for(name, len(values)) for name in args.gaps}
    cases = [(name, lang) for name in steps for lang in args.languages]
    # Смена порядка распределяет ранние и поздние замеры между вариантами.
    blocks = [(cases, args.repeats)]
    if len(cases) > 1 and args.repeats > 1:
        half = args.repeats // 2
        blocks = [(cases, args.repeats - half), (cases[::-1], half)]

    data = " ".join(map(str, values)).encode("ascii")
    digest = hashlib.sha256(data).hexdigest()
    offset = 0
    for order, count in blocks:
        for name, lang in order:
            gaps = steps[name]
            if lang == "python":
                samples = measure_python(values, gaps, count)
            else:
                samples = measure_cpp(binary, data, len(values), gaps, count)
            yield name, lang, gaps, digest, offset, samples
        offset += count


def run(args, temp):
    versions = {
        "python": f"{platform.python_implementation()} {platform.python_version()}"
    }
    binary = temp / ("shell-sort.exe" if os.name == "nt" else "shell-sort")
    if "cpp" in args.languages:
        versions["cpp"] = build_cpp(binary)

    stamp = datetime.now(timezone.utc)
    output = args.output or Path("results") / stamp.strftime("%Y%m%dT%H%M%S%fZ.csv")
    output.parent.mkdir(parents=True, exist_ok=True)
    machine = dict(
        utc=stamp.isoformat(),
        device=args.device,
        os=platform.platform(),
        arch=platform.machine(),
    )

    print("Данные | Размер | Шаги | Язык | Медиана, мс", flush=True)
    fields = [
        *machine, "language", "version", "flags", "data", "size", "seed",
        "sha256", "sequence", "gaps", "trial", "time_ns",
    ]
    datasets = inputs(args)
    with output.open("x", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for kind, seed, values in datasets:
            totals = {}
            for name, lang, gaps, digest, offset, samples in measure_dataset(values, args, binary):
                case = dict(
                    **machine,
                    language=lang,
                    version=versions[lang],
                    flags=" ".join(CPP_FLAGS) if lang == "cpp" else "",
                    data=kind,
                    size=len(values),
                    seed=seed,
                    sha256=digest,
                    sequence=name,
                    gaps=",".join(map(str, gaps)),
                )
                for trial, elapsed in enumerate(samples, offset + 1):
                    writer.writerow(dict(**case, trial=trial, time_ns=elapsed))
                file.flush()
                totals.setdefault((name, lang), []).extend(samples)
            for (name, lang), samples in totals.items():
                median_ms = statistics.median(samples) / 1e6
                print(f"{kind} | {len(values)} | {name} | {lang} | {median_ms:.6f}", flush=True)
    print(f"Сохранено в {output}")


def main():
    parser = argparse.ArgumentParser(description="Сравнение сортировки Шелла на Python и C++")
    parser.add_argument(
        "--sizes", nargs="+", type=int, help="размеры массивов (обычно 1000 10000)"
    )
    parser.add_argument(
        "--data", nargs="+", choices=DATASETS, help="виды входных данных"
    )
    parser.add_argument(
        "--input", type=Path, help="текстовый файл с целыми числами вместо генерации"
    )
    parser.add_argument(
        "--gaps",
        nargs="+",
        default=DEFAULT_GAPS,
        help=" ".join((*DEFAULT_GAPS, "ciura_extended")) + " или свои шаги",
    )
    parser.add_argument(
        "--seed", type=int, default=42, help="начальное значение генератора"
    )
    parser.add_argument(
        "--repeats", type=int, default=5, help="число замеров после прогрева"
    )
    parser.add_argument(
        "--languages", nargs="+", choices=("python", "cpp"), default=("python", "cpp")
    )
    parser.add_argument(
        "--device",
        default=platform.node() or platform.machine(),
        help="метка устройства",
    )
    parser.add_argument("--output", type=Path, help="путь для нового CSV")
    args = parser.parse_args()
    if args.input is not None and (args.sizes or args.data):
        parser.error("--input используется вместо --sizes и --data")
    args.sizes = args.sizes or [1000, 10000]
    args.data = args.data or DATASETS
    for option in ("sizes", "data", "gaps", "languages"):
        values = getattr(args, option)
        if len(set(values)) != len(values):
            parser.error(f"--{option}: значения должны быть уникальными")
    if min(args.sizes) < 0 or args.repeats < 1:
        parser.error(
            "размер должен быть неотрицательным, число повторов — положительным"
        )
    try:
        if args.output and args.output.exists():
            raise FileExistsError(f"Файл уже существует: {args.output}")
        for name in args.gaps:
            gaps_for(name, 0)
        with tempfile.TemporaryDirectory() as temp:
            run(args, Path(temp))
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Ошибка: {error}\n")


if __name__ == "__main__":
    main()
