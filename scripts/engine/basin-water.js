// scripts/basin-water.js
(function (global) {
  const DEFAULTS = {
    canvasId: 'basin-water',

    // calm water texture (NPOT is OK now)
    baseUrl: 'assets/water-base.jpg',

    // normal map (POT or NPOT both OK now)
    normalUrl: 'assets/water-normal.jpg',

    // Tone
    darkWater: [0.010, 0.014, 0.030],
    baseMix: 0.58,
    baseContrast: 1.06,
    baseBrightness: 0.90,

    // Motion feel
    normalScale: 1.55,
    normalSpeed: 0.022,
    refractStrength: 0.010,

    secondLayerStrength: 0.35,
    secondLayerScaleMul: 1.35,
    secondLayerSpeedMul: 0.65,

    breathSpeed: 0.8,
    breathStrength: 0.06,
    wakeBoost: 0.18,

    glowTint: [0.16, 0.24, 0.44],
    glowIntensity: 0.16,
    glowCenter: [0.5, 0.72],
    glowStretchY: 1.25,

    // If you ever swap to POT textures and want repeat back:
    preferRepeatIfPOT: true,

    // Optional: flip textures vertically (usually not needed for full-screen UVs)
    flipY: false,
  };

  function create(userOptions = {}) {
    const cfg = { ...DEFAULTS, ...userOptions };
    const canvas = document.getElementById(cfg.canvasId);
    if (!canvas) return null;

    const gl =
      canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true }) ||
      canvas.getContext('experimental-webgl');

    if (!gl) {
      console.warn('[PensieveBasinWater] WebGL not available.');
      return null;
    }

    // Basic sanity: clear to something visible while debugging
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let raf = null;
    let t0 = performance.now();
    let wake = 0;

    const prog = createProgram(gl, VERT, FRAG);
    gl.useProgram(prog);

    // --- Fullscreen quad (pos + uv) ---
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,  0, 0,
         1, -1,  1, 0,
        -1,  1,  0, 1,
         1,  1,  1, 1,
      ]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(prog, 'a_pos');
    const aUv = gl.getAttribLocation(prog, 'a_uv');
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

    // --- Uniforms ---
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uWake = gl.getUniformLocation(prog, 'u_wake');

    const uDark = gl.getUniformLocation(prog, 'u_dark');
    const uBaseMix = gl.getUniformLocation(prog, 'u_baseMix');
    const uBaseContrast = gl.getUniformLocation(prog, 'u_baseContrast');
    const uBaseBrightness = gl.getUniformLocation(prog, 'u_baseBrightness');

    const uNS = gl.getUniformLocation(prog, 'u_normalScale');
    const uSpeed = gl.getUniformLocation(prog, 'u_normalSpeed');
    const uRefract = gl.getUniformLocation(prog, 'u_refract');

    const uSecondStrength = gl.getUniformLocation(prog, 'u_secondStrength');
    const uSecondScaleMul = gl.getUniformLocation(prog, 'u_secondScaleMul');
    const uSecondSpeedMul = gl.getUniformLocation(prog, 'u_secondSpeedMul');

    const uBreathSpeed = gl.getUniformLocation(prog, 'u_breathSpeed');
    const uBreathStrength = gl.getUniformLocation(prog, 'u_breathStrength');
    const uWakeBoost = gl.getUniformLocation(prog, 'u_wakeBoost');

    const uGlowTint = gl.getUniformLocation(prog, 'u_glowTint');
    const uGlowIntensity = gl.getUniformLocation(prog, 'u_glowIntensity');
    const uGlowCenter = gl.getUniformLocation(prog, 'u_glowCenter');
    const uGlowStretchY = gl.getUniformLocation(prog, 'u_glowStretchY');

    // --- Textures: base (unit 0) + normal (unit 1) ---
    const uBase = gl.getUniformLocation(prog, 'u_base');
    const uNormal = gl.getUniformLocation(prog, 'u_normal');
    gl.uniform1i(uBase, 0);
    gl.uniform1i(uNormal, 1);

    const texBase = gl.createTexture();
    const texNormal = gl.createTexture();

    // Init both with 1x1 fallbacks, correctly bound to their units
    initTexture(gl, texBase, 0, [18, 22, 34, 255], cfg);
    initTexture(gl, texNormal, 1, [128, 128, 255, 255], cfg);

    // Load both (NPOT-safe params applied after image loads)
    loadImageTexture(gl, texBase, cfg.baseUrl, 0, cfg);
    loadImageTexture(gl, texNormal, cfg.normalUrl, 1, cfg);

    // Ensure units are bound (some drivers are finicky)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texBase);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texNormal);

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }

    window.addEventListener('resize', resize);
    resize();

    function setWake(p) {
      const n = Number(p);
      wake = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
    }

    function draw(now) {
      raf = requestAnimationFrame(draw);

      const t = (now - t0) / 1000;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uWake, wake);

      gl.uniform3f(uDark, cfg.darkWater[0], cfg.darkWater[1], cfg.darkWater[2]);
      gl.uniform1f(uBaseMix, cfg.baseMix);
      gl.uniform1f(uBaseContrast, cfg.baseContrast);
      gl.uniform1f(uBaseBrightness, cfg.baseBrightness);

      gl.uniform1f(uNS, cfg.normalScale);
      gl.uniform1f(uSpeed, cfg.normalSpeed);
      gl.uniform1f(uRefract, cfg.refractStrength);

      gl.uniform1f(uSecondStrength, cfg.secondLayerStrength);
      gl.uniform1f(uSecondScaleMul, cfg.secondLayerScaleMul);
      gl.uniform1f(uSecondSpeedMul, cfg.secondLayerSpeedMul);

      gl.uniform1f(uBreathSpeed, cfg.breathSpeed);
      gl.uniform1f(uBreathStrength, cfg.breathStrength);
      gl.uniform1f(uWakeBoost, cfg.wakeBoost);

      gl.uniform3f(uGlowTint, cfg.glowTint[0], cfg.glowTint[1], cfg.glowTint[2]);
      gl.uniform1f(uGlowIntensity, cfg.glowIntensity);
      gl.uniform2f(uGlowCenter, cfg.glowCenter[0], cfg.glowCenter[1]);
      gl.uniform1f(uGlowStretchY, cfg.glowStretchY);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function start() {
      if (raf != null) return;
      raf = requestAnimationFrame(draw);
    }

    function stop() {
      if (raf == null) return;
      cancelAnimationFrame(raf);
      raf = null;
    }

    return { start, stop, resize, setWake, cfg };
  }

  function initTexture(gl, tex, unit, fallbackRGBA, cfg) {
    gl.activeTexture(unit === 0 ? gl.TEXTURE0 : gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, cfg.flipY ? 1 : 0);

    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
      gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array(fallbackRGBA)
    );

    // Safe defaults for WebGL1 (works for NPOT too)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  function loadImageTexture(gl, tex, url, unit, cfg) {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      gl.activeTexture(unit === 0 ? gl.TEXTURE0 : gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tex);

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, cfg.flipY ? 1 : 0);

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

      const pot = isPowerOf2(img.width) && isPowerOf2(img.height);

      if (pot && cfg.preferRepeatIfPOT) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      } else {
        // NPOT-safe
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };

    img.onerror = () => console.warn('[PensieveBasinWater] FAILED to load', url);
    img.src = url;
  }

  function isPowerOf2(v) {
    return (v & (v - 1)) === 0;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || 'Shader link failed');
    }
    return p;
  }

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || 'Shader compile failed');
    }
    return s;
  }

  const VERT = `
    attribute vec2 a_pos;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    void main() {
      v_uv = a_uv;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  // Your fragment shader unchanged (base refracted by normal).
  const FRAG = `
