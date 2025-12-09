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
      scaleMax: options.scaleMax ?? 1.06,
      zoomDuration: options.zoomDuration ?? 1200 // ms, slower zoom
    };

    const TWO_PI = Math.PI * 2;

    const state = vials
      .map((el) => {
        const inner = el.querySelector('.vials__vial-inner');
        if (!inner) return null;

        return {
          el,
          inner,
          phase: parseFloat(el.dataset.phase || '0') % 1,
          currentAngle: 0
        };
      })
      .filter(Boolean);

    if (!state.length) return;

    let rect = orbit.getBoundingClientRect();
    let lastTime = 0;
    let animationId = null;

    // global orbit angle, always advancing
    let orbitAngle = 0;

    // orbit / zoom state machine
    let mode = 'orbit'; // 'orbit' | 'zooming' | 'focused'
    let focused = null;

    const zoom = {
      startAngle: 0,
      targetAngle: 0,
      startTime: 0,
      duration: config.zoomDuration
    };

    // ---------- helpers ----------

    function updateBounds() {
      rect = orbit.getBoundingClientRect();
    }

    function normalizeDelta(delta) {
      // map delta to shortest path in [-π, π]
      delta = delta % TWO_PI;
      if (delta > Math.PI) delta -= TWO_PI;
      if (delta < -Math.PI) delta += TWO_PI;
      return delta;
    }

    function applyPosition(s, angle, cx, cy, rx, ry, timeMs, opts = {}) {
      const { el, inner } = s;

      const ex = Math.cos(angle) * rx;
      const ey = Math.sin(angle) * ry;

      // depth: bottom of ellipse = "front"
      const depth = (Math.sin(angle) + 1) / 2;
      const baseScale =
        config.scaleMin + depth * (config.scaleMax - config.scaleMin);

      const extraScale = opts.extraScale ?? 0;
      const breatheEnabled = opts.breathe ?? false;
      const floatEnabled = opts.float ?? false;

      // subtle breathing on scale
      const breatheAmount = breatheEnabled ? 0.02 * Math.sin(timeMs / 260) : 0;
      const scale = baseScale + extraScale + breatheAmount;

      // subtle local float jiggle (around cork-ish)
      let jiggleX = 0;
      let jiggleY = 0;
      let tiltDeg = 0;

      if (floatEnabled) {
        jiggleY = 2 * Math.sin(timeMs / 500);
        jiggleX = 1.2 * Math.sin(timeMs / 780 + 1.3);
        tiltDeg = 1.5 * Math.sin(timeMs / 900 + 0.7);
      }

      // OUTER: place on ellipse
      el.style.transform =
        `translate(${cx + ex}px, ${cy + ey}px) translate(-50%, -50%)`;

      // INNER: float + rotate + scale, pivot near cork
      inner.style.transform =
        `translate(${jiggleX}px, ${jiggleY}px) rotate(${tiltDeg}deg) scale(${scale})`;

      el.style.zIndex = String(10 + Math.round(depth * 10));
      s.currentAngle = angle;
    }

    function requestFocus(vialEl) {
      const targetState = state.find((s) => s.el === vialEl);
      if (!targetState) return;

      // If already focused and clicked again → defocus & resume orbit
      if (mode === 'focused' && focused === targetState) {
        clearFocus();
        return;
      }

      // Ignore new focus while zooming
      if (mode === 'zooming') return;

      // Start zoom-in
      focused = targetState;
      mode = 'zooming';
      orbit.classList.add('vials--zooming');

      const currentAngle =
        focused.currentAngle || (orbitAngle + focused.phase * TWO_PI);

      const targetAngleBase = Math.PI / 2; // bottom/front over basin
      const delta = normalizeDelta(targetAngleBase - currentAngle);

      zoom.startAngle = currentAngle;
      zoom.targetAngle = currentAngle + delta;
      zoom.startTime = performance.now();
    }

    function clearFocus() {
      if (!focused) return;

      // Align focused vial back to orbit smoothly (no snap) by updating its phase
      const angleNow = focused.currentAngle || 0;
      let rawPhase = (angleNow - orbitAngle) / TWO_PI;
      rawPhase = rawPhase % 1;
      if (rawPhase < 0) rawPhase += 1;
      focused.phase = rawPhase;

      focused.el.classList.remove('vials__vial--focused');
      orbit.classList.remove('vials--focused');
      mode = 'orbit';
      focused = null;
    }

    // wire click listeners
    vials.forEach((el) => {
      el.addEventListener('click', () => requestFocus(el));
    });

    // ---------- main animation loop ----------

    function frame(timeMs) {
      if (!lastTime) lastTime = timeMs;
      let dt = (timeMs - lastTime) / 1000;
      if (dt > 0.05) dt = 0.05;
      lastTime = timeMs;

      // orbit angle always moves forward
      orbitAngle = (orbitAngle + config.baseSpeed * dt * TWO_PI) % TWO_PI;

      const width = rect.width;
      const height = rect.height;

      const cx = width / 2;
      const cy = height * 0.42;

      const rx = width * config.radiusXFactor;
      const ry = height * config.radiusYFactor;

      if (mode === 'orbit') {
        // normal orbit: all vials follow the ellipse
        state.forEach((s) => {
          const angle = orbitAngle + s.phase * TWO_PI;
          applyPosition(s, angle, cx, cy, rx, ry, timeMs);
        });
      } else if (mode === 'zooming' && focused) {
        const elapsed = timeMs - zoom.startTime;
        const progress = Math.min(1, elapsed / zoom.duration);
        const eased = (1 - Math.cos(progress * Math.PI)) / 2; // smooth in/out

        const angleFocused =
          zoom.startAngle + (zoom.targetAngle - zoom.startAngle) * eased;

        state.forEach((s) => {
          if (s === focused) {
            // focused vial: slide along ellipse + zoom in
            applyPosition(
              s,
              angleFocused,
              cx,
              cy,
              rx,
              ry,
              timeMs,
              { extraScale: 0.16 * eased }
            );
          } else {
            // others: keep orbiting, so restart never feels "snapped"
            const angle = orbitAngle + s.phase * TWO_PI;
            applyPosition(s, angle, cx, cy, rx, ry, timeMs);
          }
        });

        if (progress >= 1) {
          mode = 'focused';
          orbit.classList.remove('vials--zooming');
          orbit.classList.add('vials--focused');
          focused.el.classList.add('vials__vial--focused');
        }
      } else if (mode === 'focused' && focused) {
        // Focused vial: parked at target angle, breathing + floating
        state.forEach((s) => {
          if (s === focused) {
            const angle = zoom.targetAngle;
            applyPosition(
              s,
              angle,
              cx,
              cy,
              rx,
              ry,
              timeMs,
              { extraScale: 0.16, breathe: true, float: true }
            );
          } else {
            // others still orbit in the background, blurred by CSS
            const angle = orbitAngle + s.phase * TWO_PI;
            applyPosition(s, angle, cx, cy, rx, ry, timeMs);
          }
        });
      }

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
