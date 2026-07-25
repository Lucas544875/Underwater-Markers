const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
in vec2 aUv;
out vec2 vUv;

void main() {
  vUv = aUv;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uSource;
uniform sampler2D uField;
uniform vec2 uViewport;
uniform vec4 uRegion;
uniform vec2 uFieldSize;
uniform float uCellSize;
uniform float uMaxVelocity;
uniform float uStrength;
out vec4 outColor;

void main() {
  vec2 screenPx = vec2(
    uRegion.x + vUv.x * uRegion.z,
    uRegion.y + (1.0 - vUv.y) * uRegion.w
  );
  vec2 fieldCell = screenPx / uCellSize + 1.5;
  vec2 fieldUv = fieldCell / uFieldSize;
  vec2 encoded = texture(uField, fieldUv).rg;
  vec2 velocity = ((encoded * 255.0 - 128.0) / 127.0) * uMaxVelocity;
  velocity.y *= -1.0;

  vec2 offset = velocity * uStrength / max(uRegion.zw, vec2(1.0));
  vec2 sampleUv = vUv - offset;
  if (sampleUv.x < 0.0 || sampleUv.x > 1.0
      || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
    outColor = vec4(0.0);
  } else {
    outColor = texture(uSource, sampleUv);
  }
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || "Shader compilation failed");
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(message || "Shader linking failed");
  }
  return program;
}

function rgba(value, fallback = "rgba(0, 0, 0, 0)") {
  return value && value !== "rgba(0, 0, 0, 0)" ? value : fallback;
}

function relativeRect(element, rootRect) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - rootRect.left,
    y: rect.top - rootRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, radius);
  } else {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.moveTo(x + safeRadius, y);
    context.arcTo(x + width, y, x + width, y + height, safeRadius);
    context.arcTo(x + width, y + height, x, y + height, safeRadius);
    context.arcTo(x, y + height, x, y, safeRadius);
    context.arcTo(x, y, x + width, y, safeRadius);
  }
  context.closePath();
}

function setTextStyle(context, style) {
  const fontStyle = style.fontStyle === "normal" ? "" : `${style.fontStyle} `;
  const fontWeight = style.fontWeight === "400" ? "" : `${style.fontWeight} `;
  context.font = `${fontStyle}${fontWeight}${style.fontSize} ${style.fontFamily}`;
  context.textBaseline = "bottom";
  context.fillStyle = style.color;
}

function drawTextNodes(context, root, rootRect) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim() || node.parentElement?.closest("canvas")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const range = document.createRange();

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const style = getComputedStyle(parent);
    if (style.display === "none" || style.visibility === "hidden") continue;
    setTextStyle(context, style);
    const underline = style.textDecorationLine.includes("underline");

    for (let index = 0; index < node.nodeValue.length; index += 1) {
      const character = node.nodeValue[index];
      if (/[\n\r]/u.test(character)) continue;
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      const x = rect.left - rootRect.left;
      const y = rect.bottom - rootRect.top;

      if (parent.classList.contains("colophon-number")) {
        context.strokeStyle = "rgba(245, 240, 228, 0.4)";
        context.lineWidth = 1;
        context.strokeText(character, x, y);
      } else if (!/^\s$/u.test(character)) {
        context.fillText(character, x, y);
      }

      if (underline && !/^\s$/u.test(character)) {
        context.strokeStyle = style.color;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, y + 2);
        context.lineTo(x + rect.width, y + 2);
        context.stroke();
      }
    }
  }
  range.detach();
}

function paintHeader(context, target, rootRect) {
  context.fillStyle = "rgba(12, 66, 90, 0.94)";
  context.fillRect(0, 0, rootRect.width, rootRect.height);
  context.fillStyle = "rgba(247, 238, 215, 0.25)";
  context.fillRect(0, rootRect.height - 1, rootRect.width, 1);

  const mark = target.querySelector(".reader-brand-mark");
  if (mark) {
    const rect = relativeRect(mark, rootRect);
    context.fillStyle = getComputedStyle(mark).backgroundColor;
    drawRoundedRect(context, rect.x, rect.y, rect.width, rect.height, rect.width / 2);
    context.fill();
  }

  for (const element of target.querySelectorAll(".reader-progress, .reader-progress i")) {
    if (getComputedStyle(element).display === "none") continue;
    const rect = relativeRect(element, rootRect);
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(rect.x, rect.y, rect.width, Math.max(1, rect.height));
  }
}

