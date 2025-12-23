(function (global) {
  function init(options = {}) {
    const scene = document.querySelector('.scene');
    const intro = document.querySelector('#scene-intro');
    const vials = document.querySelector('#scene-vials');
    const canvas = document.querySelector('#ripple-canvas');

    // CTA is optional now (only used to compute origin if you want)
    // const cta = intro?.querySelector('.page__cta');

    if (!scene || !intro || !vials || !canvas) return null;

    const cfg = {
      durationMs: options.durationMs ?? 1700,
      prelude: options.prelude ?? 0.28,
      preludeFadeStart: options.preludeFadeStart ?? 0.70,
      fadeIntroMs: options.fadeIntroMs ?? 700,
      vialsFadeInDelayMs: options.vialsFadeInDelayMs ?? 120,

      normalUrl: options.normalUrl ?? 'assets/water-normal.png',
      normalScale: options.normalScale ?? 1.35,
      normalSpeed: options.normalSpeed ?? 0.065,
      refractStrength: options.refractStrength ?? 0.024,

      edgeSoftness: options.edgeSoftness ?? 0.06,
      darkWater: options.darkWater ?? [0.02, 0.03, 0.06],

      preludeRingFreq: options.preludeRingFreq ?? 58.0,
      preludeRingSpeed: options.preludeRingSpeed ?? 3.6,
      preludeRingBoost: options.preludeRingBoost ?? 0.70,

      wavefrontBoost: options.wavefrontBoost ?? 0.55,

      // NEW
      origin: options.origin ?? null,         // {x,y} in px (viewport coords)
      originSelector: options.originSelector ?? null, // CSS selector to compute origin from
      onEnd: options.onEnd ?? null
    };

    let running = false;

    // ---- WebGL setup ----
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
    if (!gl) {
      console.warn('WebGL not supported. Consider using the 2D overlay fallback.');
      return null;
    }

    const prog = createProgram(gl, VERT, FRAG);
    gl.useProgram(prog);
    createFullscreenQuad(gl, prog);

    const u = {
      sceneTex: gl.getUniformLocation(prog, 'u_scene'),
      normalTex: gl.getUniformLocation(prog, 'u_normal'),
      res: gl.getUniformLocation(prog, 'u_res'),
      time: gl.getUniformLocation(prog, 'u_time'),
      origin: gl.getUniformLocation(prog, 'u_origin'),
      radius: gl.getUniformLocation(prog, 'u_radius'),
      preludeT: gl.getUniformLocation(prog, 'u_preludeT'),
      normalScale: gl.getUniformLocation(prog, 'u_normalScale'),
      normalSpeed: gl.getUniformLocation(prog, 'u_normalSpeed'),
      strength: gl.getUniformLocation(prog, 'u_strength'),
      edgeSoft: gl.getUniformLocation(prog, 'u_edgeSoft'),
      darkWater: gl.getUniformLocation(prog, 'u_darkWater'),
      preludeRingFreq: gl.getUniformLocation(prog, 'u_preludeRingFreq'),
      preludeRingSpeed: gl.getUniformLocation(prog, 'u_preludeRingSpeed'),
      preludeRingBoost: gl.getUniformLocation(prog, 'u_preludeRingBoost'),
      wavefrontBoost: gl.getUniformLocation(prog, 'u_wavefrontBoost')
    };

    const normalTex = gl.createTexture();
    const sceneTex = gl.createTexture();

    let normalReady = false;
    loadImage(cfg.normalUrl).then((img) => {
      gl.bindTexture(gl.TEXTURE_2D, normalTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      normalReady = true;
    });

    function computeOriginPx() {
      // 1) explicit override in cfg
      if (cfg.origin && Number.isFinite(cfg.origin.x) && Number.isFinite(cfg.origin.y)) {
        return { x: cfg.origin.x, y: cfg.origin.y };
      }

      // 2) selector override
      if (cfg.originSelector) {
        const el = document.querySelector(cfg.originSelector);
        if (el) {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
      }

      // 3) fallback to CTA center (if exists)
      // if (cta) {
      //   const r = cta.getBoundingClientRect();
      //   return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      // }

      // 4) ultimate fallback: center of viewport
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    async function start(originPxOverride) {
      if (running) return;
      running = true;

      if (document.fonts?.ready) await document.fonts.ready;

      const originPx = originPxOverride ?? computeOriginPx();

      // Start overlay immediately
      scene.classList.add('is-rippling');
      resizeGLCanvas(canvas, gl);

      // Capture intro ONCE -> scene texture
      const snapCanvas = await window.html2canvas(intro, { backgroundColor: null });
      const bmp = await createImageBitmap(snapCanvas);

      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);

      // Fade DOM (you can later use preludeFadeStart properly; keeping your “immediate” for now)
      intro.style.transition = `opacity 0ms ease, filter 0ms ease`;
      const fadeTimer = setTimeout(() => {
        intro.style.opacity = '0';
        intro.style.filter = 'blur(2px)';
      }, 0);

      await run(gl, u, sceneTex, normalTex, originPx, cfg, () => normalReady);

      clearTimeout(fadeTimer);

      // End + cleanup
      scene.classList.remove('is-rippling');
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      scene.classList.add('intro-hidden');
      await delay(cfg.vialsFadeInDelayMs);
      scene.classList.add('vials-visible');

      running = false;
      cfg.onEnd?.();
    }

    return {
      start,
      isRunning: () => running
    };
  }
  
  function run(gl, u, sceneTex, normalTex, originPx, cfg, isNormalReady) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const originUV = { x: originPx.x / vw, y: 1.0 - originPx.y / vh };
      const maxR = Math.hypot(vw, vh) / Math.min(vw, vh);

      // two-stage radius mapping:
      // - prelude: small radius grows a bit (but stays small)
      // - dive: continues from that radius all the way to max
      const prelude = clamp01(cfg.prelude);
      const rPreludeStart = 0.035;
      const rPreludeEnd = 0.22;

      function frame(now) {
        const t = clamp01((now - t0) / cfg.durationMs);

        // phase times
        const tPrelude = clamp01(t / Math.max(0.0001, prelude));
        const tDive = clamp01((t - prelude) / Math.max(0.0001, (1.0 - prelude)));

        // keep prelude visible the whole time, then expand into dive (no “fade to black”)
        const rPrelude = mix(rPreludeStart, rPreludeEnd, easeOutCubic(tPrelude));
        const rDive = mix(rPreludeEnd, maxR, easeInOutCubic(tDive));
        const radius = (t < prelude) ? rPrelude : rDive;

        // “prelude intensity” = 1 during prelude, then eases to 0 during dive
        // used by shader to boost small ripples early
        const preludeT = (t < prelude) ? 1.0 : (1.0 - easeInOutCubic(tDive));

        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.uniform1i(u.sceneTex, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, normalTex);
        gl.uniform1i(u.normalTex, 1);

        gl.uniform2f(u.res, vw, vh);
        gl.uniform1f(u.time, (now - t0) * 0.001);
        gl.uniform2f(u.origin, originUV.x, originUV.y);
        gl.uniform1f(u.radius, radius);
        gl.uniform1f(u.preludeT, preludeT);

        gl.uniform1f(u.normalScale, cfg.normalScale);
        gl.uniform1f(u.normalSpeed, cfg.normalSpeed);
        gl.uniform1f(u.strength, cfg.refractStrength * (isNormalReady() ? 1.0 : 0.0));
        gl.uniform1f(u.edgeSoft, cfg.edgeSoftness);
        gl.uniform3f(u.darkWater, cfg.darkWater[0], cfg.darkWater[1], cfg.darkWater[2]);

        gl.uniform1f(u.preludeRingFreq, cfg.preludeRingFreq);
        gl.uniform1f(u.preludeRingSpeed, cfg.preludeRingSpeed);
        gl.uniform1f(u.preludeRingBoost, cfg.preludeRingBoost);
        gl.uniform1f(u.wavefrontBoost, cfg.wavefrontBoost);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        if (t >= 1) return resolve();
        requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    });
  }

  // ---- helpers ----
  function resizeGLCanvas(canvas, gl) {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || 'Program link failed');
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

  function createFullscreenQuad(gl, prog) {
    const posLoc = gl.getAttribLocation(prog, 'a_pos');
    const uvLoc = gl.getAttribLocation(prog, 'a_uv');

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);

    const data = new Float32Array([
      -1, -1,  0, 0,
       1, -1,  1, 0,
      -1,  1,  0, 1,
      -1,  1,  0, 1,
       1, -1,  1, 0,
       1,  1,  1, 1
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

    return buf;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const mix = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ---- shaders ----
  const VERT = `
    attribute vec2 a_pos;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    void main() {
      v_uv = a_uv;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  const FRAG = `
    precision mediump float;
    varying vec2 v_uv;

    uniform sampler2D u_scene;
    uniform sampler2D u_normal;

    uniform vec2  u_res;
    uniform float u_time;
    uniform vec2  u_origin;
    uniform float u_radius;
    uniform float u_preludeT;

    uniform float u_normalScale;
    uniform float u_normalSpeed;
    uniform float u_strength;
    uniform float u_edgeSoft;
    uniform vec3  u_darkWater;

    uniform float u_preludeRingFreq;
    uniform float u_preludeRingSpeed;
    uniform float u_preludeRingBoost;
    uniform float u_wavefrontBoost;

    float smoothCircle(vec2 uv, vec2 o, float r, float soft) {
      float d = distance(uv, o);
      return smoothstep(r, r - soft, d); // 1 inside, 0 outside
    }

    void main() {
      vec2 uv = v_uv;

      float mask = smoothCircle(uv, u_origin, u_radius, u_edgeSoft);
      float d0 = distance(uv, u_origin);

      // normal map
      vec2 nUV = uv * u_normalScale + vec2(u_time * u_normalSpeed, u_time * u_normalSpeed * 0.73);
      vec3 n = texture2D(u_normal, nUV).rgb;
      vec2 normalXY = (n.rg * 2.0 - 1.0);

      // wavefront band (used for both refract boost and highlight)
      float edgeBand = exp(-pow((d0 - u_radius) / (u_edgeSoft * 1.25), 2.0));

      // Refraction: stronger on the wavefront, plus a little constant inside
      float refrBoost = (0.35 + 1.15 * edgeBand);

      vec2 refrUV = uv + normalXY * u_strength * refrBoost * mask;
      vec4 sceneCol = texture2D(u_scene, refrUV);

      // Base: keep scene visible early. Darkening ramps mainly with mask.
      vec3 water = mix(sceneCol.rgb, u_darkWater, 0.52 * mask);

      // --- Prelude micro-ripples (many rings) ---
      // These should be visible while radius is small, then gracefully diminish.
      float ripple = sin(d0 * u_preludeRingFreq - u_time * u_preludeRingSpeed);
      // turn sine into crisp rings
      ripple = 1.0 - abs(ripple);
      ripple = smoothstep(0.65, 0.98, ripple);

      // decay with distance and keep inside mask
      float rippleFade = exp(-d0 * 3.8) * mask;

      // preludeT = 1 during prelude, then falls to 0
      float rippleLight = ripple * rippleFade * u_preludeT * u_preludeRingBoost;
      water += vec3(0.16, 0.22, 0.30) * rippleLight;

      // --- Dive wavefront accent (stronger later, but always coherent) ---
      float ring = edgeBand * mask * u_wavefrontBoost;
      water += vec3(0.10, 0.16, 0.22) * ring;

      gl_FragColor = vec4(water, sceneCol.a * mask);
    }
  `;

  global.PensieveRippleTransition = { init };
})(window);
