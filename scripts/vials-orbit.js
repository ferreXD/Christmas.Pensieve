// scripts/vials-orbit.js
(function (global) {
  function init(selector = '#vials-orbit', options = {}) {
    const orbit = document.querySelector(selector);
    if (!orbit) return;

    const vials = Array.from(orbit.querySelectorAll('.vials__vial'));
    if (!vials.length) return;

    const config = {
      radiusXFactor: options.radiusXFactor ?? 0.34,
      radiusYFactor: options.radiusYFactor ?? 0.18,
      baseSpeed: options.baseSpeed ?? 0.12,
      scaleMin: options.scaleMin ?? 0.72,
      scaleMax: options.scaleMax ?? 1.06
    };

    const state = vials
      .map((el) => {
        const inner = el.querySelector('.vials__vial-inner');
        if (!inner) return null;

        return {
          el,
          inner,
          phase: parseFloat(el.dataset.phase || '0') % 1
        };
      })
      .filter(Boolean);

    if (!state.length) return;

    let rect = orbit.getBoundingClientRect();
    let lastTime = 0;
    let animationId = null;

    function updateBounds() {
      rect = orbit.getBoundingClientRect();
    }

    function frame(timeMs) {
      if (!lastTime) lastTime = timeMs;
      let dt = (timeMs - lastTime) / 1000;
      if (dt > 0.05) dt = 0.05;
      lastTime = timeMs;

      const t = timeMs / 1000;
      const globalAngle = t * config.baseSpeed * Math.PI * 2;

      const width = rect.width;
      const height = rect.height;

      // Shared ellipse center
      const cx = width / 2;
      const cy = height * 0.42;

      const rx = width * config.radiusXFactor;
      const ry = height * config.radiusYFactor;

      state.forEach((s) => {
        const { el, inner, phase } = s;

        const angle = globalAngle + phase * Math.PI * 2;

        const ex = Math.cos(angle) * rx;
        const ey = Math.sin(angle) * ry;

        // depth 0 (back) -> 1 (front)
        const depth = (Math.sin(angle) + 1) / 2;
        const scale =
          config.scaleMin + depth * (config.scaleMax - config.scaleMin);

        // OUTER: only position on ellipse
        el.style.transform =
          `translate(${cx + ex}px, ${cy + ey}px) translate(-50%, -50%)`;

        // INNER: only scale by depth
        inner.style.transform = `scale(${scale})`;

        el.style.zIndex = String(10 + Math.round(depth * 10));
      });

      animationId = requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(updateBounds);
    ro.observe(orbit);
    updateBounds();

    animationId = requestAnimationFrame(frame);

    orbit._cleanupOrbit = () => {
      if (animationId !== null) cancelAnimationFrame(animationId);
      ro.disconnect();
    };
  }

  global.PensieveVialsOrbit = { init };
})(window);
