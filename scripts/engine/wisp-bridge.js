(function (global) {
  const DEFAULTS = {
    canvasId: 'wisp-bridge',          // reuse your existing travel canvas
    basinSelector: '#scene-basin',
    basinTarget: { x: 0.5, y: 0.55 }, // second layer target (tweak)
    maxWisps: 140,

    // world motion (solemn)
    gravity: 10,          // px/s^2
    attract: 18,          // pull towards basin target
    steer: 0.06,          // soft steering
    noise: 0.65,          // keep it alive
    drag: 0.985,          // slow drift

    // lifetime
    lifeMs: { min: 900, max: 1600 },

    // look
    glowBlur: 9,
  };

  function create(userOptions = {}) {
    const cfg = deepMerge(structuredClone(DEFAULTS), userOptions);
    const canvas = document.getElementById(cfg.canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const state = {
      dpr: window.devicePixelRatio || 1,
      wisps: [],
      raf: null,
      last: 0,
    };

    function resize() {
      state.dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(window.innerWidth * state.dpr));
      canvas.height = Math.max(1, Math.round(window.innerHeight * state.dpr));
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    function clamp01(x){ return x < 0 ? 0 : x > 1 ? 1 : x; }
    function rand(min,max){ return min + Math.random() * (max-min); }

    function getBasinPoint() {
      const basin = document.querySelector(cfg.basinSelector);
      if (!basin) return null;
      const r = basin.getBoundingClientRect();
      return { x: r.left + r.width * cfg.basinTarget.x, y: r.top + r.height * cfg.basinTarget.y };
    }

    // called by vial-threads emission
    function emit(payload) {
      if (state.wisps.length >= cfg.maxWisps) state.wisps.splice(0, 10);

      const life = rand(cfg.lifeMs.min, cfg.lifeMs.max);
      const sp = payload.speed * (0.55 + 0.35 * payload.localPour);

      state.wisps.push({
        x: payload.x,
        y: payload.y,
        vx: Math.cos(payload.angle) * sp,
        vy: Math.sin(payload.angle) * sp,

        angle: payload.angle,
        hue: payload.hue,
        lineWidth: payload.lineWidth,
        alpha: payload.alpha,

        noiseStrength: payload.noiseStrength,
        baseTurnSpeed: payload.baseTurnSpeed,

        born: performance.now(),
        life,
        phase: Math.random() * Math.PI * 2,
      });

      start();
    }

    function start() {
      if (state.raf) return;
      state.last = 0;
      state.raf = requestAnimationFrame(tick);
    }

    function tick(ms) {
      state.raf = requestAnimationFrame(tick);
      if (!state.last) state.last = ms;
      let dt = (ms - state.last) / 1000;
      if (dt > 0.05) dt = 0.05;
      state.last = ms;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const dst = getBasinPoint();
      if (!dst) return;

      const now = ms;

      for (let i = state.wisps.length - 1; i >= 0; i--) {
        const w = state.wisps[i];
        const age = now - w.born;
        if (age >= w.life) { state.wisps.splice(i, 1); continue; }

        const lifeT = 1 - age / w.life;
        const fade = clamp01(lifeT / 0.35) * clamp01((age / w.life) / 0.08);

        // attraction to basin target (soft)
        const dx = dst.x - w.x;
        const dy = dst.y - w.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const ax = (dx / dist) * cfg.attract;
        const ay = (dy / dist) * cfg.attract;

        // noise turn (vial vibe)
        const tSec = ms / 1000;
        const turnNoise =
          (Math.sin(tSec * w.baseTurnSpeed + w.x * 0.01 + w.y * 0.008 + w.phase) +
            (Math.random() - 0.5) * 0.35) *
          0.5 *
          w.noiseStrength *
          cfg.noise;

        w.angle += turnNoise * dt;

        // steer gently toward target direction
        const targetAngle = Math.atan2(dy, dx);
        w.angle = lerpAngle(w.angle, targetAngle, cfg.steer);

        // integrate velocity
        w.vx += (Math.cos(w.angle) * 8 + ax) * dt;
        w.vy += (Math.sin(w.angle) * 8 + ay + cfg.gravity) * dt;

        w.vx *= cfg.drag;
        w.vy *= cfg.drag;

        w.x += w.vx * dt;
        w.y += w.vy * dt;

        // draw short trail (keep it “thread-like”)
        const trail = 10 + 14 * (1 - lifeT);
        const tx = w.x - Math.cos(w.angle) * trail;
        const ty = w.y - Math.sin(w.angle) * trail;

        ctx.save();
        ctx.lineWidth = w.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.shadowBlur = cfg.glowBlur;
        ctx.shadowColor = 'rgba(230,240,255,0.85)';

        const a = w.alpha * fade;
        const grad = ctx.createLinearGradient(w.x, w.y, tx, ty);
        grad.addColorStop(0, `hsla(${w.hue}, 80%, 95%, ${a})`);
        grad.addColorStop(1, `hsla(${w.hue}, 70%, 90%, ${a * 0.25})`);
        ctx.strokeStyle = grad;

        ctx.beginPath();
        ctx.moveTo(w.x, w.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();
      }

      // auto-stop when empty
      if (state.wisps.length === 0) {
        cancelAnimationFrame(state.raf);
        state.raf = null;
      }
    }

    function lerpAngle(a, b, t) {
      const diff = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
      return a + diff * t;
    }

    function deepMerge(target, source) {
      if (!source || typeof source !== 'object') return target;
      for (const k of Object.keys(source)) {
        const sv = source[k];
        const tv = target[k];
        if (Array.isArray(sv)) target[k] = sv.slice();
        else if (sv && typeof sv === 'object') target[k] = deepMerge(tv && typeof tv === 'object' ? tv : {}, sv);
        else if (sv !== undefined) target[k] = sv;
      }
      return target;
    }

    return { emit, resize };
  }

  global.PensieveWispBridge = { create };
})(window);
