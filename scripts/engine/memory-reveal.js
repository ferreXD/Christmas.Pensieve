// scripts/memory-reveal.js
// PensieveMemoryReveal
// - Generic revealer for ANY element (image/video/text/container)
// - Driven by ceremony tNorm (0..1)
// - Uses opacity + blur + subtle lift + optional mask "shimmer"

(function (global) {
  const DEFAULTS = {
    selector: '.memory-reveal',

    // phase window (0..1) during which reveal progresses
    phase: { from: 0.65, to: 0.80 },

    // base feel
    liftPx: 10,
    blurPx: 10,
    ease: 'cubic', // 'linear' | 'cubic' | 'smoothstep'

    // optional “presence” mask (works for any content)
    // implemented via CSS mask-image where supported, otherwise skipped
    mask: {
      enabled: true,
      kind: 'radial', // 'radial' | 'linear'
      feather: 0.22,  // softness (0..1)
      travel: 0.10,   // how much the mask center drifts during reveal
    },

    edgeBlur: { from: 14, to: 8 },        // px
    edgeMask: { from: 45, to: 60 },       // start radius %
    edgeMaskEnd: { from: 75, to: 86 },    // end radius %
    // clamp for users who scrub phases back/forth
    holdVisibleAfter: true,
  };

  function create(userOptions = {}) {
    const cfg = deepMerge(structuredClone(DEFAULTS), userOptions);

    const el = document.querySelector(cfg.selector);
    if (!el) return null;

    const state = {
      started: false,
      completed: false,
      lastT: 0,
      supportsMask: supportsCssMask(),
      baseTransform: el.style.transform || ''
    };

    // init hidden
    el.dataset.reveal = 'off';
    applyVisual(0);

    function apply(tNorm) {
      state.lastT = tNorm;

      const p = phaseT(tNorm, cfg.phase.from, cfg.phase.to);
      if (p > 0.0001) state.started = true;

      if (cfg.holdVisibleAfter && state.completed) return;

      const eased = ease01(p, cfg.ease);
      if (eased >= 0.999) state.completed = true;

      el.dataset.reveal = eased > 0.001 ? 'on' : 'off';
      applyVisual(eased);
    }

    function reset() {
      state.started = false;
      state.completed = false;
      el.dataset.reveal = 'off';
      clearMask();
      applyVisual(0);
    }

    function stop() {
      // keeps current visual state, but removes mask animation
      clearMask();
    }

    function applyVisual(k) {
      // k: 0..1
      const lift = cfg.liftPx * (1 - k);
      const blur = cfg.blurPx * (1 - k);

      el.style.opacity = String(k);
      
      const base = state.baseTransform ? state.baseTransform + ' ' : '';
      el.style.transform = `${base}translateY(${lift}px) scale(${0.90})`;

      el.style.filter = `blur(${blur}px)`;
    
      // Edge-blur “emerge”: less blur + edge pushed outward as k grows
        if (cfg.edgeBlur) {
        const b = (cfg.edgeBlur.from ?? 14) * (1 - k) + (cfg.edgeBlur.to ?? 8) * k;
        el.style.setProperty('--edge-blur', `${b}px`);
        }

        if (cfg.edgeMask) {
        const s = (cfg.edgeMask.from ?? 45) * (1 - k) + (cfg.edgeMask.to ?? 60) * k;
        el.style.setProperty('--edge-start', `${s}%`);
        }

        if (cfg.edgeMaskEnd) {
        const e = (cfg.edgeMaskEnd.from ?? 75) * (1 - k) + (cfg.edgeMaskEnd.to ?? 86) * k;
        el.style.setProperty('--edge-end', `${e}%`);
        }


      if (cfg.mask?.enabled && state.supportsMask) {
        applyMask(k);
      } else {
        clearMask();
      }
    }

    function applyMask(k) {
      const m = cfg.mask;
      const feather = clamp01(m.feather ?? 0.22);

      // “opening” grows with k
      // keep start slightly open so it doesn’t look like a harsh wipe
      const open = 0.08 + 0.92 * k;

      // gentle drift so it feels alive, not a static fade
      const drift = (m.travel ?? 0.10) * (1 - k);

      if (m.kind === 'linear') {
        // left-to-right soft wipe
        const a = (0.5 - drift) * 100;
        const b = (a + open * 100);
        const f = feather * 100;

        const grad = `linear-gradient(90deg,
          rgba(0,0,0,0) ${Math.max(0, a - f)}%,
          rgba(0,0,0,1) ${a}%,
          rgba(0,0,0,1) ${b}%,
          rgba(0,0,0,0) ${Math.min(100, b + f)}%)`;

        el.style.webkitMaskImage = grad;
        el.style.maskImage = grad;
        el.style.webkitMaskRepeat = 'no-repeat';
        el.style.maskRepeat = 'no-repeat';
      } else {
        // radial “iris” that opens
        const cx = 50 + drift * 100;
        const cy = 55;

        const inner = Math.max(0, (open - feather) * 100);
        const outer = Math.min(100, (open + feather) * 100);

        const grad = `radial-gradient(circle at ${cx}% ${cy}%,
          rgba(0,0,0,1) ${inner}%,
          rgba(0,0,0,0) ${outer}%)`;

        el.style.webkitMaskImage = grad;
        el.style.maskImage = grad;
        el.style.webkitMaskRepeat = 'no-repeat';
        el.style.maskRepeat = 'no-repeat';
      }
    }

    function clearMask() {
      el.style.webkitMaskImage = '';
      el.style.maskImage = '';
      el.style.webkitMaskRepeat = '';
      el.style.maskRepeat = '';
    }

    return { apply, reset, stop, cfg, el };
  }

  function phaseT(t, from, to) {
    if (t <= from) return 0;
    if (t >= to) return 1;
    return (t - from) / (to - from);
  }

  function ease01(t, kind) {
    t = clamp01(t);
    if (kind === 'linear') return t;
    if (kind === 'smoothstep') return t * t * (3 - 2 * t);
    // cubic-ish “ceremonial” ease
    return 1 - Math.pow(1 - t, 3);
  }

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function supportsCssMask() {
    const s = document.documentElement.style;
    return ('maskImage' in s) || ('webkitMaskImage' in s);
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

  global.PensieveMemoryReveal = { create };
})(window);
