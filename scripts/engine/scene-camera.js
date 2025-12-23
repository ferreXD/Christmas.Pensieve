// scripts/scene-camera.js
(function (global) {
  const DEFAULTS = {
    stackSelector: '#scene-stack',
    phase: { from: 0.12, to: 0.30 },
    easing: easeInOutCubic,
    travelScreens: 1,
    onProgress: null,
  };

  function create(userOptions = {}) {
    const cfg = { ...DEFAULTS, ...userOptions };
    const stack = document.querySelector(cfg.stackSelector);
    if (!stack) return null;

    let travelPx = 0;

    function getViewportHeight() {
      // Visual viewport = what the user actually sees (mobile Chrome navbars, etc.)
      const vv = window.visualViewport;
      const h =
        (vv && vv.height) ||
        document.documentElement.clientHeight ||
        window.innerHeight ||
        0;

      return Math.max(1, Math.round(h));
    }

    function recalc() {
      travelPx = getViewportHeight() * cfg.travelScreens;
    }

    // initial calc
    recalc();

    // Important: mobile UI changes trigger these
    window.addEventListener('resize', recalc, { passive: true });

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', recalc, { passive: true });
      vv.addEventListener('scroll', recalc, { passive: true });
    }

    // Core setter: p is absolute 0..1 (NOT ceremony t)
    function applyProgress(p, metaT = null) {
      // Recalc every tick to track navbar collapse/expand during the animation.
      // Cheap operation, huge stability win.
      recalc();

      const k = clamp01(p);
      const eased = cfg.easing ? cfg.easing(k) : k;

      const y = travelPx * eased;
      stack.style.setProperty('--camera-y', `${y}px`);

      cfg.onProgress?.(eased, { t: metaT, travelPx });
    }

    function apply(t) {
      const local = phaseT(t, cfg.phase.from, cfg.phase.to);
      applyProgress(local, t);
    }

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
