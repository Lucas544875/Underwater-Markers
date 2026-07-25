import { Parser, jaModel } from "budoux";

const CELL_SIZE = 42;
const FIELD_FPS = 32;
const DETACH_DISTANCE = 54;
const DEFAULT_MAX_FIELD_VELOCITY = 3000;
const POINTER_MAX_FIELD_VELOCITY = 2000;
const POINTER_FORCE = 1000;
const POINTER_RADIUS = 0.8;
const POINTER_SPLAT_SPACING = CELL_SIZE * POINTER_RADIUS * 0.5;
const SCROLL_FORCE = 0.3;
const OFFSCREEN_MARGIN = 180;
const MOVED_DISTANCE = 1;
const SKIP_TAGS = new Set(["RT", "RP", "SCRIPT", "STYLE"]);
const phraseParser = new Parser(jaModel);

export function createOceanField({ roots, onActivity = () => {} }) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rootList = [...roots];
  const blockByRoot = new Map();
  const activeBlocks = new Set();

  let width = innerWidth;
  let height = innerHeight;
  let cols = 0;
  let rows = 0;
  let fieldX;
  let fieldY;
  let nextX;
  let nextY;
  let paused = reducedMotion;
  let animationFrame = 0;
  let resizeFrame = 0;
  let lastFrame = performance.now();
  let lastScroll = scrollY;
  let lastScrollAt = performance.now();
  let pointer = null;
  let activityAt = 0;

  function splitPhrases(text) {
    if (!text.trim()) return [text];
    return phraseParser.parse(text)
      .flatMap((phrase) => phrase.split(/(\s+)/u))
      .filter(Boolean);
  }

  function segmentRoot(root) {
    if (blockByRoot.has(root)) return blockByRoot.get(root);

    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue?.trim()
          || SKIP_TAGS.has(node.parentElement?.tagName)
          || node.parentElement?.closest("ruby")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    const particles = [];
    function addParticle(element) {
      particles.push({
        element,
        docX: 0,
        docY: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        detached: false,
        mass: 0.78 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
      });
    }

    for (const textNode of textNodes) {
      const fragment = document.createDocumentFragment();
      const phrases = root.hasAttribute("data-fluid-whole")
        ? [textNode.nodeValue]
        : splitPhrases(textNode.nodeValue);
      for (const phrase of phrases) {
        if (!phrase.trim()) {
          fragment.append(document.createTextNode(phrase));
          continue;
        }
        const element = document.createElement("span");
        element.className = "fluid-segment";
        element.textContent = phrase;
        fragment.append(element);
        addParticle(element);
      }
      textNode.replaceWith(fragment);
    }

    for (const ruby of root.querySelectorAll("ruby")) {
      ruby.classList.add("fluid-segment");
      addParticle(ruby);
    }

    const block = { root, particles, active: false };
    blockByRoot.set(root, block);
    measureBlock(block);
    return block;
  }

  function measureBlock(block) {
    for (const particle of block.particles) {
      const rect = particle.element.getBoundingClientRect();
      particle.docX = rect.left + scrollX + rect.width / 2 - particle.x;
      particle.docY = rect.top + scrollY + rect.height / 2 - particle.y;
    }
  }

  function measure() {
    for (const block of blockByRoot.values()) measureBlock(block);
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const block = entry.isIntersecting ? segmentRoot(entry.target) : blockByRoot.get(entry.target);
      if (!block) continue;
      block.active = entry.isIntersecting;
      block.root.classList.toggle("fluid-active", entry.isIntersecting);
      if (entry.isIntersecting) {
        activeBlocks.add(block);
        requestAnimationFrame(() => measureBlock(block));
      } else {
        activeBlocks.delete(block);
      }
    }
  }, { rootMargin: `${OFFSCREEN_MARGIN}px 0px`, threshold: 0 });

  for (const root of rootList) observer.observe(root);

  function resize() {
    width = innerWidth;
    height = innerHeight;
    cols = Math.ceil(width / CELL_SIZE) + 3;
    rows = Math.ceil(height / CELL_SIZE) + 3;
    const size = cols * rows;
    fieldX = new Float32Array(size);
    fieldY = new Float32Array(size);
    nextX = new Float32Array(size);
    nextY = new Float32Array(size);
    measure();
  }

  function sample(field, x, y) {
    const safeX = Math.max(0, Math.min(cols - 1.001, x));
    const safeY = Math.max(0, Math.min(rows - 1.001, y));
    const column = Math.floor(safeX);
    const row = Math.floor(safeY);
    const fx = safeX - column;
    const fy = safeY - row;
    const index = row * cols + column;
    return (field[index] * (1 - fx) + field[index + 1] * fx) * (1 - fy)
      + (field[index + cols] * (1 - fx) + field[index + cols + 1] * fx) * fy;
  }

  function velocityAt(x, y) {
    return [
      sample(fieldX, x / CELL_SIZE + 1, y / CELL_SIZE + 1),
      sample(fieldY, x / CELL_SIZE + 1, y / CELL_SIZE + 1),
    ];
  }

  function splat(x, y, velocityX, velocityY, radius = 2.7, maxVelocity = DEFAULT_MAX_FIELD_VELOCITY) {
    if (paused || !fieldX) return;
    const centerX = x / CELL_SIZE + 1;
    const centerY = y / CELL_SIZE + 1;
    const reach = Math.ceil(radius * 2);
    for (let row = Math.max(1, Math.floor(centerY - reach)); row <= Math.min(rows - 2, Math.ceil(centerY + reach)); row += 1) {
      for (let column = Math.max(1, Math.floor(centerX - reach)); column <= Math.min(cols - 2, Math.ceil(centerX + reach)); column += 1) {
        const distance = (column - centerX) ** 2 + (row - centerY) ** 2;
        const falloff = Math.exp(-distance / (radius * radius));
        const index = row * cols + column;
        fieldX[index] = Math.max(-maxVelocity, Math.min(maxVelocity, fieldX[index] + velocityX * falloff));
        fieldY[index] = Math.max(-maxVelocity, Math.min(maxVelocity, fieldY[index] + velocityY * falloff));
      }
    }
  }

  function splatPointerTrail(fromX, fromY, toX, toY, velocityX, velocityY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / POINTER_SPLAT_SPACING));

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      splat(
        fromX + dx * progress,
        fromY + dy * progress,
        velocityX,
        velocityY,
        POINTER_RADIUS,
        POINTER_MAX_FIELD_VELOCITY,
      );
    }
  }

  function stepField(deltaTime) {
    nextX.set(fieldX);
    nextY.set(fieldY);

    for (let row = 1; row < rows - 1; row += 1) {
      for (let column = 1; column < cols - 1; column += 1) {
        const index = row * cols + column;
        const averageX = (fieldX[index - 1] + fieldX[index + 1] + fieldX[index - cols] + fieldX[index + cols]) * 0.25;
        const averageY = (fieldY[index - 1] + fieldY[index + 1] + fieldY[index - cols] + fieldY[index + cols]) * 0.25;
        nextX[index] += (averageX - fieldX[index]) * 0.7;
        nextY[index] += (averageY - fieldY[index]) * 0.7;
      }
    }

    const decay = Math.exp(-1.28 * deltaTime);
    for (let row = 1; row < rows - 1; row += 1) {
      for (let column = 1; column < cols - 1; column += 1) {
        const index = row * cols + column;
        const backX = column - nextX[index] * deltaTime / CELL_SIZE;
        const backY = row - nextY[index] * deltaTime / CELL_SIZE;
        fieldX[index] = sample(nextX, backX, backY) * decay;
        fieldY[index] = sample(nextY, backX, backY) * decay;
      }
    }
  }

  function updateParticles(deltaTime, now) {
    let activeParticles = 0;
    let movedParticles = 0;

    for (const block of activeBlocks) {
      if (!block.active) continue;
      for (const particle of block.particles) {
        const anchorX = particle.docX - scrollX;
        const anchorY = particle.docY - scrollY;
        const screenX = anchorX + particle.x;
        const screenY = anchorY + particle.y;

        // Two-stage culling: the paragraph must intersect the observer margin,
        // and the individual segment must still be close to the viewport.
        if (screenY < -OFFSCREEN_MARGIN || screenY > height + OFFSCREEN_MARGIN
          || screenX < -OFFSCREEN_MARGIN || screenX > width + OFFSCREEN_MARGIN) continue;

        activeParticles += 1;
        const [fluidX, fluidY] = velocityAt(screenX, screenY);
        const ambient = Math.sin(now * 0.00022 + particle.phase + anchorY * 0.004);
        const spring = particle.detached ? 0 : 10.5 / particle.mass;
        const damping = Math.exp(-(particle.detached ? 2.8 : 4.4) * deltaTime);
        const fluidInfluence = particle.detached ? 0.12 : 1;
        particle.vx += (fluidX * fluidInfluence + ambient * 3.2 - particle.x * spring) * deltaTime;
        particle.vy += (fluidY * fluidInfluence + Math.cos(particle.phase + now * 0.00018) * 1.2 - particle.y * spring) * deltaTime;
        particle.vx *= damping;
        particle.vy *= damping;
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;

        const distance = Math.hypot(particle.x, particle.y);
        if (distance >= MOVED_DISTANCE) movedParticles += 1;
        if (!particle.detached && distance > DETACH_DISTANCE) {
          particle.detached = true;
          particle.vx *= 0.55;
          particle.vy *= 0.55;
        }

        const tilt = Math.max(-2.2, Math.min(2.2, particle.vx * 0.028));
        if (Math.abs(particle.x) + Math.abs(particle.y) < 0.08) {
          particle.element.style.transform = "";
        } else {
          particle.element.style.transform = `translate3d(${particle.x.toFixed(2)}px, ${particle.y.toFixed(2)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
        }
      }
    }

    if (now - activityAt > 350) {
      activityAt = now;
      onActivity({ moved: movedParticles, active: activeParticles });
    }
  }

  function draw(now) {
    animationFrame = requestAnimationFrame(draw);
    if (now - lastFrame < 1000 / FIELD_FPS) return;
    const deltaTime = Math.min(0.045, Math.max(0.008, (now - lastFrame) / 1000));
    lastFrame = now;
    if (!paused) {
      stepField(deltaTime);
      updateParticles(deltaTime, now);
    }
  }

  function onPointerMove(event) {
    if (paused || event.pointerType === "touch") return;
    const now = event.timeStamp || performance.now();
    if (!pointer) {
      pointer = { x: event.clientX, y: event.clientY, at: now };
      return;
    }
    const elapsed = Math.max(8, now - pointer.at);
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    const previousX = pointer.x;
    const previousY = pointer.y;
    pointer = { x: event.clientX, y: event.clientY, at: now };
    if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
    splatPointerTrail(
      previousX,
      previousY,
      event.clientX,
      event.clientY,
      dx / elapsed * POINTER_FORCE,
      dy / elapsed * POINTER_FORCE,
    );
  }

  function onPointerDown(event) {
    const direction = event.clientX < width / 2 ? -1 : 1;
    splat(event.clientX, event.clientY, direction * 160, 48, 1.6, POINTER_MAX_FIELD_VELOCITY);
  }

  function onScroll() {
    if (paused) return;
    const now = performance.now();
    const delta = scrollY - lastScroll;
    const elapsed = Math.max(14, now - lastScrollAt);
    const velocity = Math.max(-900, Math.min(900, delta / elapsed * 1000));
    lastScroll = scrollY;
    lastScrollAt = now;
    if (Math.abs(velocity) < 12) return;

    const y = height * 0.5;
    for (let index = 0; index < 4; index += 1) {
      const x = width * (0.14 + index * 0.24);
      const crossCurrent = Math.sin(scrollY * 0.003 + index * 1.7) * Math.abs(velocity) * 0.075 * SCROLL_FORCE;
      splat(x, y + (index % 2 ? 48 : -48), crossCurrent, -velocity * 0.21 * SCROLL_FORCE, 3.4);
    }
  }

  function resetParticles() {
    for (const block of blockByRoot.values()) {
      for (const particle of block.particles) {
        particle.x = 0;
        particle.y = 0;
        particle.vx = 0;
        particle.vy = 0;
        particle.detached = false;
        particle.element.style.transform = "";
      }
    }
  }

  function setPaused(nextPaused) {
    paused = Boolean(nextPaused || reducedMotion);
    document.documentElement.classList.toggle("motion-paused", paused);
    if (paused) {
      fieldX?.fill(0);
      fieldY?.fill(0);
      resetParticles();
      onActivity({ moved: 0, active: 0 });
    }
    return paused;
  }

  function togglePaused() {
    return setPaused(!paused);
  }

  function onResize() {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      resize();
    });
  }

  addEventListener("pointermove", onPointerMove, { passive: true });
  addEventListener("pointerdown", onPointerDown, { passive: true });
  addEventListener("pointerout", () => { pointer = null; }, { passive: true });
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onResize, { passive: true });

  resize();
  setPaused(paused);
  animationFrame = requestAnimationFrame(draw);

  return {
    measure,
    setPaused,
    togglePaused,
    destroy() {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      removeEventListener("pointermove", onPointerMove);
      removeEventListener("pointerdown", onPointerDown);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
    },
  };
}
