const INK = "23,32,31";
const RED = "151,20,27";

export function createHorrorEffects({ getState, save }) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.createElement("canvas");
  canvas.id = "horror-layer";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  const output = canvas.getContext("2d");
  const ink = document.createElement("canvas");
  const inkContext = ink.getContext("2d");
  const scratch = document.createElement("canvas");
  const scratchContext = scratch.getContext("2d");
  let width = 0;
  let height = 0;
  let ratio = 1;
  let depth = 0;
  let lastScroll = scrollY;
  let lastScrollTime = performance.now();
  let lastFrame = performance.now();
  let lastStamp = 0;
  let raf = 0;
  let saveTimer = 0;
  let pointer = null;
  const wakes = [];

  function resize() {
    ratio = Math.min(devicePixelRatio || 1, 1.25);
    width = innerWidth;
    height = innerHeight;
    for (const surface of [canvas, ink, scratch]) {
      surface.width = Math.round(width * ratio);
      surface.height = Math.round(height * ratio);
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    refresh(depth);
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
    state.damage = Math.min(1, state.damage + amount);
    state.interactions += 1;
    syncVariables();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 180);
  }

  function stampVisibleText(alpha = .08) {
    if (reducedMotion || !width || alpha <= 0) return;
    inkContext.save();
    inkContext.scale(ratio, ratio);
    inkContext.textBaseline = "alphabetic";
    for (const root of document.querySelectorAll("[data-effect-text]")) {
      const rootRect = root.getBoundingClientRect();
      if (rootRect.bottom < 0 || rootRect.top > height) continue;
      const blocks = root.matches("p,h1") ? [root] : [...root.querySelectorAll("p")];
      for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > height || !rect.width) continue;
        const style = getComputedStyle(block);
        const fontSize = parseFloat(style.fontSize);
        const parsedLineHeight = parseFloat(style.lineHeight);
        const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.5;
        inkContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        inkContext.fillStyle = `rgba(${INK},${alpha})`;
        let line = "";
        let lineIndex = 0;
        const commit = () => {
          if (!line) return;
          const baseline = rect.top + fontSize + (lineHeight - fontSize) * .34 + lineIndex * lineHeight;
          inkContext.fillText(line, rect.left, baseline);
          line = "";
          lineIndex += 1;
        };
        for (const character of block.textContent.trim()) {
          const next = line + character;
          if (line && inkContext.measureText(next).width > rect.width) commit();
          line += character;
        }
        commit();
      }
    }
    inkContext.restore();
  }

  function shiftInk(deltaY) {
    if (!deltaY || reducedMotion) return;
    scratchContext.clearRect(0, 0, scratch.width, scratch.height);
    scratchContext.drawImage(ink, 0, 0);
    inkContext.clearRect(0, 0, ink.width, ink.height);
    inkContext.drawImage(scratch, 0, -deltaY * ratio);
  }

  function addWake(y, vx, vy, radius = 180, life = 1) {
    wakes.push({ y, vx, vy, radius, life, age: 0 });
    if (wakes.length > 10) wakes.shift();
  }

  function stain(x, y, strength) {
    if (reducedMotion || depth < 2) return;
    inkContext.save();
    inkContext.scale(ratio, ratio);
    inkContext.lineCap = "square";
    for (let index = 0; index < 4; index += 1) {
      inkContext.strokeStyle = `rgba(${RED},${strength * (.2 - index * .035)})`;
      inkContext.lineWidth = 1 + index * 2.5;
      inkContext.beginPath();
      inkContext.moveTo(x + index - 1.5, y - 13 - index * 3);
      inkContext.lineTo(x + index - 1.5, y + 15 + index * 5);
      inkContext.stroke();
    }
    inkContext.restore();
  }

  function distortInk(deltaTime) {
    if (reducedMotion || !wakes.length) return;
    scratchContext.clearRect(0, 0, scratch.width, scratch.height);
    scratchContext.drawImage(ink, 0, 0);
    inkContext.clearRect(0, 0, ink.width, ink.height);
    const strip = Math.max(8, Math.round(11 * ratio));
    for (let y = 0; y < ink.height; y += strip) {
      const cssY = y / ratio;
      let dx = 0;
      let dy = 0;
      for (const wake of wakes) {
        const distance = (cssY - wake.y) / wake.radius;
        const influence = Math.exp(-distance * distance * 2.4) * Math.max(0, 1 - wake.age / wake.life);
        dx += wake.vx * influence * deltaTime * ratio;
        dy += wake.vy * influence * deltaTime * ratio;
      }
      inkContext.drawImage(scratch, 0, y, ink.width, strip, dx, y + dy, ink.width, strip);
    }
  }

  function fadeInk(deltaTime) {
    const state = getState();
    const normalizedDepth = (depth - 1) / 6;
    const retention = Math.pow(.988 - normalizedDepth * .003 - state.damage * .002, deltaTime * 60);
    inkContext.save();
    inkContext.globalCompositeOperation = "destination-in";
    inkContext.fillStyle = `rgba(0,0,0,${Math.max(.93, retention)})`;
    inkContext.fillRect(0, 0, ink.width, ink.height);
    inkContext.restore();
  }

  function drawWaterline() {
    const state = getState();
    const normalizedDepth = (depth - 1) / 6;
    if (normalizedDepth < .28) return;
    const level = Math.min(.34, Math.max(0, (normalizedDepth - .25) * .22 + state.damage * .13));
    if (level < .015) return;
    const top = height * (1 - level);
    output.save();
    output.beginPath();
    output.moveTo(0, height);
    output.lineTo(0, top);
    for (let x = 0; x <= width + 40; x += 40) {
      let offset = Math.sin(x * .012 + depth * 1.7) * 2.4 + Math.sin(x * .027 + state.damage * 11) * 1.3;
      for (const wake of wakes) {
        const influence = Math.max(0, 1 - wake.age / wake.life);
        offset += wake.vy * influence * Math.exp(-Math.pow((top - wake.y) / wake.radius, 2)) * .08;
      }
      output.lineTo(x, top + offset);
    }
    output.lineTo(width, height);
    output.closePath();
    output.fillStyle = `rgba(5,18,18,${.025 + normalizedDepth * .07 + state.damage * .06})`;
    output.fill();
    output.strokeStyle = `rgba(42,67,64,${.08 + normalizedDepth * .1})`;
    output.lineWidth = 1;
    output.stroke();
    output.restore();
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
    distortInk(deltaTime);
    fadeInk(deltaTime);

    const normalizedDepth = (depth - 1) / 6;
    if (!reducedMotion && now - lastStamp > 420 && normalizedDepth > .12) {
      stampVisibleText(.008 + normalizedDepth * .013);
      lastStamp = now;
    }

    output.setTransform(1, 0, 0, 1, 0, 0);
    output.clearRect(0, 0, canvas.width, canvas.height);
    output.save();
    output.scale(ratio, ratio);
    output.drawImage(ink, 0, 0, ink.width, ink.height, 0, 0, width, height);
    drawWaterline();
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
      shiftInk(delta);
      addWake(height * (.42 + Math.random() * .18), (depth % 2 ? 1 : -1) * speed * 65, -Math.sign(delta) * speed * 38, 230, .75);
      stampVisibleText(.018 + speed * .028 + ((depth - 1) / 6) * .018);
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
    if (Math.abs(dx) + Math.abs(dy) < 7 || event.buttons) return;
    addWake(event.clientY, dx * .7, dy * .25, 95, .48);
  }

  function onClick(event) {
    if (event.target.closest("dialog, .masthead")) return;
    const normalizedDepth = (depth - 1) / 6;
    stain(event.clientX, event.clientY, .35 + normalizedDepth * .35);
    addWake(event.clientY, (event.clientX < width / 2 ? -1 : 1) * 24, 8, 110, .65);
    stampVisibleText(.025 + normalizedDepth * .035);
    addDamage(.001 + normalizedDepth * .0015);
  }

  function refresh(nextDepth) {
    depth = nextDepth;
    document.body.dataset.depth = String(depth);
    syncVariables();
    const normalizedDepth = (depth - 1) / 6;
    requestAnimationFrame(() => stampVisibleText(normalizedDepth <= 0 ? 0 : .006 + normalizedDepth * .025));
  }

  function reset() {
    inkContext.clearRect(0, 0, ink.width, ink.height);
    wakes.length = 0;
    syncVariables();
  }

  addEventListener("resize", resize, { passive: true });
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("pointermove", onPointerMove, { passive: true });
  addEventListener("click", onClick, { passive: true });
  resize();
  raf = requestAnimationFrame(draw);

  return { refresh, reset, destroy() { cancelAnimationFrame(raf); canvas.remove(); } };
}
