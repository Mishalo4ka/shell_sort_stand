"use strict";

async function setupComparison(section) {
  const comparison = section.dataset.comparison;
  const plot = section.querySelector("svg");
  const table = section.querySelector("tbody");
  const filters = section.querySelector(".timing-filters");
  const selects = Object.fromEntries(Array.from(filters.querySelectorAll("select"), select => [select.name, select]));
  const names = {
    python: "Python", cpp: "C++",
    m4: "Apple M4", debian: "i7 2677M",
    shell: "Шелла", knuth: "Кнута", ciura: "Циуры", hibbard: "Хиббарда",
    sedgewick: "Седжвика", pratt: "Пратта", fibonacci: "Фибоначчи",
    random: "Случайные", sorted: "По возрастанию", reverse: "По убыванию",
    nearly: "Почти упорядоченные", few: "Много повторов"
  };
  const format = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 });
  const factorFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

  const colors = {
    python: "#244e7d", cpp: "#a34522", shell: "#244e7d", knuth: "#a34522",
    ciura: "#14715e", hibbard: "#785491", sedgewick: "#9a6b0f", pratt: "#434952", fibonacci: "#ab4168"
  };
  const dashed = new Set(["cpp", "knuth", "hibbard", "pratt"]);
  let panels;
  try {
    if (location.protocol === "file:") {
      // Браузеры ограничивают чтение соседних JSON-файлов со страницы на диске.
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.onload = resolve;
        script.onerror = reject;
        script.src = `data/${comparison}-medians.js`;
        document.head.append(script);
      });
      panels = window[`${comparison}ChartPanels`];
    } else {
      const response = await fetch(`data/by-${comparison}.json`);
      if (!response.ok) throw new Error("Ошибка загрузки замеров");
      panels = (await response.json()).panels;
    }
    if (!panels?.length) throw new Error("Нет замеров");
  } catch {
    const message = "Не удалось загрузить данные для графика.";
    section.querySelector("[role=status]").textContent = message;
    if (comparison === "sequence") document.querySelector("#sequence-bars [role=status]").textContent = message;
    return;
  }

  function svgElement(tag, attributes, text) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (text !== undefined) element.textContent = text;
    return element;
  }

  const zoomIn = section.querySelector("[data-zoom=in]");
  const zoomOut = section.querySelector("[data-zoom=out]");
  const reset = section.querySelector("[data-zoom=reset]");
  const level = section.querySelector("output");
  const left = 44, top = 10, bottom = 227, rightMargin = 17;
  const maxZoom = 64;
  const hiddenSeries = new Set();
  let panel;
  let zoom = 1;
  // Смещения — доли полного диапазона от левого и нижнего краёв.
  let offsetX = 0, offsetY = 0;
  let drag;

  function tickStep(span, count) {
    const target = span / count;
    const magnitude = 10 ** Math.floor(Math.log10(target));
    return magnitude * [1, 2, 2.5, 5, 10].find(n => n * magnitude >= target);
  }

  function draw() {
    const width = plot.clientWidth;
    if (!width) return;
    const right = width - rightMargin;
    const points = panel.series.flatMap(line => line.points);
    const low = Math.floor(Math.log10(Math.min(...points.map(p => p.size))));
    const high = Math.max(low + 1, Math.ceil(Math.log10(Math.max(...points.map(p => p.size)))));
    const peak = Math.max(...points.map(p => p.median_ms)) || 1;
    const fullStep = tickStep(peak, 4);
    const ceiling = Math.ceil(peak / fullStep) * fullStep;
    const logMin = low + (high - low) * offsetX;
    const logSpan = (high - low) / zoom;
    const timeMin = ceiling * offsetY;
    const timeSpan = ceiling / zoom;
    const x = n => left + (Math.log10(n) - logMin) / logSpan * (right - left);
    const y = ms => bottom - (ms - timeMin) / timeSpan * (bottom - top);
    plot.setAttribute("viewBox", `0 0 ${width} 260`);
    plot.replaceChildren();
    const step = zoom === 1 ? fullStep : tickStep(timeSpan, 4);
    for (let i = Math.ceil(timeMin / step); i <= Math.floor((timeMin + timeSpan) / step + 1e-10); i++) {
      const value = i * step;
      plot.append(svgElement("line", { x1: left, x2: right, y1: y(value), y2: y(value), stroke: "#d7dbde" }));
      plot.append(svgElement("text", { x: left - 7, y: y(value) + 4, "text-anchor": "end" }, format.format(value)));
    }
    const ticks = [];
    if (logSpan >= 1) {
      for (let power = Math.floor(logMin); power <= Math.ceil(logMin + logSpan); power++) {
        for (const m of logSpan <= 2 ? [1, 2, 5] : [1]) ticks.push(m * 10 ** power);
      }
    } else {
      const min = 10 ** logMin, max = 10 ** (logMin + logSpan);
      const spacing = Math.max(1, tickStep(max - min, 5));
      for (let i = Math.ceil(min / spacing); i <= Math.floor(max / spacing); i++) ticks.push(i * spacing);
    }
    let lastLabelEnd = -Infinity;
    for (const size of ticks) {
      const px = x(size);
      if (px < left - 0.01 || px > right + 0.01) continue;
      const label = format.format(size);
      const labelWidth = label.length * 7;
      const nearEdge = px + labelWidth / 2 > width - 2;
      const labelStart = px - (nearEdge ? labelWidth : labelWidth / 2);
      if (labelStart < lastLabelEnd + 4) continue;
      lastLabelEnd = labelStart + labelWidth;
      plot.append(svgElement("line", { x1: px, x2: px, y1: bottom, y2: bottom + 4, stroke: "#828990" }));
      plot.append(svgElement("text", { x: px, y: bottom + 22, "text-anchor": nearEdge ? "end" : "middle" }, label));
    }
    const clip = svgElement("clipPath", { id: `${plot.id}-clip` });
    clip.append(svgElement("rect", { x: left - 3.5, y: top - 3.5, width: right - left + 7, height: bottom - top + 7 }));
    const lines = svgElement("g", { "clip-path": `url(#${plot.id}-clip)` });
    plot.append(clip, lines);
    const visible = panel.series.filter(line => !hiddenSeries.has(line.label));
    if (visible.length === 0) {
      plot.append(svgElement("text", { x: (left + right) / 2, y: (top + bottom) / 2, "text-anchor": "middle" }, "Выберите последовательность"));
    }
    for (const { label, points } of visible) {
      const ordered = [...points].sort((a, b) => a.size - b.size);
      const color = colors[label];
      lines.append(svgElement("polyline", {
        points: ordered.map(p => `${x(p.size)},${y(p.median_ms)}`).join(" "),
        fill: "none", stroke: color, "stroke-width": 2.5, "stroke-dasharray": dashed.has(label) ? "7 4" : "none"
      }));
      for (const { size, median_ms } of ordered) {
        const mark = svgElement("circle", { cx: x(size), cy: y(median_ms), r: 3.5, fill: dashed.has(label) ? "white" : color, stroke: color });
        mark.append(svgElement("title", {}, `${names[label]} · ${format.format(size)} элементов · ${format.format(median_ms)} мс`));
        lines.append(mark);
      }
    }
    zoomOut.disabled = reset.disabled = zoom === 1;
    zoomIn.disabled = zoom === maxZoom;
    level.textContent = factorFormat.format(zoom) + "×";
    plot.classList.toggle("zoomed", zoom > 1);
  }

  function updateTable() {
    const labels = comparison === "language" ? ["python", "cpp"] : panel.series.map(line => line.label);
    const legend = section.querySelector(".chart-key");
    legend.replaceChildren();
    for (const label of labels) {
      const item = document.createElement("span");
      item.textContent = names[label];
      item.style.setProperty("--line-color", colors[label]);
      item.style.setProperty("--line-style", dashed.has(label) ? "dashed" : "solid");
      if (comparison === "sequence") {
        const control = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = !hiddenSeries.has(label);
        checkbox.onchange = () => {
          if (checkbox.checked) hiddenSeries.delete(label);
          else hiddenSeries.add(label);
          draw();
        };
        control.append(checkbox, item);
        legend.append(control);
      } else {
        legend.append(item);
      }
    }
    if (comparison === "sequence") {
      const header = section.querySelector("thead tr");
      header.replaceChildren();
      for (const title of ["N", ...labels.map(label => names[label] + ", мс")]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = title;
        header.append(th);
      }
    }
    const rows = new Map();
    for (const { label, points } of panel.series) {
      for (const { size, median_ms } of points) {
        if (!rows.has(size)) rows.set(size, {});
        rows.get(size)[label] = median_ms;
      }
    }
    table.replaceChildren();
    for (const [size, times] of [...rows].sort(([a], [b]) => a - b)) {
      const row = table.insertRow();
      for (const value of [size, ...labels.map(label => times[label])]) {
        row.insertCell().textContent = value === undefined ? "—" : format.format(value);
      }
      if (comparison !== "language") continue;
      const speedup = row.insertCell();
      if (Number.isFinite(times.python) && times.cpp > 0) {
        speedup.textContent = factorFormat.format(times.python / times.cpp) + "×";
      } else {
        speedup.textContent = "—";
        speedup.title = "Для расчёта нужны оба замера и положительное время C++.";
      }
    }
  }

  function moveTo(x, y) {
    const limit = 1 - 1 / zoom;
    offsetX = Math.max(0, Math.min(limit, x));
    offsetY = Math.max(0, Math.min(limit, y));
    draw();
  }

  function setZoom(value, anchorX = 0, anchorY = 0) {
    const previous = zoom;
    zoom = Math.min(maxZoom, Math.max(1, value));
    const change = 1 / previous - 1 / zoom;
    moveTo(offsetX + anchorX * change, offsetY + anchorY * change);
  }
  zoomIn.onclick = () => setZoom(zoom * 2);
  zoomOut.onclick = () => setZoom(zoom / 2);
  reset.onclick = () => setZoom(1);
  plot.addEventListener("wheel", event => {
    const rect = plot.getBoundingClientRect();
    const anchorX = (event.clientX - rect.left - left) / (rect.width - left - rightMargin);
    const anchorY = (bottom - (event.clientY - rect.top)) / (bottom - top);
    if (anchorX < 0 || anchorX > 1 || anchorY < 0 || anchorY > 1 || !event.deltaY) return;
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const target = Math.min(maxZoom, Math.max(1, zoom * 2 ** (-delta / 240)));
    if (target === zoom) return;
    event.preventDefault();
    setZoom(target, anchorX, anchorY);
  }, { passive: false });
  plot.addEventListener("pointerdown", event => {
    if (zoom === 1 || event.button !== 0 || !event.isPrimary) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX, offsetY };
    plot.setPointerCapture(event.pointerId);
  });
  plot.addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId) return;
    moveTo(drag.offsetX - (event.clientX - drag.x) / (plot.clientWidth - left - rightMargin) / zoom,
           drag.offsetY + (event.clientY - drag.y) / (bottom - top) / zoom);
  });
  plot.addEventListener("lostpointercapture", () => { drag = undefined; });
  plot.addEventListener("keydown", event => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (!direction || zoom === 1) return;
    event.preventDefault();
    moveTo(offsetX + direction[0] / (4 * zoom), offsetY + direction[1] / (4 * zoom));
  });

  function matchingPanel(selects) {
    let matches = panels;
    for (const [key, select] of Object.entries(selects)) {
      const values = [...new Set(matches.map(panel => panel.filters[key]))];
      const previous = select.value;
      select.replaceChildren(...values.map(value => new Option(names[value] || value, value)));
      if (values.includes(previous)) select.value = previous;
      matches = matches.filter(panel => panel.filters[key] === select.value);
    }
    return matches[0];
  }

  function selectPanel() {
    panel = {
      series: matchingPanel(selects).series.map(line => ({
        ...line, points: line.points.filter(point => point.size !== 10)
      }))
    };
    updateTable();
    setZoom(1);
  }

  function setupBars() {
    const barsSection = document.getElementById("sequence-bars");
    const controls = barsSection.querySelector(".timing-filters");
    const dimensions = Object.fromEntries(Array.from(controls.querySelectorAll("select:not([name=size])"),
      select => [select.name, select]));
    const size = controls.querySelector("[name=size]");
    const bars = barsSection.querySelector(".bars");
    function render() {
      const { series } = matchingPanel(dimensions);
      const sizes = [...new Set(series.flatMap(line => line.points.map(p => p.size)))].filter(n => n !== 10).sort((a, b) => a - b);
      const previous = Number(size.value) || 10000;
      size.replaceChildren(...sizes.map(n => new Option(format.format(n), n)));
      if (sizes.includes(previous)) size.value = previous;
      const samples = series.map(({ label, points }) => ({
        label, time: points.find(p => p.size === Number(size.value))?.median_ms
      }));
      const peak = Math.max(...samples.map(p => p.time ?? 0)) || 1;
      bars.replaceChildren();
      for (const { label, time } of samples) {
        const column = document.createElement("div");
        column.className = "bar-column";
        const caption = document.createElement("span");
        caption.className = "bar-name";
        caption.textContent = names[label];
        const track = document.createElement("div");
        track.className = "bar-track";
        const bar = document.createElement("div");
        bar.className = "bar";
        bar.style.height = ((time ?? 0) / peak * 100) + "%";
        bar.style.backgroundColor = colors[label];
        const value = document.createElement("span");
        value.textContent = time === undefined ? "—" : format.format(time);
        bar.append(value);
        track.append(bar);
        column.append(caption, track);
        bars.append(column);
      }
    }
    controls.hidden = false;
    barsSection.querySelector("figure").hidden = false;
    controls.addEventListener("change", render);
    render();
  }

  if (comparison === "sequence") setupBars();
  filters.hidden = false;
  section.querySelector("figure").hidden = false;
  section.querySelector("details").hidden = false;
  filters.addEventListener("change", selectPanel);
  selectPanel();
  new ResizeObserver(draw).observe(plot);
}

document.querySelectorAll("[data-comparison]").forEach(setupComparison);
