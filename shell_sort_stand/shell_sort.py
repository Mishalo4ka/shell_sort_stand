def shell_sort(values, gaps):
    for gap in gaps:
        for i in range(gap, len(values)):
            value = values[i]
            j = i
            while j >= gap and values[j - gap] > value:
                values[j] = values[j - gap]
                j -= gap
            values[j] = value
