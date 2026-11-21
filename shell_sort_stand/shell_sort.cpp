#include <algorithm>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <vector>

void shell_sort(std::vector<std::int32_t> &values,
                const std::vector<std::size_t> &gaps) {
    for (auto gap : gaps) {
        for (auto i = gap; i < values.size(); ++i) {
            auto value = values[i];
            auto j = i;
            while (j >= gap && values[j - gap] > value) {
                values[j] = values[j - gap];
                j -= gap;
            }
            values[j] = value;
        }
    }
}

int main() {
    std::size_t size, count, repeats;
    if (!(std::cin >> size >> count >> repeats))
        return 1;
    std::vector<std::size_t> gaps(count);
    for (auto &gap : gaps) {
        if (!(std::cin >> gap) || gap == 0)
            return 1;
    }
    std::vector<std::int32_t> data(size);
    for (auto &value : data) {
        if (!(std::cin >> value))
            return 1;
    }
    auto expected = data;
    std::sort(expected.begin(), expected.end());
    for (std::size_t trial = 0; trial <= repeats; ++trial) {
        auto work = data;
        auto start = std::chrono::steady_clock::now();
        shell_sort(work, gaps);
        auto elapsed = std::chrono::steady_clock::now() - start;
        if (work != expected) {
            std::cerr << "C++ sort verification failed\n";
            return 1;
        }
        if (trial)
            std::cout << std::chrono::duration_cast<std::chrono::nanoseconds>(
                             elapsed)
                             .count()
                      << '\n';
    }
}
