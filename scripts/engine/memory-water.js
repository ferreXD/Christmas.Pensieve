// scripts/memory-water.js
// PensieveMemoryWater
// - WebGL refraction shader for memory media (image OR video)
// - Designed to render into the already-positioned #memory-media canvas
//   (i.e., MemoryLayer positions/sizes it to the circle diameter)
// - Masks output to a circle, so only the ring area shows
// - Includes "cover" mapping like object-fit: cover

(function (global) {
  const DEFAULTS = {
    canvasId: 'memory-media',

    // normal map used for refraction
    normalUrl: 'assets/water-normal.jpg',

    // motion
    normalScale: 0.9,
    normalSpeed: 0.015,
    secondLayerStrength: 0.7,
    secondLayerScaleMul: 0.85,
    secondLayerSpeedMul: 0.40,

    // refraction
    refractStrength: 0.03,
    wakeBoost: 0.22, // multiplies refract when wake>0

    // subtle "underwater" grading
    grade: {
      contrast: 1.03,
      brightness: 0.98,
      tint: [0.98, 1.00, 1.04], // tiny cool tint
      alpha: 1.0,              // overall alpha inside circle
    },

    // edge softness (alpha fade near circle boundary)
    edgeFeather: 0.018, // in UV radius units (0..0.5); ~0.015-0.03 looks good

    // image crossOrigin
    crossOrigin: 'anonymous',

    // video defaults
    video: {
      playsInline: true,
      muted: true,
      loop: true,
      autoplay: true,
      preload: 'auto',
    },
  };

  function create(userOptions = {}) {
    const cfg = { ...DEFAULTS, ...userOptions };
    const canvas = document.getElementById(cfg.canvasId);
    if (!canvas) return null;

    const gl =
      canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true }) ||
      canvas.getContext('experimental-webgl');

    if (!gl) {
      console.warn('[PensieveMemoryWater] WebGL not available.');
      return null;
    }

    // --- program ---
    const prog = createProgram(gl, VERT, FRAG);
    gl.useProgram(prog);

    // Fullscreen quad (pos + uv)
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
    const aUv  = gl.getAttribLocation(prog, 'a_uv');
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(aUv,  2, gl.FLOAT, false, 16, 8);

    // uniforms
    const uRes         = gl.getUniformLocation(prog, 'u_res');
    const uTime        = gl.getUniformLocation(prog, 'u_time');
    const uWake        = gl.getUniformLocation(prog, 'u_wake');

    const uMediaSize   = gl.getUniformLocation(prog, 'u_mediaSize');
    const uGradeTint   = gl.getUniformLocation(prog, 'u_gradeTint');
    const uGradeCB     = gl.getUniformLocation(prog, 'u_gradeCB'); // contrast, brightness
    const uAlpha       = gl.getUniformLocation(prog, 'u_alpha');
    const uEdgeFeather = gl.getUniformLocation(prog, 'u_edgeFeather');

    const uNS          = gl.getUniformLocation(prog, 'u_normalScale');
    const uSpeed       = gl.getUniformLocation(prog, 'u_normalSpeed');
    const uSecondStr   = gl.getUniformLocation(prog, 'u_secondStrength');
    const uSecondSMul  = gl.getUniformLocation(prog, 'u_secondScaleMul');
    const uSecondVMul  = gl.getUniformLocation(prog, 'u_secondSpeedMul');

    const uRefract     = gl.getUniformLocation(prog, 'u_refract');
    const uWakeBoost   = gl.getUniformLocation(prog, 'u_wakeBoost');

    // samplers
    const uMedia  = gl.getUniformLocation(prog, 'u_media');
    const uNormal = gl.getUniformLocation(prog, 'u_normal');
    gl.uniform1i(uMedia,  0);
    gl.uniform1i(uNormal, 1);

    // textures
    const texMedia = gl.createTexture();
    const texNormal = gl.createTexture();

    // init fallbacks
    initTexture(gl, texMedia, 0, [0, 0, 0, 255], false);
    initTexture(gl, texNormal, 1, [128, 128, 255, 255], false);

    // load normal map
    loadImageTexture(gl, texNormal, cfg.normalUrl, 1, { crossOrigin: cfg.crossOrigin });

    // state
    const state = {
      raf: null,
      t0: performance.now(),
      wake: 0,
      sourceKind: null,   // 'image'|'video'
      img: null,
      video: null,
      mediaW: 1,
      mediaH: 1,
      mediaReady: false,
      lastVideoFrameMs: 0,
    };

    // ---- sizing ----
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width === w && canvas.height === h) return;

      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }

    // You probably already listen to resize globally, but this is safe.
    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    resize();

    function setWake(p) {
      const n = Number(p);
      state.wake = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
    }

    // ---- media source ----

    function setSource({ kind, src }) {
      // kill previous
      state.mediaReady = false;

      if (state.video) {
        try { state.video.pause(); } catch {}
        state.video.src = '';
        state.video.load?.();
      }
      state.img = null;
      state.video = null;

      state.sourceKind = kind;

      if (kind === 'video') {
        const v = document.createElement('video');

        // CORS NOTE:
        // - For cross-origin video, the server MUST send CORS headers,
        //   otherwise WebGL texImage2D will throw a security error.
        v.crossOrigin = cfg.crossOrigin || 'anonymous';

        v.playsInline = !!cfg.video?.playsInline;
        v.muted       = !!cfg.video?.muted;
        v.loop        = !!cfg.video?.loop;
        v.autoplay    = !!cfg.video?.autoplay;
        v.preload     = cfg.video?.preload ?? 'auto';

        v.src = src;

        v.addEventListener('loadedmetadata', () => {
          state.mediaW = v.videoWidth || 1;
          state.mediaH = v.videoHeight || 1;
        });

        v.addEventListener('canplay', () => {
          state.mediaReady = true;
          // best-effort play
          Promise.resolve().then(() => v.play?.().catch(() => {}));
        });

        state.video = v;

        // create media texture state
        bindTextureUnit(gl, texMedia, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // important: kick load
        v.load?.();
        Promise.resolve().then(() => v.play?.().catch(() => {}));
      } else {
        const img = new Image();
        img.crossOrigin = cfg.crossOrigin || 'anonymous';

        img.onload = () => {
          state.mediaW = img.naturalWidth || 1;
          state.mediaH = img.naturalHeight || 1;
          state.mediaReady = true;

          bindTextureUnit(gl, texMedia, 0);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        };

        img.onerror = () => console.warn('[PensieveMemoryWater] FAILED to load media image:', src);
        img.src = src;
        state.img = img;
      }
    }

    function updateVideoTextureIfNeeded(nowMs) {
      const v = state.video;
      if (!v) return;

      // Throttle a tiny bit to avoid spamming texImage2D on some devices
      // (Still looks smooth because the refraction animates anyway.)
      if (nowMs - state.lastVideoFrameMs < 16) return;

      // readyState: HAVE_CURRENT_DATA (2) or above is enough for texImage2D
      if (v.readyState < 2) return;

      try {
        bindTextureUnit(gl, texMedia, 0);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
        state.lastVideoFrameMs = nowMs;

        // update size if it changed (rare but can happen)
        const vw = v.videoWidth || state.mediaW;
        const vh = v.videoHeight || state.mediaH;
        state.mediaW = vw;
        state.mediaH = vh;

        state.mediaReady = true;
      } catch (e) {
        // Most common: CORS / security error
        // Don’t spam console every frame.
        if (state.mediaReady) {
          state.mediaReady = false;
          console.warn('[PensieveMemoryWater] Video texture update failed (CORS?)', e);
        }
      }
    }

    // ---- render loop ----
    function draw(now) {
      state.raf = requestAnimationFrame(draw);

      resize();

      const t = (now - state.t0) / 1000;

      // If we have video, keep updating the texture
      if (state.sourceKind === 'video') {
        updateVideoTextureIfNeeded(now);
      }

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uWake, state.wake);

      gl.uniform2f(uMediaSize, state.mediaW, state.mediaH);

      const g = cfg.grade || {};
      const tint = g.tint || [1, 1, 1];
      gl.uniform3f(uGradeTint, tint[0], tint[1], tint[2]);

      const contrast = g.contrast ?? 1.0;
      const brightness = g.brightness ?? 1.0;
      gl.uniform2f(uGradeCB, contrast, brightness);

      gl.uniform1f(uAlpha, g.alpha ?? 1.0);
      gl.uniform1f(uEdgeFeather, cfg.edgeFeather ?? 0.018);

      gl.uniform1f(uNS, cfg.normalScale);
      gl.uniform1f(uSpeed, cfg.normalSpeed);
      gl.uniform1f(uSecondStr, cfg.secondLayerStrength);
      gl.uniform1f(uSecondSMul, cfg.secondLayerScaleMul);
      gl.uniform1f(uSecondVMul, cfg.secondLayerSpeedMul);

      gl.uniform1f(uRefract, cfg.refractStrength);
      gl.uniform1f(uWakeBoost, cfg.wakeBoost);

      // If media not ready yet, draw nothing (transparent)
      // We do it in shader by alpha=0, but easiest is just clear.
      if (!state.mediaReady) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function start() {
      if (state.raf != null) return;
      state.raf = requestAnimationFrame(draw);
    }

    function stop() {
      if (state.raf == null) return;
      cancelAnimationFrame(state.raf);
      state.raf = null;
    }

    function destroy() {
      stop();
      window.removeEventListener('resize', onResize);
      // (Optional: delete textures/program/buffers)
    }

    // Auto-start (you can keep it off if you want)
    start();

    return { start, stop, resize, destroy, setWake, setSource, cfg };
  }

  // ---------- GL helpers ----------

  function bindTextureUnit(gl, tex, unitIndex) {
    gl.activeTexture(unitIndex === 0 ? gl.TEXTURE0 : gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  function initTexture(gl, tex, unitIndex, fallbackRGBA, flipY) {
    bindTextureUnit(gl, tex, unitIndex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
      gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array(fallbackRGBA)
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  function loadImageTexture(gl, tex, url, unitIndex, opt = {}) {
    const img = new Image();
    if (opt.crossOrigin) img.crossOrigin = opt.crossOrigin;

    img.onload = () => {
      bindTextureUnit(gl, tex, unitIndex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };

    img.onerror = () => console.warn('[PensieveMemoryWater] FAILED to load', url);
    img.src = url;
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

  // ---------- Shaders ----------

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

    uniform sampler2D u_media;
    uniform sampler2D u_normal;

    uniform vec2 u_res;
    uniform float u_time;
    uniform float u_wake;

    uniform vec2 u_mediaSize;

    uniform float u_normalScale;
    uniform float u_normalSpeed;
    uniform float u_secondStrength;
    uniform float u_secondScaleMul;
    uniform float u_secondSpeedMul;

    uniform float u_refract;
    uniform float u_wakeBoost;

    uniform vec3 u_gradeTint;
    uniform vec2 u_gradeCB;   // x=contrast, y=brightness
    uniform float u_alpha;
    uniform float u_edgeFeather;

    vec3 applyContrast(vec3 c, float k) {
      return (c - 0.5) * k + 0.5;
    }

    // Object-fit: cover mapping from canvas uv -> media uv
    vec2 coverUv(vec2 uv, vec2 canvasSize, vec2 mediaSize) {
      float ca = canvasSize.x / max(1.0, canvasSize.y);
      float ma = mediaSize.x / max(1.0, mediaSize.y);

      vec2 s = vec2(1.0);
      // If media is wider than canvas, zoom X; else zoom Y
      if (ma > ca) {
        s.x = ma / ca;
        s.y = 1.0;
      } else {
        s.x = 1.0;
        s.y = ca / ma;
      }

      vec2 outUv = (uv - 0.5) * s + 0.5;
      return clamp(outUv, 0.0, 1.0);
    }

    void main() {
      vec2 uv = v_uv;

      // circle mask (canvas is a square or circle, but we enforce a perfect circle)
      vec2 d = uv - vec2(0.5);
      float dist = length(d);

      float r = 0.5;
      float feather = max(0.0001, u_edgeFeather);
      float edge = smoothstep(r, r - feather, dist); // 1 inside, 0 outside

      // normal sampling (two layers like basin-water vibe)
      vec2 nUv1 = uv * u_normalScale
        + vec2(u_time * u_normalSpeed, u_time * (u_normalSpeed * 0.6));

      vec2 nUv2 = uv * (u_normalScale * u_secondScaleMul)
        + vec2(-u_time * (u_normalSpeed * 0.45 * u_secondSpeedMul),
                u_time * (u_normalSpeed * 0.35 * u_secondSpeedMul));

      vec3 n1 = texture2D(u_normal, nUv1).rgb * 2.0 - 1.0;
      vec3 n2 = texture2D(u_normal, nUv2).rgb * 2.0 - 1.0;

      vec2 n = normalize(n1.xy + n2.xy * u_secondStrength);

      // refract strength + wake
      float wakeGain = 1.0 + u_wake * u_wakeBoost;
      float refr = u_refract * wakeGain;

      // compute cover uv for media
      vec2 mUv = coverUv(uv, u_res, u_mediaSize);

      // refracted uv
      vec2 duv = mUv + n * refr;

      // sample
      vec3 col = texture2D(u_media, duv).rgb;

      // grade
      col = applyContrast(col, u_gradeCB.x);
      col *= u_gradeCB.y;
      col *= u_gradeTint;

      // output alpha inside circle only
      float a = edge * u_alpha;
      gl_FragColor = vec4(col, a);
    }
  `;

  global.PensieveMemoryWater = { create };
})(window);
