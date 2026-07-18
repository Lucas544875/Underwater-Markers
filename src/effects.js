const GLUE_TOKEN = /^[ぁ-ん]{1,2}$/;
const PUNCTUATION = /^[、。・「」『』（）…―ー\s]+$/;

export function createHorrorEffects({ getState, save }) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.createElement("canvas");
  canvas.id = "horror-layer";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  const output = canvas.getContext("2d");
  const segmenter = "Segmenter" in Intl ? new Intl.Segmenter("ja", { granularity: "word" }) : null;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let depth = 0;
  let lastScroll = scrollY;
  let lastScrollTime = performance.now();
  let lastFrame = performance.now();
  let raf = 0;
  let saveTimer = 0;
  let pointer = null;
  const wakes = [];
  const particles = [];

  const CELL = 24;
  const fluidCanvas = document.createElement("canvas");
  const fluidContext = fluidCanvas.getContext("2d");
  let cols = 0;
  let rows = 0;
  let u = null;
  let v = null;
  let u0 = null;
  let v0 = null;
  let fluidImage = null;

  function resize() {
    ratio = Math.min(devicePixelRatio || 1, 1.25);
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
    measureParticles();
  }

  function syncVariables() {
    const state = getState();
    const normalizedDepth = (depth - 1) / 6;
    const integrity = reducedMotion ? 1 : Math.max(.26, 1 - normalizedDepth * .58 - state.damage * .26);
    document.documentElement.style.setProperty("--document-integrity", integrity.toFixed(3));
    document.documentElement.style.setProperty("--effect-depth", normalizedDepth.toFixed(3));
    document.documentElement.style.setProperty("--damage", state.damage.toFixed(3));
  }

  function addDamage(amount) {
    const state = getState();
    // 補遺1・起源調査（文書4）は最も正確な文書であり、溺死則により劣化が最も速い
    state.damage = Math.min(1, state.damage + amount * (depth === 4 ? 1.6 : 1));
    state.interactions += 1;
    syncVariables();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 180);
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

  function segmentArticle() {
    particles.length = 0;
    if (reducedMotion) return;
    for (const root of document.querySelectorAll("[data-effect-text]")) {
      // 浮力則（.line-buoyant）と溺没済みの文（.line-drowned）は水面に反応しない
      const blocks = root.matches("p,h1") ? [root] : [...root.querySelectorAll("p:not(.line-buoyant):not(.line-drowned)")];
      for (const block of blocks) {
        if (!block.dataset.segmented) {
          block.innerHTML = splitPhrases(block.textContent)
            .map((phrase) => `<span class="wave-seg">${escapeHtml(phrase)}</span>`).join("");
          block.dataset.segmented = "1";
        }
        for (const element of block.querySelectorAll(".wave-seg")) {
          particles.push({
            element, docTop: 0, anchorX: 0,
            x: 0, y: 0, vx: 0, vy: 0,
            mass: .7 + Math.random() * .6,
            fade: 1, cap: 1, loose: false,
            heading: Math.random() * Math.PI * 2,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
    }
    measureParticles();
  }

  function measureParticles() {
    for (const particle of particles) {
      const rect = particle.element.getBoundingClientRect();
      particle.docTop = rect.top + scrollY;
      particle.anchorX = rect.left + rect.width / 2;
    }
  }

  function splat(x, y, velX, velY) {
    if (!u || reducedMotion) return;
    const cx = x / CELL + .5;
    const cy = y / CELL + .5;
    const radius = 2.2;
    for (let j = Math.max(1, Math.floor(cy - 3)); j <= Math.min(rows - 2, Math.ceil(cy + 3)); j += 1) {
      for (let i = Math.max(1, Math.floor(cx - 3)); i <= Math.min(cols - 2, Math.ceil(cx + 3)); i += 1) {
        const fall = Math.exp(-((i - cx) ** 2 + (j - cy) ** 2) / (radius * radius));
        const index = j * cols + i;
        u[index] = Math.max(-150, Math.min(150, u[index] + velX * fall));
        v[index] = Math.max(-150, Math.min(150, v[index] + velY * fall));
      }
    }
  }

  function stepFluid(deltaTime) {
    if (!u) return;
    for (let pass = 0; pass < 2; pass += 1) {
      u0.set(u);
      v0.set(v);
      for (let j = 1; j < rows - 1; j += 1) {
        for (let i = 1; i < cols - 1; i += 1) {
          const index = j * cols + i;
          const averageU = (u0[index - 1] + u0[index + 1] + u0[index - cols] + u0[index + cols]) * .25;
          const averageV = (v0[index - 1] + v0[index + 1] + v0[index - cols] + v0[index + cols]) * .25;
          u[index] += (averageU - u0[index]) * .5;
          v[index] += (averageV - v0[index]) * .5;
        }
      }
    }
    u0.set(u);
    v0.set(v);
    const decay = Math.exp(-1.5 * deltaTime);
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
    if (!u) return [0, 0];
    return [sampleField(u, x / CELL + .5, y / CELL + .5), sampleField(v, x / CELL + .5, y / CELL + .5)];
  }

  function renderFluid() {
    if (!fluidImage) return;
    const visibility = .5 + ((depth - 1) / 6) * .5;
    // 深い記事ほど、操作の乱れが校閲の赤（赤入れ）を帯びる
    const redshift = Math.max(0, Math.min(1, (depth - 3) / 4));
    const data = fluidImage.data;
    let active = false;
    for (let index = 0; index < cols * rows; index += 1) {
      const speed = Math.hypot(u[index], v[index]);
      const t = Math.min(1, speed / 130);
      const eased = t * t * (3 - 2 * t);
      const alpha = eased * .34 * visibility;
      if (alpha > .004) active = true;
      data[index * 4] = 12 + eased * (150 + redshift * 68);
      data[index * 4 + 1] = 34 + eased * (148 - redshift * 96);
      data[index * 4 + 2] = 32 + eased * (142 - redshift * 88);
      data[index * 4 + 3] = alpha * 255;
    }
    if (!active) return;
    fluidContext.putImageData(fluidImage, 0, 0);
    output.imageSmoothingEnabled = true;
    output.drawImage(fluidCanvas, -CELL, -CELL, cols * CELL, rows * CELL);
  }

  function addWake(y, vx, vy, radius = 180, life = 1) {
    wakes.push({ y, vx, vy, radius, life, age: 0 });
    if (wakes.length > 10) wakes.shift();
  }

  function sweep(particle, directionX, directionY) {
    particle.loose = true;
    particle.cap = Math.max(.28, particle.cap * .6);
    particle.heading = Math.atan2(directionY, directionX) + (Math.random() - .5) * .8;
    particle.vx += directionX * (14 + Math.random() * 20);
    particle.vy += directionY * (30 + Math.random() * 42);
    addDamage(.0008 + ((depth - 1) / 6) * .0012);
  }

  function updateParticles(deltaTime) {
    if (!particles.length) return;
    const state = getState();
    const normalizedDepth = (depth - 1) / 6;
    const springK = 40 - normalizedDepth * 31 - state.damage * 4;
    const damping = Math.exp(-(6 - normalizedDepth * 3.2) * deltaTime);
    const gain = (.12 + normalizedDepth * .95) * 8;
    const fluidGain = gain * 1.1 + 1.8;
    const sweepLimit = depth >= 4 ? 92 - normalizedDepth * 40 : Infinity;
    const fadeFloor = Math.max(.1, .58 - normalizedDepth * .48);
    for (const particle of particles) {
      const viewY = particle.docTop - scrollY;
      if (!particle.loose && (viewY < -160 || viewY > height + 160)) continue;
      let forceX = 0;
      let forceY = 0;
      for (const wake of wakes) {
        const distance = (viewY - wake.y) / wake.radius;
        const influence = Math.exp(-distance * distance * 2.4) * Math.max(0, 1 - wake.age / wake.life);
        forceX += wake.vx * influence;
        forceY += wake.vy * influence;
      }
      const fluid = fluidVelocityAt(particle.anchorX + particle.x, viewY + particle.y);
      const restore = particle.loose ? 0 : springK;
      particle.vx += ((forceX * gain + fluid[0] * fluidGain) * particle.mass - restore * particle.x) * deltaTime;
      particle.vy += ((forceY * gain + fluid[1] * fluidGain) * particle.mass - restore * particle.y) * deltaTime;
      if (particle.loose) {
        particle.phase += deltaTime * (1.2 + particle.mass);
        particle.heading += ((Math.random() - .5) * 3 + Math.sin(particle.phase) * .7) * deltaTime;
        const thrust = (200 + particle.mass * 160) * deltaTime;
        particle.vx += Math.cos(particle.heading) * thrust;
        particle.vy += Math.sin(particle.heading) * thrust * .6;
        const screenX = particle.anchorX + particle.x;
        const screenY = viewY + particle.y;
        const overflowX = screenX < 30 ? 30 - screenX : screenX > width - 30 ? width - 30 - screenX : 0;
        const overflowY = screenY < 30 ? 30 - screenY : screenY > height - 30 ? height - 30 - screenY : 0;
        if (overflowX || overflowY) {
          particle.vx += Math.max(-150, Math.min(150, overflowX)) * 9 * deltaTime;
          particle.vy += Math.max(-150, Math.min(150, overflowY)) * 9 * deltaTime;
          const target = Math.atan2(height / 2 - screenY, width / 2 - screenX);
          particle.heading += Math.atan2(Math.sin(target - particle.heading), Math.cos(target - particle.heading)) * 2.5 * deltaTime;
        }
      }
      particle.vx *= damping;
      particle.vy *= damping;
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;

      const offset = Math.hypot(particle.x, particle.y);
      if (!particle.loose && offset * particle.mass > sweepLimit) {
        sweep(particle, Math.sign(particle.vx || 1), Math.sign(particle.vy || 1));
      }
      if (particle.loose) {
        particle.fade = Math.max(fadeFloor, particle.fade - deltaTime * .5);
      } else if (particle.fade < particle.cap) {
        particle.fade = Math.min(particle.cap, particle.fade + deltaTime * .02);
      }

      if (offset < .35 && particle.fade > .995 && !particle.element.style.transform) continue;
      const tilt = Math.max(-4, Math.min(4, particle.vx * .045));
      particle.element.style.transform = offset < .35
        ? "" : `translate(${particle.x.toFixed(1)}px,${particle.y.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg)`;
      particle.element.style.opacity = particle.fade > .995 ? "" : particle.fade.toFixed(3);
    }
  }

  function clearObstacles() {
    output.save();
    output.globalCompositeOperation = "destination-out";
    for (const element of document.querySelectorAll(".photo-frame, .evidence")) {
      const rect = element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > height) continue;
      output.fillRect(rect.left - 3, rect.top - 3, rect.width + 6, rect.height + 6);
    }
    output.restore();
  }

  function draw(now) {
    if (now - lastFrame < 30) { raf = requestAnimationFrame(draw); return; }
    const deltaTime = Math.min(.034, Math.max(.008, (now - lastFrame) / 1000));
    lastFrame = now;
    for (const wake of wakes) wake.age += deltaTime;
    while (wakes.length && wakes[0].age >= wakes[0].life) wakes.shift();
    if (!reducedMotion) stepFluid(deltaTime);
    updateParticles(deltaTime);

    output.setTransform(1, 0, 0, 1, 0, 0);
    output.clearRect(0, 0, canvas.width, canvas.height);
    output.save();
    output.scale(ratio, ratio);
    renderFluid();
    clearObstacles();
    output.restore();
    raf = requestAnimationFrame(draw);
  }

  function onScroll() {
    const now = performance.now();
    const delta = scrollY - lastScroll;
    const elapsed = Math.max(16, now - lastScrollTime);
    const speed = Math.min(1, Math.abs(delta) / elapsed / 2);
    if (Math.abs(delta) > 1) {
      addWake(height * (.42 + Math.random() * .18), (depth % 2 ? 1 : -1) * speed * 14, -Math.sign(delta) * speed * 78, 230, .75);
      addDamage((.00012 + speed * .0014) * (1 + (depth - 1) * .18));
    }
    lastScroll = scrollY;
    lastScrollTime = now;
  }

  function onPointerMove(event) {
    if (reducedMotion) return;
    if (!pointer) { pointer = { x: event.clientX, y: event.clientY }; return; }
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer = { x: event.clientX, y: event.clientY };
    if (!dx && !dy) return;
    splat(event.clientX, event.clientY, dx * 6, dy * 6);
  }

  function onClick(event) {
    if (event.target.closest("dialog, .masthead")) return;
    const normalizedDepth = (depth - 1) / 6;
    addWake(event.clientY, (event.clientX < width / 2 ? -1 : 1) * 24, 8, 110, .65);
    splat(event.clientX, event.clientY, (event.clientX < width / 2 ? -1 : 1) * 60, 45);
    if (depth >= 5) {
      for (const particle of particles) {
        const viewY = particle.docTop - scrollY;
        if (particle.loose || Math.hypot(particle.anchorX - event.clientX, viewY - event.clientY) > 70) continue;
        if (Math.random() < .5) sweep(particle, event.clientX < width / 2 ? -1 : 1, 1);
      }
    }
    addDamage(.001 + normalizedDepth * .0015);
  }

  function refresh(nextDepth) {
    depth = nextDepth;
    document.body.dataset.depth = String(depth);
    syncVariables();
    requestAnimationFrame(segmentArticle);
  }

  function reset() {
    wakes.length = 0;
    if (u) { u.fill(0); v.fill(0); }
    for (const particle of particles) {
      Object.assign(particle, { x: 0, y: 0, vx: 0, vy: 0, fade: 1, cap: 1, loose: false });
      particle.element.style.transform = "";
      particle.element.style.opacity = "";
    }
    syncVariables();
  }

  addEventListener("resize", resize, { passive: true });
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("pointermove", onPointerMove, { passive: true });
  addEventListener("click", onClick, { passive: true });
  if (document.fonts?.ready) document.fonts.ready.then(measureParticles);
  resize();
  raf = requestAnimationFrame(draw);

  return { refresh, reset, destroy() { cancelAnimationFrame(raf); canvas.remove(); } };
}
