// scripts/scene-camera.js
(function (global) {
  const DEFAULTS = {
    stackSelector: '#scene-stack',
    phase: { from: 0.12, to: 0.30 }, // Camera window inside ceremony t (0..1)
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

    // Core setter: p is absolute 0..1 (NOT ceremony t)
    function applyProgress(p, metaT = null) {
      const k = clamp01(p);
      const eased = cfg.easing ? cfg.easing(k) : k;

      const y = travelPx * eased;
      stack.style.setProperty('--camera-y', `${y}px`);

      // onProgress keeps receiving something meaningful
      cfg.onProgress?.(eased, { t: metaT, travelPx });
    }

    // Existing API: uses ceremony t + phase window
    function apply(t) {
      const local = phaseT(t, cfg.phase.from, cfg.phase.to);
      applyProgress(local, t);
    }

    // NEW: animate back smoothly using a simple 0..1 progress
    // p=0 -> fully at basin; p=1 -> back to vials
    function applyReverse(p) {
      const k = clamp01(p);
      applyProgress(1 - k, null);
    }

    function reset() {
      stack.style.setProperty('--camera-y', `0px`);
    }

    return { apply, applyProgress, applyReverse, reset, recalc, cfg };
  }

  function phaseT(t, from, to) {
    if (t <= from) return 0;
    if (t >= to) return 1;
    return (t - from) / (to - from);
  }

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  global.PensieveSceneCamera = { create };
})(window);
