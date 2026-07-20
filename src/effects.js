const GLUE_TOKEN = /^[ぁ-ん]{1,2}$/;
const PUNCTUATION = /^[、。・「」『』（）…―ー\s]+$/;
const CELL = 28;

// シーン(.scene)ごとの空(=海)の色調。上端色→下端色のグラデーションと、
// 波の光を表す差し色(accent)を持つ。物語の時間経過を、写真を使わず色だけで表す。
const PALETTES = {
  "pre-dawn": { sky: [[16, 20, 32], [46, 46, 54]], accent: [150, 158, 168] },
  dawn: { sky: [[26, 32, 46], [120, 96, 70]], accent: [224, 188, 132] },
  day: { sky: [[46, 78, 92], [196, 206, 190]], accent: [244, 232, 200] },
  storm: { sky: [[18, 22, 28], [52, 64, 68]], accent: [176, 156, 120] },
  night: { sky: [[6, 10, 18], [20, 28, 40]], accent: [132, 150, 160] },
  dawn2: { sky: [[34, 40, 52], [158, 146, 124]], accent: [230, 202, 156] },
  dusk: { sky: [[32, 22, 30], [176, 108, 72]], accent: [246, 178, 118] },
  night2: { sky: [[5, 8, 14], [16, 22, 32]], accent: [158, 168, 168] }
};

