// scripts/scene-camera.js
(function (global) {
  const DEFAULTS = {
    stackSelector: '#scene-stack',
    phase: { from: 0.12, to: 0.30 }, // Camera window
    easing: easeInOutCubic,
    travelScreens: 1, // 1 viewport down
    onProgress: null, // (p, { t, travelPx }) => void
  };

  function create(userOptions = {}) {
    const cfg = { ...DEFAULTS, ...userOptions };
    const stack = document.querySelector(cfg.stackSelector);
    if (!stack) return null;

    let travelPx = window.innerHeight * cfg.travelScreens;

    function recalc() {
      travelPx = window.innerHeight * cfg.travelScreens;
    }

    window.addEventListener('resize', recalc);

    function apply(t) {
      const local = phaseT(t, cfg.phase.from, cfg.phase.to);
      const p = cfg.easing ? cfg.easing(local) : local;

      const y = travelPx * p;
      stack.style.setProperty('--camera-y', `${y}px`);

      cfg.onProgress?.(p, { t, travelPx });
    }

    function reset() {
      stack.style.setProperty('--camera-y', `0px`);
    }

    return { apply, reset, recalc, cfg };
  }

  function phaseT(t, from, to) {
    if (t <= from) return 0;
    if (t >= to) return 1;
    return (t - from) / (to - from);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  global.PensieveSceneCamera = { create };
})(window);
