/**
 * Liquid glass card — adapted from rdev/liquid-glass-react (edge SDF displacement,
 * chromatic aberration, elastic tilt) + carbon-fiber Bayer dither + panel divits.
 */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;

varying vec2 vUv;

uniform sampler2D uTex;
uniform vec2 uCardSize;
uniform vec2 uCardOrigin;
uniform vec2 uViewport;
uniform float uTime;
uniform float uRadius;
uniform float uAnim;
uniform vec2 uTilt;

const float PI = 3.1415926535897932;

float bayer4(vec2 p) {
  float x = mod(floor(p.x), 4.0);
  float y = mod(floor(p.y), 4.0);
  float v = 0.0;
  if (y == 0.0)      v = (x==0.0)? 0.0  : (x==1.0)? 8.0  : (x==2.0)? 2.0  : 10.0;
  else if (y == 1.0) v = (x==0.0)? 12.0 : (x==1.0)? 4.0  : (x==2.0)? 14.0 : 6.0;
  else if (y == 2.0) v = (x==0.0)? 3.0  : (x==1.0)? 11.0 : (x==2.0)? 1.0  : 9.0;
  else               v = (x==0.0)? 15.0 : (x==1.0)? 7.0  : (x==2.0)? 13.0 : 5.0;
  return (v + 0.5) / 16.0;
}

