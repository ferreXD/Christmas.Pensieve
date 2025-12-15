// scripts/ceremony-clock.js
(function (global) {
  const DEFAULTS = {
    totalDurationMs: 3600,
    easing: easeInOutCubic,
    onUpdate: null, // ({ t, elapsedMs }) => void
    onEnd: null,    // () => void
  };

  function create(userOptions = {}) {
    const cfg = { ...DEFAULTS, ...userOptions };

    let rafId = null;
    let start = 0;
    let running = false;

    function startClock() {
      if (running) return;
      running = true;
      start = performance.now();

      const tick = (now) => {
        const elapsed = now - start;
        const rawT = clamp01(elapsed / cfg.totalDurationMs);
        const t = cfg.easing ? cfg.easing(rawT) : rawT;

        cfg.onUpdate?.({ t, rawT, elapsedMs: elapsed });

        if (rawT >= 1) {
          running = false;
          rafId = null;
          cfg.onEnd?.();
          return;
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    }

    function stopClock() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      running = false;
    }

    function isRunning() {
      return running;
    }

    return { start: startClock, stop: stopClock, isRunning };
  }

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  global.CeremonyClock = { create };
})(window);
