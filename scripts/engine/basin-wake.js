// scripts/basin-wake.js
(function (global) {
  const DEFAULTS = {
    basinSelector: '#scene-basin',
    phase: { from: 0.18, to: 0.35 },
    easing: easeInOutCubic,
    // Optional: hook a renderer (like basin-incoming) to scale shimmer
    onWake: null, // (p) => void
  };

  function create(userOptions = {}) {
    const cfg = { ...DEFAULTS, ...userOptions };
    const basin = document.querySelector(cfg.basinSelector);
    if (!basin) return null;

    function apply(t) {
      const local = phaseT(t, cfg.phase.from, cfg.phase.to);
      const p = cfg.easing ? cfg.easing(local) : local;

      basin.style.setProperty('--wake', String(p));
      cfg.onWake?.(p);
    }

    function reset() {
      basin.style.setProperty('--wake', '0');
      cfg.onWake?.(0);
    }

    return { apply, reset, cfg };
  }

  function phaseT(t, from, to) {
    if (t <= from) return 0;
    if (t >= to) return 1;
    return (t - from) / (to - from);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  global.PensieveBasinWake = { create };
})(window);