function paintHero(context, target, rootRect) {
  context.fillStyle = "#176f91";
  context.fillRect(0, 0, rootRect.width, rootRect.height);
  const depth = context.createLinearGradient(0, 0, 0, rootRect.height);
  depth.addColorStop(0, "rgba(6, 55, 76, 0.08)");
  depth.addColorStop(1, "rgba(6, 55, 76, 0.34)");
  context.fillStyle = depth;
  context.fillRect(0, 0, rootRect.width, rootRect.height);

  const before = getComputedStyle(target, "::before");
  const circleSize = Number.parseFloat(before.width);
  const circleX = Number.parseFloat(before.left);
  const circleY = Number.parseFloat(before.top);
  if (Number.isFinite(circleSize)) {
    const centerX = circleX + circleSize / 2;
    const centerY = circleY + circleSize / 2;
    for (const [extra, color] of [
      [rootRect.width * 0.18, "rgba(245, 240, 228, 0.02)"],
      [rootRect.width * 0.08, "rgba(245, 240, 228, 0.025)"],
    ]) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(centerX, centerY, circleSize / 2 + extra, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = "rgba(245, 240, 228, 0.42)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(centerX, centerY, circleSize / 2, 0, Math.PI * 2);
    context.stroke();
  }

  const after = getComputedStyle(target, "::after");
  const sunSize = Number.parseFloat(after.width);
  const sunRight = Number.parseFloat(after.right);
  const sunTop = Number.parseFloat(after.top);
  if (Number.isFinite(sunSize)) {
    const sunX = rootRect.width - sunRight - sunSize / 2;
    const sunY = sunTop + sunSize / 2;
    context.save();
    context.shadowColor = "rgba(81, 41, 30, 0.2)";
    context.shadowBlur = 70;
    context.shadowOffsetY = 28;
    context.fillStyle = "#dd754e";
    context.beginPath();
    context.arc(sunX, sunY, sunSize / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  const water = target.querySelector(".opening-water");
  if (water) {
    const waterRect = relativeRect(water, rootRect);
    context.save();
    context.beginPath();
    context.moveTo(waterRect.x, waterRect.y + waterRect.height * 0.08);
    for (const [x, y] of [
      [0.13, 0.04], [0.25, 0.09], [0.38, 0.02], [0.51, 0.07],
      [0.66, 0], [0.82, 0.05], [1, 0.01],
    ]) {
      context.lineTo(waterRect.x + waterRect.width * x, waterRect.y + waterRect.height * y);
    }
    context.lineTo(waterRect.x + waterRect.width, waterRect.y + waterRect.height);
    context.lineTo(waterRect.x, waterRect.y + waterRect.height);
    context.closePath();
    context.clip();

    const waterDepth = context.createLinearGradient(0, waterRect.y, 0, waterRect.y + waterRect.height);
    waterDepth.addColorStop(0, "rgba(7, 68, 92, 0)");
    waterDepth.addColorStop(1, "rgba(5, 54, 73, 0.44)");
    context.fillStyle = waterDepth;
    context.fillRect(waterRect.x, waterRect.y, waterRect.width, waterRect.height);

    context.strokeStyle = "rgba(244, 238, 216, 0.15)";
    context.lineWidth = 1;
    const diagonalReach = waterRect.height * 0.11;
    for (let y = waterRect.y - diagonalReach; y < waterRect.y + waterRect.height + diagonalReach; y += 40) {
      context.beginPath();
      context.moveTo(waterRect.x, y + diagonalReach);
      context.lineTo(waterRect.x + waterRect.width, y - diagonalReach);
      context.stroke();
    }
    context.restore();

    for (const line of water.querySelectorAll("i")) {
      const style = getComputedStyle(line);
      const x = waterRect.x + Number.parseFloat(style.left);
      const y = waterRect.y + Number.parseFloat(style.top);
      const width = Number.parseFloat(style.width);
      const matrix = new DOMMatrix(style.transform);
      const angle = Math.atan2(matrix.b, matrix.a);
      context.save();
      context.translate(x, y);
      context.rotate(angle);
      context.strokeStyle = "rgba(245, 240, 228, 0.26)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(width, 0);
      context.stroke();
      context.restore();
    }
  }

  const cta = target.querySelector(".begin-reading");
  if (cta) {
    const rect = relativeRect(cta, rootRect);
    context.strokeStyle = "rgba(245, 240, 228, 0.65)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(rect.x, rect.y + 0.5);
    context.lineTo(rect.x + rect.width, rect.y + 0.5);
    context.moveTo(rect.x, rect.y + rect.height - 0.5);
    context.lineTo(rect.x + rect.width, rect.y + rect.height - 0.5);
    context.stroke();
  }
}

function paintFooter(context, target, rootRect) {
  const style = getComputedStyle(target);
  context.fillStyle = rgba(style.getPropertyValue("--blue-dark").trim(), "#0c425a");
  context.fillRect(0, 0, rootRect.width, rootRect.height);

  context.strokeStyle = "rgba(245, 240, 228, 0.05)";
  context.lineWidth = 1;
  const diagonalReach = rootRect.height * 0.11;
  for (let y = -diagonalReach; y < rootRect.height + diagonalReach; y += 56) {
    context.beginPath();
    context.moveTo(0, y + diagonalReach);
    context.lineTo(rootRect.width, y - diagonalReach);
    context.stroke();
  }

  const links = target.querySelector(".colophon-links");
  if (links) {
    const rect = relativeRect(links, rootRect);
    context.fillStyle = "rgba(245, 240, 228, 0.32)";
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    for (const link of links.querySelectorAll("a")) {
      const linkRect = relativeRect(link, rootRect);
      context.fillStyle = link.matches(":hover") ? "#15566e" : "#0c425a";
      context.fillRect(linkRect.x, linkRect.y, linkRect.width, linkRect.height);
    }
  }
}

function createRegionPainter(target, kind, onPaint) {
  const source = document.createElement("canvas");
  const context = source.getContext("2d");
  let cssWidth = 1;
  let cssHeight = 1;
  let dirty = true;

  function invalidate() {
    dirty = true;
  }

  function paint() {
    if (!dirty) return false;
    dirty = false;
    target.classList.remove("fluid-distortion-ready");
    const rect = target.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (source.width !== pixelWidth || source.height !== pixelHeight) {
      source.width = pixelWidth;
      source.height = pixelHeight;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);

    if (kind === "header") paintHeader(context, target, rect);
    else if (kind === "hero") paintHero(context, target, rect);
    else paintFooter(context, target, rect);
    drawTextNodes(context, target, rect);
    target.classList.add("fluid-distortion-ready");
    onPaint(source);
    return true;
  }

  return {
    source,
    invalidate,
    paint,
    getSize: () => [cssWidth, cssHeight],
  };
}

function createDistortedRegion(target, kind, getFieldSnapshot) {
  const canvas = document.createElement("canvas");
  canvas.className = "fluid-distortion-canvas";
  canvas.setAttribute("aria-hidden", "true");
  target.prepend(canvas);

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  });
  if (!gl) {
    canvas.remove();
    throw new Error("WebGL2 is unavailable");
  }
  let contextLost = false;
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
    target.classList.remove("fluid-distortion-ready");
    canvas.hidden = true;
  });

  const program = createProgram(gl);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 0, 0,
    1, -1, 1, 0,
    -1, 1, 0, 1,
    -1, 1, 0, 1,
    1, -1, 1, 0,
    1, 1, 1, 1,
  ]), gl.STATIC_DRAW);

  gl.useProgram(program);
  const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
  const position = gl.getAttribLocation(program, "aPosition");
  const uv = gl.getAttribLocation(program, "aUv");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

  const uniforms = Object.fromEntries([
    "uSource", "uField", "uViewport", "uRegion", "uFieldSize",
    "uCellSize", "uMaxVelocity", "uStrength",
  ].map((name) => [name, gl.getUniformLocation(program, name)]));

  const sourceTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(uniforms.uSource, 0);

  const fieldTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(uniforms.uField, 1);

  let fieldPixels = new Uint8Array(4);
  let fieldCols = 0;
  let fieldRows = 0;
  let lastFieldVersion = -1;

  const painter = createRegionPainter(target, kind, (source) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  });

  function resizeCanvas() {
    const [width, height] = painter.getSize();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function uploadField(snapshot) {
    if (!snapshot.x || snapshot.version === lastFieldVersion) return;
    const required = snapshot.cols * snapshot.rows * 4;
    if (fieldPixels.length !== required) fieldPixels = new Uint8Array(required);
    const scale = 127 / snapshot.maxVelocity;
    for (let index = 0; index < snapshot.x.length; index += 1) {
      const offset = index * 4;
      fieldPixels[offset] = Math.max(0, Math.min(255, 128 + snapshot.x[index] * scale));
      fieldPixels[offset + 1] = Math.max(0, Math.min(255, 128 + snapshot.y[index] * scale));
      fieldPixels[offset + 2] = 128;
      fieldPixels[offset + 3] = 255;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    if (snapshot.cols !== fieldCols || snapshot.rows !== fieldRows) {
      fieldCols = snapshot.cols;
      fieldRows = snapshot.rows;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fieldCols, fieldRows, 0, gl.RGBA, gl.UNSIGNED_BYTE, fieldPixels);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, fieldCols, fieldRows, gl.RGBA, gl.UNSIGNED_BYTE, fieldPixels);
    }
    lastFieldVersion = snapshot.version;
  }

  function render() {
    if (contextLost) return;
    const snapshot = getFieldSnapshot();
    const rect = target.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    painter.paint();
    resizeCanvas();
    uploadField(snapshot);

    gl.useProgram(program);
    gl.uniform2f(uniforms.uViewport, innerWidth, innerHeight);
    gl.uniform4f(uniforms.uRegion, rect.left, rect.top, rect.width, rect.height);
    gl.uniform2f(uniforms.uFieldSize, snapshot.cols, snapshot.rows);
    gl.uniform1f(uniforms.uCellSize, snapshot.cellSize);
    gl.uniform1f(uniforms.uMaxVelocity, snapshot.maxVelocity);
    gl.uniform1f(uniforms.uStrength, snapshot.paused ? 0 : 0.012);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return {
    kind,
    invalidate: painter.invalidate,
    render,
    destroy() {
      target.classList.remove("fluid-distortion-ready");
      if (!contextLost) {
        gl.deleteTexture(sourceTexture);
        gl.deleteTexture(fieldTexture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
      }
      canvas.remove();
    },
  };
}

export function createFluidDistortion({ field, header, hero, footer }) {
  const targets = [
    [header, "header"],
    [hero, "hero"],
    [footer, "footer"],
  ].filter(([target]) => target);
  const regions = [];
  let animationFrame = 0;
  let resizeFrame = 0;

  try {
    for (const [target, kind] of targets) {
      regions.push(createDistortedRegion(target, kind, () => field.getFieldSnapshot()));
    }
  } catch (error) {
    for (const region of regions) region.destroy();
    console.warn("Fluid distortion disabled:", error);
    return {
      invalidate() {},
      destroy() {},
    };
  }

  function draw() {
    animationFrame = requestAnimationFrame(draw);
    for (const region of regions) region.render();
  }

  function invalidate(kind) {
    for (const region of regions) {
      if (!kind || region.kind === kind) region.invalidate();
    }
  }

  function onResize() {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      invalidate();
    });
  }

  addEventListener("resize", onResize, { passive: true });
  const invalidateFooter = () => invalidate("footer");
  footer?.addEventListener("pointerover", invalidateFooter, { passive: true });
  footer?.addEventListener("pointerout", invalidateFooter, { passive: true });
  invalidate();
  animationFrame = requestAnimationFrame(draw);

  return {
    invalidate,
    destroy() {
      cancelAnimationFrame(animationFrame);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      removeEventListener("resize", onResize);
      footer?.removeEventListener("pointerover", invalidateFooter);
      footer?.removeEventListener("pointerout", invalidateFooter);
      for (const region of regions) region.destroy();
    },
  };
}