export function createSeaEffects() {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const sky = document.createElement("div");
  sky.id = "sea-sky";
  sky.setAttribute("aria-hidden", "true");
  document.body.prepend(sky);

  const progress = document.createElement("div");
  progress.id = "sea-progress";
  progress.setAttribute("aria-hidden", "true");
  progress.innerHTML = "<span></span>";
  document.body.appendChild(progress);
  const progressFill = progress.firstElementChild;

  let scenes = [];

  function measureScenes() {
    scenes = [...document.querySelectorAll(".scene")].map((el) => ({
      top: el.getBoundingClientRect().top + scrollY,
      palette: PALETTES[el.dataset.palette] || PALETTES.day
    }));
  }

  function currentPalette() {
    if (!scenes.length) return PALETTES.day;
    const y = scrollY + innerHeight * 0.4;
    let i = 0;
    while (i < scenes.length - 1 && scenes[i + 1].top <= y) i += 1;
    const a = scenes[i];
    const b = scenes[Math.min(i + 1, scenes.length - 1)];
    const span = b.top - a.top;
    const t = span > 0 ? Math.max(0, Math.min(1, (y - a.top) / span)) : 0;
    const lerp = (p, q) => p + (q - p) * t;
    return {
      sky: [0, 1].map((k) => a.palette.sky[k].map((c, idx) => lerp(c, b.palette.sky[k][idx]))),
      accent: a.palette.accent.map((c, idx) => lerp(c, b.palette.accent[idx]))
    };
  }

  function paintSky() {
    const { sky: [top, bottom], accent } = currentPalette();
    sky.style.background = `linear-gradient(to bottom, rgb(${top.map(Math.round)}) 0%, rgb(${bottom.map(Math.round)}) 100%)`;
    progressFill.style.background = `rgb(${accent.map(Math.round)})`;
    const docHeight = document.documentElement.scrollHeight - innerHeight;
    const frac = docHeight > 0 ? Math.max(0, Math.min(1, scrollY / docHeight)) : 0;
    progressFill.style.width = `${frac * 100}%`;
    return accent;
  }

  addEventListener("resize", measureScenes, { passive: true });
  if (document.fonts?.ready) document.fonts.ready.then(measureScenes);
  measureScenes();
  paintSky();

  if (reducedMotion) {
    addEventListener("scroll", paintSky, { passive: true });
    return { destroy() { sky.remove(); progress.remove(); } };
  }

  const canvas = document.createElement("canvas");
  canvas.id = "sea-layer";
  canvas.setAttribute("aria-hidden", "true");
  sky.after(canvas);
  const output = canvas.getContext("2d");
  const segmenter = "Segmenter" in Intl ? new Intl.Segmenter("ja", { granularity: "word" }) : null;

  let width = 0;
  let height = 0;
  let ratio = 1;
  let cols = 0;
  let rows = 0;
  let u = null;
  let v = null;
  let u0 = null;
  let v0 = null;
  let fluidImage = null;
  const fluidCanvas = document.createElement("canvas");
  const fluidContext = fluidCanvas.getContext("2d");

  let lastFrame = performance.now();
  let raf = 0;
  let pointer = null;
  let lastScroll = scrollY;
  let lastScrollTime = performance.now();
  let lastAccent = [220, 200, 160];
  const wakes = [];
  const particles = [];

  function resize() {
    ratio = Math.min(devicePixelRatio || 1, 1.5);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    cols = Math.ceil(width / CELL) + 2;
    rows = Math.ceil(height / CELL) + 2;
    u = new Float32Array(cols * rows);
    v = new Float32Array(cols * rows);
    u0 = new Float32Array(cols * rows);
    v0 = new Float32Array(cols * rows);
    fluidCanvas.width = cols;
    fluidCanvas.height = rows;
    fluidImage = fluidContext.createImageData(cols, rows);
    measureScenes();
    measureParticles();
  }

  function measureParticles() {
    for (const particle of particles) {
      const rect = particle.element.getBoundingClientRect();
      particle.docTop = rect.top + scrollY;
      particle.anchorX = rect.left + rect.width / 2;
    }
  }

  function escapeHtml(text) {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function splitPhrases(text) {
    if (!segmenter) return text.match(/.{1,4}/g) || [];
    const phrases = [];
    for (const { segment } of segmenter.segment(text)) {
      const previous = phrases[phrases.length - 1];
      const glue = previous && (PUNCTUATION.test(segment) ||
        (GLUE_TOKEN.test(segment) && !PUNCTUATION.test(previous.slice(-1))));
      if (glue) phrases[phrases.length - 1] += segment;
      else phrases.push(segment);
    }
    return phrases;
  }

  function sceneSwell(el) {
    const scene = el.closest(".scene");
    return scene ? parseFloat(scene.dataset.swell) || 0.2 : 0.2;
  }

  function segmentText() {
    for (const block of document.querySelectorAll("[data-effect-text]")) {
      const swell = sceneSwell(block);
      block.innerHTML = splitPhrases(block.textContent)
        .map((phrase) => `<span class="wave-seg">${escapeHtml(phrase)}</span>`).join("");
      for (const el of block.querySelectorAll(".wave-seg")) {
        particles.push({
          element: el, docTop: 0, anchorX: 0,
          x: 0, y: 0, vx: 0, vy: 0,
          mass: 0.75 + Math.random() * 0.5, swell,
          loose: false, heading: 0, phase: Math.random() * Math.PI * 2
        });
      }
    }
    measureParticles();
  }

  function splat(x, y, velX, velY) {
    const cx = x / CELL + 0.5;
    const cy = y / CELL + 0.5;
    const radius = 2.4;
    for (let j = Math.max(1, Math.floor(cy - 3)); j <= Math.min(rows - 2, Math.ceil(cy + 3)); j += 1) {
      for (let i = Math.max(1, Math.floor(cx - 3)); i <= Math.min(cols - 2, Math.ceil(cx + 3)); i += 1) {
        const fall = Math.exp(-((i - cx) ** 2 + (j - cy) ** 2) / (radius * radius));
        const index = j * cols + i;
        u[index] = Math.max(-260, Math.min(260, u[index] + velX * fall));
        v[index] = Math.max(-260, Math.min(260, v[index] + velY * fall));
      }
    }
  }

  function stepFluid(deltaTime) {
    for (let pass = 0; pass < 2; pass += 1) {
      u0.set(u);
      v0.set(v);
      for (let j = 1; j < rows - 1; j += 1) {
        for (let i = 1; i < cols - 1; i += 1) {
          const index = j * cols + i;
          const averageU = (u0[index - 1] + u0[index + 1] + u0[index - cols] + u0[index + cols]) * 0.25;
          const averageV = (v0[index - 1] + v0[index + 1] + v0[index - cols] + v0[index + cols]) * 0.25;
          u[index] += (averageU - u0[index]) * 0.5;
          v[index] += (averageV - v0[index]) * 0.5;
        }
      }
    }
    u0.set(u);
    v0.set(v);
    const decay = Math.exp(-1.1 * deltaTime);
    for (let j = 1; j < rows - 1; j += 1) {
      for (let i = 1; i < cols - 1; i += 1) {
        const index = j * cols + i;
        const backX = i - u0[index] * deltaTime / CELL;
        const backY = j - v0[index] * deltaTime / CELL;
        u[index] = sampleField(u0, backX, backY) * decay;
        v[index] = sampleField(v0, backX, backY) * decay;
      }
    }
  }

  function sampleField(field, x, y) {
    const cx = Math.max(0, Math.min(cols - 1.001, x));
    const cy = Math.max(0, Math.min(rows - 1.001, y));
    const i = Math.floor(cx);
    const j = Math.floor(cy);
    const fx = cx - i;
    const fy = cy - j;
    const index = j * cols + i;
    return (field[index] * (1 - fx) + field[index + 1] * fx) * (1 - fy)
      + (field[index + cols] * (1 - fx) + field[index + cols + 1] * fx) * fy;
  }

  function fluidVelocityAt(x, y) {
    return [sampleField(u, x / CELL + 0.5, y / CELL + 0.5), sampleField(v, x / CELL + 0.5, y / CELL + 0.5)];
  }

  function renderShimmer() {
    const [r, g, b] = lastAccent;
    const data = fluidImage.data;
    let active = false;
    for (let index = 0; index < cols * rows; index += 1) {
      const speed = Math.hypot(u[index], v[index]);
      const t = Math.min(1, speed / 70);
      const eased = t * t * (3 - 2 * t);
      const alpha = eased * 0.16;
      if (alpha > 0.004) active = true;
      data[index * 4] = r;
      data[index * 4 + 1] = g;
      data[index * 4 + 2] = b;
      data[index * 4 + 3] = alpha * 255;
    }
    if (!active) return;
    fluidContext.putImageData(fluidImage, 0, 0);
    output.globalCompositeOperation = "lighter";
    output.imageSmoothingEnabled = true;
    output.drawImage(fluidCanvas, -CELL, -CELL, cols * CELL, rows * CELL);
    output.globalCompositeOperation = "source-over";
  }

  function addWake(y, velX, velY, radius = 220, life = 1) {
    wakes.push({ y, vx: velX, vy: velY, radius, life, age: 0 });
    if (wakes.length > 8) wakes.shift();
  }

  function updateParticles(deltaTime) {
    for (const particle of particles) {
      const viewY = particle.docTop - scrollY;
      if (viewY < -160 || viewY > height + 160) continue;
      let forceX = 0;
      let forceY = 0;
      for (const wake of wakes) {
        const distance = (viewY - wake.y) / wake.radius;
        const influence = Math.exp(-distance * distance * 2.2) * Math.max(0, 1 - wake.age / wake.life);
        forceX += wake.vx * influence;
        forceY += wake.vy * influence;
      }
      const fluid = fluidVelocityAt(particle.anchorX + particle.x, viewY + particle.y);
      const gain = 0.35 + particle.swell * 1.5;
      const springK = particle.loose ? 0 : 52;
      particle.vx += ((forceX * gain + fluid[0] * gain * 5.5) * particle.mass - springK * particle.x) * deltaTime;
      particle.vy += ((forceY * gain + fluid[1] * gain * 5.5) * particle.mass - springK * particle.y) * deltaTime;

      if (particle.loose) {
        // 復元力を失った文節は、自ら緩やかに漂流を続ける（波や操作の影響は受け続ける）
        particle.phase += deltaTime * (0.5 + particle.mass * 0.35);
        particle.heading += (Math.sin(particle.phase) * 0.5 + (Math.random() - 0.5) * 0.6) * deltaTime;
        const thrust = (9 + particle.mass * 7) * deltaTime;
        particle.vx += Math.cos(particle.heading) * thrust;
        particle.vy += Math.sin(particle.heading) * thrust * 0.6;

        const screenX = particle.anchorX + particle.x;
        const screenY = viewY + particle.y;
        const marginX = 26;
        const marginY = 26;
        const pushX = screenX < marginX ? marginX - screenX : screenX > width - marginX ? width - marginX - screenX : 0;
        const pushY = screenY < marginY ? marginY - screenY : screenY > height - marginY ? height - marginY - screenY : 0;
        if (pushX || pushY) {
          particle.vx += Math.max(-140, Math.min(140, pushX)) * 3 * deltaTime;
          particle.vy += Math.max(-140, Math.min(140, pushY)) * 3 * deltaTime;
        }
      }

      const damping = Math.exp(-(particle.loose ? 2.4 : 5.4) * deltaTime);
      particle.vx *= damping;
      particle.vy *= damping;
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;

      const offset = Math.hypot(particle.x, particle.y);
      if (!particle.loose) {
        const maxOffset = 4 + particle.swell * 20;
        if (offset > maxOffset) {
          particle.loose = true;
          particle.heading = Math.atan2(particle.vy, particle.vx || 0.001);
          particle.phase = Math.random() * Math.PI * 2;
        }
      }
      if (offset < 0.3 && !particle.element.style.transform) continue;
      const tilt = Math.max(-2.5, Math.min(2.5, particle.vx * 0.03));
      particle.element.style.transform = offset < 0.3
        ? "" : `translate(${particle.x.toFixed(1)}px,${particle.y.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg)`;
    }
  }

  function draw(now) {
    const deltaTime = Math.min(0.034, Math.max(0.008, (now - lastFrame) / 1000));
    lastFrame = now;
    for (const wake of wakes) wake.age += deltaTime;
    while (wakes.length && wakes[0].age >= wakes[0].life) wakes.shift();
    stepFluid(deltaTime);
    updateParticles(deltaTime);
    lastAccent = paintSky();

    output.setTransform(1, 0, 0, 1, 0, 0);
    output.clearRect(0, 0, canvas.width, canvas.height);
    output.save();
    output.scale(ratio, ratio);
    renderShimmer();
    output.restore();
    raf = requestAnimationFrame(draw);
  }

  function onScroll() {
    const now = performance.now();
    const delta = scrollY - lastScroll;
    const elapsed = Math.max(16, now - lastScrollTime);
    const speed = Math.min(1, Math.abs(delta) / elapsed / 2.4);
    if (Math.abs(delta) > 1) {
      addWake(height * (0.4 + Math.random() * 0.16), (Math.random() < 0.5 ? 1 : -1) * speed * 8, -Math.sign(delta) * speed * 46, 240, 0.9);
    }
    lastScroll = scrollY;
    lastScrollTime = now;
  }

  function onPointerMove(event) {
    if (!pointer) { pointer = { x: event.clientX, y: event.clientY }; return; }
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer = { x: event.clientX, y: event.clientY };
    if (!dx && !dy) return;
    splat(event.clientX, event.clientY, dx * 16, dy * 16);
  }

  function onClick(event) {
    if (event.target.closest("a")) return;
    addWake(event.clientY, 0, 26, 160, 1.1);
    splat(event.clientX, event.clientY, 0, 80);
  }

  addEventListener("resize", resize, { passive: true });
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("pointermove", onPointerMove, { passive: true });
  addEventListener("click", onClick, { passive: true });
  if (document.fonts?.ready) document.fonts.ready.then(measureParticles);

  resize();
  segmentText();
  raf = requestAnimationFrame(draw);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      canvas.remove();
      sky.remove();
      progress.remove();
    }
  };
}
