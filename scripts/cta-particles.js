// scripts/cta-particles.js
// PensieveCtaParticles
// - API-fied CTA particle layer with tunable intensity, count, size, speed, glow
// - Safe lifecycle: create() => { start, stop, destroy, updateConfig, respawn }
//
// Usage:
//   const ctaFx = PensieveCtaParticles.create({
//     ctaSelector: '.page__cta',
//     canvasSelector: '.page__cta-particles',
//     count: 18,
//     intensity: 1.2,    // overall alpha/glow multiplier
//     glow: 1.4,         // shadow alpha multiplier
//     speed: { vx: 0.10, vy: 0.14 }, // base drift magnitudes
//   });
//   ctaFx.start();
//
//   // Later:
//   ctaFx.updateConfig({ count: 8, intensity: 0.7 });
//   ctaFx.respawn();

(function (global) {
  const DEFAULTS = {
    ctaSelector: '.page__cta',
    canvasSelector: '.page__cta-particles',

    // population
    count: 12,

    // visual feel (multipliers)
    intensity: 1.0, // scales particle alpha + glow together
    glow: 1.0,      // scales shadow alpha (extra bloom)

    // alpha base range (before intensity)
    alpha: { base: 0.08, depth: 0.18 },

    // blur (in px) scales with "near" particles
    blur: { max: 3.0 },

    // size model
    radius: {
      base: 0.3,
      depthMul: 0.8,
    },

    // drift model (gentle diagonal upward)
    // vx: random range around 0, vy: negative/upwards
    speed: {
      vx: 0.10, // max horizontal magnitude
      vy: 0.12, // extra upward magnitude
      vyBase: 0.04, // baseline upward
    },

    // depth range (0..1). higher depth => brighter + bigger.
    depth: { min: 0.4, max: 1.0 },

    // wrapping behavior
    wrap: {
      // when particle exits top, respawn at bottom
      respawnOnTop: true,
    },
  };

  function create(userOptions = {}) {
    const cfg = deepMerge(structuredClone(DEFAULTS), userOptions);

    const cta = document.querySelector(cfg.ctaSelector);
    const canvas = document.querySelector(cfg.canvasSelector);

    if (!cta || !canvas || !canvas.getContext) return null;

    const ctx = canvas.getContext('2d');

    const state = {
      running: false,
      animationId: null,
      particles: [],
      dpr: 1,
      width: 0,
      height: 0,
      ro: null,
      onResizeBound: null,
    };

    function setConfig(next = {}) {
      deepMerge(cfg, next);

      // If count changed, respawn to match exactly.
      // (you can choose to not do this automatically; but for “count” it’s intuitive)
      if (typeof next.count === 'number') {
        respawn();
      }
    }

    function resizeCanvas() {
      const rect = cta.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      state.dpr = dpr;
      state.width = rect.width;
      state.height = rect.height;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // keep particles in bounds (or respawn if you prefer)
      if (!state.particles.length) {
        createParticles();
      } else {
        clampParticlesToBounds();
      }
    }

    function clampParticlesToBounds() {
      const w = state.width;
      const h = state.height;
      for (const p of state.particles) {
        if (p.x < -10) p.x = 0;
        if (p.x > w + 10) p.x = w;
        if (p.y < -10) p.y = 0;
        if (p.y > h + 10) p.y = h;
      }
    }

    function createParticles() {
      state.particles = [];
      const n = Math.max(0, Math.floor(cfg.count || 0));
      for (let i = 0; i < n; i++) {
        state.particles.push(createSingleParticle());
      }
    }

    function respawn() {
      createParticles();
    }

    function randRange(min, max) {
      return min + Math.random() * (max - min);
    }

    function createSingleParticle() {
      const w = state.width;
      const h = state.height;

      const depth = randRange(cfg.depth.min, cfg.depth.max); // 0.4–1
      const radius = cfg.radius.base + depth * cfg.radius.depthMul;

      // vx: centered around 0
      const vx = (Math.random() - 0.5) * (cfg.speed.vx * 2);
      // vy: always upward (negative)
      const vy = -(cfg.speed.vyBase + Math.random() * cfg.speed.vy);

      return {
        x: Math.random() * w,
        y: Math.random() * h,
        depth,
        radius,
        vx,
        vy,
      };
    }

    function step() {
      const w = state.width;
      const h = state.height;

      // transparent canvas every frame
      ctx.clearRect(0, 0, w, h);

      const intensity = Math.max(0, cfg.intensity ?? 1);
      const glowMul = Math.max(0, cfg.glow ?? 1);

      for (const p of state.particles) {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap
        if (cfg.wrap.respawnOnTop && p.y + p.radius < 0) {
          p.y = h + p.radius;
          p.x = Math.random() * w;
        }
        if (p.x - p.radius > w) {
          p.x = -p.radius;
        } else if (p.x + p.radius < 0) {
          p.x = w + p.radius;
        }

        const alphaBase = cfg.alpha.base + p.depth * cfg.alpha.depth;
        const alpha = clamp01(alphaBase * intensity);

        const blur = (1 - p.depth) * (cfg.blur.max ?? 3);

        ctx.save();
        ctx.beginPath();

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;

        // shadow glow
        const glowAlpha = clamp01(alpha * 1.5 * glowMul);
        ctx.shadowColor = `rgba(255, 255, 255, ${glowAlpha})`;
        ctx.shadowBlur = blur;

        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      state.animationId = requestAnimationFrame(step);
    }

    function start() {
      if (state.running) return;
      state.running = true;

      // resize observers
      state.ro = new ResizeObserver(resizeCanvas);
      state.ro.observe(cta);

      state.onResizeBound = () => resizeCanvas();
      window.addEventListener('resize', state.onResizeBound);

      resizeCanvas();
      if (!state.particles.length) createParticles();

      state.animationId = requestAnimationFrame(step);
    }

    function stop() {
      state.running = false;
      if (state.animationId !== null) cancelAnimationFrame(state.animationId);
      state.animationId = null;
    }

    function destroy() {
      stop();
      if (state.ro) state.ro.disconnect();
      state.ro = null;

      if (state.onResizeBound) window.removeEventListener('resize', state.onResizeBound);
      state.onResizeBound = null;

      // optional: clear canvas
      ctx.clearRect(0, 0, state.width, state.height);

      // remove any legacy cleanup hook
      canvas._cleanup = null;
    }

    // Backwards compat: keep a cleanup hook on canvas if you like
    canvas._cleanup = destroy;

    // Optional: auto-start if you want to keep old init() behavior.
    // (we do NOT auto-start by default; you choose.)
    return {
      el: { cta, canvas },
      cfg,
      start,
      stop,
      destroy,
      updateConfig: setConfig,
      respawn,
      isRunning: () => state.running,
    };
  }

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const key of Object.keys(source)) {
      const sv = source[key];
      const tv = target[key];
      if (Array.isArray(sv)) target[key] = sv.slice();
      else if (sv && typeof sv === 'object')
        target[key] = deepMerge(tv && typeof tv === 'object' ? tv : {}, sv);
      else if (sv !== undefined) target[key] = sv;
    }
    return target;
  }

  // Keep init() for drop-in compatibility with your original code
  function init(userOptions = {}) {
    const api = create(userOptions);
    api?.start?.();
    return api;
  }

  global.PensieveCtaParticles = { create, init };
})(window);
