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
      zoomDuration: options.zoomDuration ?? 1200 // ms
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
          currentAngle: 0,
          zoomStartAngle: 0,
          zoomDelta: 0
        };
      })
      .filter(Boolean);

    if (!state.length) return;

    let rect = orbit.getBoundingClientRect();
    let lastTime = 0;
    let animationId = null;

    // global orbit angle, used in orbit mode and for phase realignment
    let orbitAngle = 0;

    // modes: 'orbit' | 'zooming' | 'focused'
    let mode = 'orbit';
    let focused = null;

    const zoom = {
      startTime: 0,
      duration: config.zoomDuration,
      direction: 1 // +1 or -1
    };

    // --------- helpers ---------

    function updateBounds() {
      rect = orbit.getBoundingClientRect();
    }

    function normalizeDelta(delta) {
      delta = delta % TWO_PI;
      if (delta > Math.PI) delta -= TWO_PI;
      if (delta < -Math.PI) delta += TWO_PI;
      return delta;
    }

    // distance from `from` to `to` along a given direction (+1 or -1),
    // always non-negative, in [0, 2π]
    function directionalDistance(from, to, dir) {
      let diff = normalizeDelta(to - from);
      if (dir > 0) {
        if (diff < 0) diff += TWO_PI;
      } else {
        if (diff > 0) diff -= TWO_PI;
        diff = -diff; // make positive distance in direction -
      }
      return diff;
    }

    // delta from from→to constrained to a given direction:
    // for dir>0, result in [0, 2π]; for dir<0, result in [-2π, 0]
    function directionalDelta(from, to, dir) {
      let diff = to - from;
      diff = diff % TWO_PI;

      if (dir > 0) {
        while (diff < 0) diff += TWO_PI;
        while (diff > TWO_PI) diff -= TWO_PI;
      } else {
        while (diff > 0) diff -= TWO_PI;
        while (diff < -TWO_PI) diff += TWO_PI;
      }
      return diff;
    }

    function applyPosition(s, angle, cx, cy, rx, ry, timeMs, opts = {}) {
      const { el, inner } = s;

      const ex = Math.cos(angle) * rx;
      const ey = Math.sin(angle) * ry;

      const depth = (Math.sin(angle) + 1) / 2;
      const baseScale =
        config.scaleMin + depth * (config.scaleMax - config.scaleMin);

      const extraScale = opts.extraScale ?? 0;
      const breatheEnabled = opts.breathe ?? false;
      const floatEnabled = opts.float ?? false;

      const breatheAmount = breatheEnabled ? 0.02 * Math.sin(timeMs / 260) : 0;
      const scale = baseScale + extraScale + breatheAmount;

      let jiggleX = 0;
      let jiggleY = 0;
      let tiltDeg = 0;

      if (floatEnabled) {
        jiggleY = 2 * Math.sin(timeMs / 500);
        jiggleX = 1.2 * Math.sin(timeMs / 780 + 1.3);
        tiltDeg = 1.5 * Math.sin(timeMs / 900 + 0.7);
      }

      // OUTER: orbit position
      el.style.transform =
        `translate(${cx + ex}px, ${cy + ey}px) translate(-50%, -50%)`;

      // INNER: local jiggle/tilt/scale around cork
      inner.style.transform =
        `translate(${jiggleX}px, ${jiggleY}px) rotate(${tiltDeg}deg) scale(${scale})`;

      el.style.zIndex = String(10 + Math.round(depth * 10));
      s.currentAngle = angle;
    }

    function requestFocus(vialEl, target) {
      const targetState = state.find((s) => s.el === vialEl);
      if (!targetState) return;

      // If already focused and clicked again → defocus & resume orbit
      if (mode === 'focused' && focused === targetState) {
        // If target is the cork itself, ignore to allow cork click handling
        if (target?.closest('[data-part="cork"]')) return;

        clearFocus();
        return;
      }

      // Ignore while zooming
      if (mode === 'zooming') return;

      focused = targetState;
      mode = 'zooming';
      orbit.classList.add('vials--zooming');

      // 1) recompute current orbit angle for all vials
      state.forEach((s) => {
        const angleNow = orbitAngle + s.phase * TWO_PI;
        s.currentAngle = angleNow;
      });

      const focusedAngle = focused.currentAngle;

      // 2) decide target angle for focused vial and global direction
      const baseTarget = Math.PI / 2; // front center over basin
      const shortest = normalizeDelta(baseTarget - focusedAngle);
      const dir = shortest >= 0 ? 1 : -1 || 1; // sign, default to +1
      zoom.direction = dir;

      const focusedTargetAngle = focusedAngle + shortest;

      // 3) order vials along this direction starting from focused
      const ordered = [...state].sort((a, b) => {
        if (a === focused) return -1;
        if (b === focused) return 1;

        const da = directionalDistance(focusedAngle, a.currentAngle, dir);
        const db = directionalDistance(focusedAngle, b.currentAngle, dir);
        return da - db;
      });

      // 4) assign evenly spaced cluster angles following that order
      //    offset 0 for focused, then +120°, +240° along direction
      ordered.forEach((s, index) => {
        const offset = dir * (index * (TWO_PI / 3));
        const targetAngle = focusedTargetAngle + offset;

        const start = s.currentAngle;
        const delta = directionalDelta(start, targetAngle, dir);

        s.zoomStartAngle = start;
        s.zoomDelta = delta;
      });

      zoom.startTime = performance.now();
    }

    function clearFocus() {
      if (!focused) return;

      // re-align phases for ALL vials to their current cluster angles
      state.forEach((s) => {
        const angleNow = s.currentAngle || 0;
        let rawPhase = (angleNow - orbitAngle) / TWO_PI;
        rawPhase = rawPhase % 1;
        if (rawPhase < 0) rawPhase += 1;
        s.phase = rawPhase;
      });

      focused.el.classList.remove('vials__vial--focused');
      orbit.classList.remove('vials--focused');
      orbit.classList.remove('vials--zooming');

      mode = 'orbit';
      focused = null;
    }

    // click handlers
    vials.forEach((el) => {
      el.addEventListener('click', (event) => requestFocus(el, event.target));
    });

    // --------- main loop ---------

    function frame(timeMs) {
      if (!lastTime) lastTime = timeMs;
      let dt = (timeMs - lastTime) / 1000;
      if (dt > 0.05) dt = 0.05;
      lastTime = timeMs;

      // orbitAngle always advances (used when we return to orbit)
      orbitAngle = (orbitAngle + config.baseSpeed * dt * TWO_PI) % TWO_PI;

      const width = rect.width;
      const height = rect.height;

      const cx = width / 2;
      const cy = height * 0.42;

      const rx = width * config.radiusXFactor;
      const ry = height * config.radiusYFactor;

      if (mode === 'orbit') {
        // normal orbit: equal spacing via phase
        state.forEach((s) => {
          const angle = orbitAngle + s.phase * TWO_PI;
          applyPosition(s, angle, cx, cy, rx, ry, timeMs);
        });
      } else if (mode === 'zooming' && focused) {
        const elapsed = timeMs - zoom.startTime;
        const progress = Math.min(1, elapsed / zoom.duration);
        const eased = (1 - Math.cos(progress * Math.PI)) / 2;

        state.forEach((s) => {
          const angle = s.zoomStartAngle + s.zoomDelta * eased;

          if (s === focused) {
            applyPosition(
              s,
              angle,
              cx,
              cy,
              rx,
              ry,
              timeMs,
              { extraScale: 0.16 * eased }
            );
          } else {
            applyPosition(s, angle, cx, cy, rx, ry, timeMs);
          }
        });

        if (progress >= 1) {
          // cluster locked in place
          state.forEach((s) => {
            const finalAngle = s.zoomStartAngle + s.zoomDelta;
            s.currentAngle = finalAngle;
          });

          mode = 'focused';
          orbit.classList.remove('vials--zooming');
          orbit.classList.add('vials--focused');
          focused.el.classList.add('vials__vial--focused');
        }
      } else if (mode === 'focused' && focused) {
        // keep cluster frozen; focused one floats/breathes
        state.forEach((s) => {
          const angle = s.currentAngle;

          if (s === focused) {
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