float rectSdf(vec2 p, vec2 halfSize, float r) {
  vec2 d = abs(p) - halfSize + vec2(r);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

vec2 safeNorm(vec2 v) {
  float l = max(length(v), 0.0001);
  return v / l;
}

vec3 sampleBg(vec2 screenPx) {
  vec2 uv = clamp(screenPx / max(uViewport, vec2(1.0)), vec2(0.0), vec2(1.0));
  return texture2D(uTex, uv).rgb;
}

vec3 blurBg(vec2 screenPx, float spread) {
  vec2 texel = spread / max(uViewport, vec2(1.0));
  vec3 acc = vec3(0.0);
  acc += sampleBg(screenPx) * 0.16;
  acc += sampleBg(screenPx + texel * vec2( 2.5,  0.0)) * 0.12;
  acc += sampleBg(screenPx + texel * vec2(-2.5,  0.0)) * 0.12;
  acc += sampleBg(screenPx + texel * vec2( 0.0,  2.5)) * 0.12;
  acc += sampleBg(screenPx + texel * vec2( 0.0, -2.5)) * 0.12;
  acc += sampleBg(screenPx + texel * vec2( 4.0,  4.0)) * 0.07;
  acc += sampleBg(screenPx + texel * vec2(-4.0,  4.0)) * 0.07;
  acc += sampleBg(screenPx + texel * vec2( 4.0, -4.0)) * 0.07;
  acc += sampleBg(screenPx + texel * vec2(-4.0, -4.0)) * 0.07;
  acc += sampleBg(screenPx + texel * vec2( 6.0,  0.0)) * 0.04;
  acc += sampleBg(screenPx + texel * vec2(-6.0,  0.0)) * 0.04;
  acc += sampleBg(screenPx + texel * vec2( 0.0,  6.0)) * 0.04;
  acc += sampleBg(screenPx + texel * vec2( 0.0, -6.0)) * 0.04;
  return acc;
}

// rdev-style edge displacement from rounded-rect SDF
vec2 edgeDisplacement(vec2 normCoord, float invDist) {
  float edge = 1.0 - clamp(invDist / 0.18, 0.0, 1.0);
  float disp = smoothstep(0.85, 0.0, invDist * 8.0 - 0.15);
  float scaled = smoothstep(0.0, 1.0, disp);
  vec2 displaced = normCoord * mix(1.0, 0.72 + scaled * 0.22, edge * uAnim);
  return displaced;
}

float carbonWeave(vec2 px) {
  vec2 cf = px * 0.11;
  float t1 = sin(cf.x * 1.65 + cf.y * 1.05 + uTime * 0.04) * 0.5 + 0.5;
  float t2 = sin(cf.x * 1.05 - cf.y * 1.65 - uTime * 0.03) * 0.5 + 0.5;
  return mix(t1, t2, 0.48);
}

float panelDivits(vec2 uv) {
  float d = 0.0;
  // outer bezel recess
  float bezel = smoothstep(0.0, 0.018, uv.x) * smoothstep(0.0, 0.018, uv.y)
              * smoothstep(0.0, 0.018, 1.0 - uv.x) * smoothstep(0.0, 0.018, 1.0 - uv.y);
  d += (1.0 - bezel) * 0.55;
  // horizontal groove below dot rail
  float railY = smoothstep(0.115, 0.105, uv.y) * smoothstep(0.095, 0.105, uv.y);
  d += railY * 0.35;
  // vertical side channels
  float sideL = smoothstep(0.04, 0.025, uv.x) * smoothstep(0.08, 0.04, uv.x);
  float sideR = smoothstep(0.04, 0.025, 1.0 - uv.x) * smoothstep(0.08, 0.04, 1.0 - uv.x);
  d += max(sideL, sideR) * 0.28;
  // corner divots
  vec2 c1 = abs(uv - vec2(0.055, 0.055));
  vec2 c2 = abs(uv - vec2(0.945, 0.055));
  vec2 c3 = abs(uv - vec2(0.055, 0.945));
  vec2 c4 = abs(uv - vec2(0.945, 0.945));
  float corner = min(min(length(c1), length(c2)), min(length(c3), length(c4)));
  d += smoothstep(0.05, 0.012, corner) * 0.42;
  // center readout well
  vec2 well = abs(uv - vec2(0.5, 0.52));
  float wellMask = smoothstep(0.38, 0.30, well.x) * smoothstep(0.42, 0.34, well.y);
  d += wellMask * 0.18;
  return clamp(d, 0.0, 1.0);
}

void main() {
  vec2 fragPx = vUv * uCardSize;
  vec2 screenPx = uCardOrigin + fragPx;
  vec2 cardHalf = uCardSize * 0.5;
  vec2 coord = fragPx - cardHalf;
  float invDist = -rectSdf(coord, cardHalf, uRadius);

  if (invDist < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec2 normCoord = coord / max(min(uCardSize.x, uCardSize.y), 1.0);
  vec2 norm = safeNorm(coord + uTilt * 22.0 * uAnim);
  vec2 displaced = edgeDisplacement(normCoord, invDist / max(min(uCardSize.x, uCardSize.y), 1.0));
  vec2 elastic = uTilt * 16.0 * uAnim;

  float edgeAmt = 1.0 - smoothstep(0.0, 0.14, invDist / max(min(uCardSize.x, uCardSize.y), 1.0));
  float lens = 1.0 - sqrt(max(1.0 - edgeAmt * edgeAmt, 0.0));
  vec2 lensOff = norm * lens * min(uCardSize.x, uCardSize.y) * 0.09;

  vec2 refractPx = screenPx + displaced * uCardSize * 0.11 * uAnim + lensOff + elastic;
  float aber = edgeAmt * 3.2 * uAnim;
  vec3 col = vec3(
    blurBg(refractPx - norm * aber * 1.1, 14.0).r,
    blurBg(refractPx, 14.0).g,
    blurBg(refractPx + norm * aber * 0.9, 14.0).b
  );

  col = mix(col, col * 1.08, 0.35);
  col *= vec3(0.92, 0.95, 1.02);

  // carbon fiber base dithered over glass
  float weave = carbonWeave(fragPx);
  float cfLum = mix(0.22, 0.78, weave);
  float cfDot = step(bayer4(fragPx * 0.85), cfLum);
  vec3 carbon = mix(vec3(0.03, 0.035, 0.04), vec3(0.11, 0.115, 0.12), cfDot);
  col = mix(col, col * 0.55 + carbon * 0.45, 0.38);

  // divits darken + catch shadow
  float divits = panelDivits(vUv);
  col *= 1.0 - divits * 0.32;
  col += vec3(0.02, 0.025, 0.035) * divits * 0.4;

  // specular sweep (rectangular highlight band)
  vec2 lightDir = normalize(vec2(-0.28 + uTilt.x * 0.4, -0.88 + uTilt.y * 0.3));
  float spec = pow(max(dot(norm, lightDir), 0.0), 6.0);
  col += vec3(0.45, 0.52, 0.62) * spec * 0.14 * uAnim;

  // top edge catch light
  float topRim = smoothstep(0.06, 0.0, vUv.y) * (1.0 - edgeAmt * 0.5);
  col += vec3(0.55, 0.62, 0.72) * topRim * 0.16;

  // inner frame highlight
  float frameIn = smoothstep(0.04, 0.07, vUv.x) * smoothstep(0.04, 0.07, vUv.y)
                * smoothstep(0.04, 0.07, 1.0 - vUv.x) * smoothstep(0.04, 0.07, 1.0 - vUv.y);
  col += vec3(0.35, 0.42, 0.5) * (1.0 - frameIn) * 0.08;

  float alpha = smoothstep(-0.008, 0.015, invDist) * mix(0.88, 0.94, edgeAmt);
  gl_FragColor = vec4(col, alpha);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
  }
  return sh;
}

function linkProgram(gl, vs, fs) {
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || "program link failed");
  }
  return prog;
}

