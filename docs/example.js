"use strict";

const values = [8, 3, 6, 1, 4, 7, 2, 5];
const frames = [];

for (const gap of [4, 2, 1]) {
  for (let i = gap; i < values.length; i++) {
    for (let right = i; right >= gap; right -= gap) {
      const left = right - gap;
      const before = values.slice();
      const swap = values[left] > values[right];
      if (swap) {
        [values[left], values[right]] = [values[right], values[left]];
      }
      frames.push({ gap, left, right, before, after: values.slice() });
      if (!swap) break;
    }
  }
}
console.assert(values.every((value, i) => value === i + 1), "Ошибка сортировки примера");

const diagram = document.getElementById("array");
const reset = document.getElementById("reset");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
let current = 0;

function show(index) {
  current = index;
  const { gap, left, right, before, after } = frames[index];
  diagram.replaceChildren();
  for (const [label, numbers] of [["До", before], ["После", after]]) {
    const row = document.createElement("div");
    row.className = "row";
    const heading = document.createElement("small");
    heading.textContent = label;
    row.append(heading);
    numbers.forEach((value, i) => {
      const cell = document.createElement("span");
      cell.textContent = value;
      if (i === left || i === right) cell.className = "active";
      row.append(cell);
    });
    diagram.append(row);
  }
  const a = before[left];
  const b = before[right];
  const result = a > b
    ? `${a} > ${b} — меняем числа местами.`
    : `${a} ≤ ${b} — оставляем числа на месте.`;
  document.getElementById("explanation").textContent = `Позиции ${left + 1} и ${right + 1}. ${result}`;
  document.getElementById("gap").textContent = gap;
  document.getElementById("progress").textContent = `Сравнение ${index + 1} из ${frames.length}`;
  prev.disabled = index === 0;
  reset.disabled = index === 0;
  next.disabled = index === frames.length - 1;
}
reset.onclick = () => show(0);
prev.onclick = () => show(current - 1);
next.onclick = () => show(current + 1);
show(0);
document.getElementById("demo").hidden = false;