precision mediump float;
varying vec2 v_uv;

uniform sampler2D u_base;
uniform sampler2D u_normal;

uniform vec2 u_res;
uniform float u_time;
uniform float u_wake;

uniform vec3 u_dark;
uniform float u_baseMix;
uniform float u_baseContrast;
uniform float u_baseBrightness;

uniform float u_normalScale;
uniform float u_normalSpeed;
uniform float u_refract;

uniform float u_secondStrength;
uniform float u_secondScaleMul;
uniform float u_secondSpeedMul;

uniform float u_breathSpeed;
uniform float u_breathStrength;
uniform float u_wakeBoost;

uniform vec3 u_glowTint;
uniform float u_glowIntensity;
uniform vec2 u_glowCenter;
uniform float u_glowStretchY;

vec3 applyContrast(vec3 c, float k) {
  return (c - 0.5) * k + 0.5;
}

void main() {
  vec2 uv = v_uv;

  vec2 nUv1 = uv * u_normalScale
    + vec2(u_time * u_normalSpeed, u_time * (u_normalSpeed * 0.6));

  vec2 nUv2 = uv * (u_normalScale * u_secondScaleMul)
    + vec2(-u_time * (u_normalSpeed * 0.45 * u_secondSpeedMul),
            u_time * (u_normalSpeed * 0.35 * u_secondSpeedMul));

  vec3 n1 = texture2D(u_normal, nUv1).rgb * 2.0 - 1.0;
  vec3 n2 = texture2D(u_normal, nUv2).rgb * 2.0 - 1.0;

  vec2 n = normalize(n1.xy + n2.xy * u_secondStrength);

  vec2 duv = uv + n * u_refract;

  vec2 baseUv1 = duv * 1.05 + vec2(u_time * 0.006, -u_time * 0.004);
  vec2 baseUv2 = duv * 1.35 + vec2(-u_time * 0.004,  u_time * 0.003);

  vec3 base1 = texture2D(u_base, baseUv1).rgb;
  vec3 base2 = texture2D(u_base, baseUv2).rgb;
  vec3 base = mix(base1, base2, 0.35);

  base = applyContrast(base, u_baseContrast);
  base *= u_baseBrightness;

  vec3 col = mix(u_dark, base, u_baseMix);

  float depth = smoothstep(0.08, 0.95, duv.y);
  col *= mix(0.92, 1.02, depth);

  vec2 center = u_glowCenter;
  float d = length((duv - center) * vec2(1.0, u_glowStretchY));
  float halo = exp(-d * d * 6.5);

  float breath = 0.5 + 0.5 * sin(u_time * u_breathSpeed);
  float breathGain = 1.0 + (breath - 0.5) * u_breathStrength;

  float wakeGain = 1.0 + u_wake * u_wakeBoost;

  col += u_glowTint * halo * u_glowIntensity * breathGain * wakeGain;

  float v = smoothstep(0.95, 0.34, length(uv - vec2(0.5, 0.56)));
  col *= mix(0.90, 1.0, v);

  gl_FragColor = vec4(col, 1.0);
}
`;

  global.PensieveBasinWater = { create };
})(window);