/** @param {{ shell: HTMLElement, sourceCanvas: HTMLCanvasElement, reduced?: boolean }} opts */
export function createLiquidGlass({ shell, sourceCanvas, reduced = false }) {
  const canvas = shell.querySelector("[data-daemon-glass]");
  if (!canvas || !sourceCanvas) return null;

  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    shell.classList.add("daemon-card-shell--fallback");
    return null;
  }

  const prog = linkProgram(
    gl,
    compile(gl, gl.VERTEX_SHADER, VERT),
    compile(gl, gl.FRAGMENT_SHADER, FRAG),
  );

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, "aPos");
  const uTex = gl.getUniformLocation(prog, "uTex");
  const uCardSize = gl.getUniformLocation(prog, "uCardSize");
  const uCardOrigin = gl.getUniformLocation(prog, "uCardOrigin");
  const uViewport = gl.getUniformLocation(prog, "uViewport");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uRadius = gl.getUniformLocation(prog, "uRadius");
  const uAnim = gl.getUniformLocation(prog, "uAnim");
  const uTilt = gl.getUniformLocation(prog, "uTilt");

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  let active = false;
  let raf = 0;
  let startedAt = performance.now();
  let tilt = [0, 0];

  function cardRect() {
    return shell.getBoundingClientRect();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = cardRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }
    gl.viewport(0, 0, w, h);
  }

  function draw(now) {
    if (!active) return;
    raf = requestAnimationFrame(draw);

    const rect = cardRect();
    if (rect.width < 2 || rect.height < 2) return;

    resize();

    const vw = sourceCanvas.width || window.innerWidth;
    const vh = sourceCanvas.height || window.innerHeight;
    const sx = vw / window.innerWidth;
    const sy = vh / window.innerHeight;

    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.uniform1i(uTex, 0);
    gl.uniform2f(uCardSize, rect.width, rect.height);
    gl.uniform2f(uCardOrigin, rect.left * sx, rect.top * sy);
    gl.uniform2f(uViewport, vw, vh);
    gl.uniform1f(uTime, (now - startedAt) * 0.001);
    gl.uniform1f(uRadius, 6.0);
    gl.uniform1f(uAnim, reduced ? 0.0 : 1.0);
    gl.uniform2f(uTilt, tilt[0], tilt[1]);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  const ro = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(() => resize())
    : null;
  ro?.observe(shell);

  return {
    setTilt(x, y) {
      tilt[0] = x;
      tilt[1] = y;
    },
    start() {
      if (active) return;
      active = true;
      startedAt = performance.now();
      resize();
      raf = requestAnimationFrame(draw);
    },
    stop() {
      active = false;
      cancelAnimationFrame(raf);
    },
    resize,
    destroy() {
      this.stop();
      ro?.disconnect();
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    },
  };
}
