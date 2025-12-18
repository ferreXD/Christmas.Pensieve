// scripts/vial-threads.js (DROP-IN replacement)
// - Adds per-wisp staggered pour (independent threads)
// - Makes pour slower / solemn / wavier (less “everyone accelerates at once”)
// - Keeps your existing API: PensieveVialThreads.init('.vial', config)
// - Keeps _threadsController.setPour(p) used by PensieveVialPour
//
// NEW in this patch:
// - Emits “egress” wisps into world coordinates (page space) when they reach the vial bottom while pouring
// - You can bridge these into a second-layer canvas (e.g., PensieveWispBridge.emit)
//   via config.egress.onEmit(payload)

(function (global) {
  function init(selector = '.vial', userConfig = {}) {
    const vials = Array.from(document.querySelectorAll(selector));
    if (!vials.length) return;

    const config = buildConfig(userConfig);
    vials.forEach((vialEl) => setupVial(vialEl, config));
  }

  const defaultConfig = {
    view: { width: 70, height: 190 },

    wispCount: 5,
    segmentCount: { min: 10, max: 14 },
    segmentLengthFactor: 0.015,

    // idle motion
    speed: { min: 10, max: 20 },
    baseTurnSpeed: { min: 0.6, max: 0.7 },
    noiseStrength: { min: 0.8, max: 1.3 },

    // look
    baseAlpha: { min: 0.45, max: 0.7 },
    lineWidth: { min: 0.9, max: 1.5 },
    hue: { min: 200, max: 225 },

    // pour feel
    pour: {
      offsetMax: 0.45,
      spanMin: 0.55,
      spanMax: 0.9,

      gravity: 16,
      speedMul: 0.22,
      steer: 0.035,

      pourNoiseDampen: 0.35,

      fadeZone: 0.18,
    },

    // NEW: export wisps to world space (for the “travel to second layer” vibe)
    egress: {
      enabled: false,

      // bottom zone of the vial interior (portion of inner height)
      emitZone: 0.10,

      // safety caps
      maxPerFrame: 3,
      cooldownMs: 120,

      // function(payload) {}
      onEmit: null,
    },
  };

  function buildConfig(userConfig) {
    return {
      ...defaultConfig,
      ...userConfig,
      view: { ...defaultConfig.view, ...(userConfig.view || {}) },
      segmentCount: {
        ...defaultConfig.segmentCount,
        ...(userConfig.segmentCount || {}),
      },
      speed: { ...defaultConfig.speed, ...(userConfig.speed || {}) },
      baseTurnSpeed: {
        ...defaultConfig.baseTurnSpeed,
        ...(userConfig.baseTurnSpeed || {}),
      },
      noiseStrength: {
        ...defaultConfig.noiseStrength,
        ...(userConfig.noiseStrength || {}),
      },
      baseAlpha: {
        ...defaultConfig.baseAlpha,
        ...(userConfig.baseAlpha || {}),
      },
      lineWidth: {
        ...defaultConfig.lineWidth,
        ...(userConfig.lineWidth || {}),
      },
      hue: { ...defaultConfig.hue, ...(userConfig.hue || {}) },
      pour: { ...defaultConfig.pour, ...(userConfig.pour || {}) },
      egress: { ...defaultConfig.egress, ...(userConfig.egress || {}) },
    };
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function randIntRange(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  function lerpAngle(a, b, t) {
    // shortest-angle interpolation
    const diff = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
    return a + diff * t;
  }

  function setupVial(vialEl, config) {
    const canvas = vialEl.querySelector('.vial__threads');
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const view = config.view;
    const widthView = view.width;
    const heightView = view.height;

    // Inner region in viewBox space
    const inner = {
      left: widthView * 0.33,
      right: widthView * 0.67,
      top: heightView * 0.24,
      bottom: heightView * 0.85,
    };
    inner.width = inner.right - inner.left;
    inner.height = inner.bottom - inner.top;

    // Lock logical canvas size to viewBox
    canvas.width = widthView * dpr;
    canvas.height = heightView * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let lastTime = 0;
    let animationId = null;

    const wisps = createWisps(inner, config);

    const state = {
      pour: 0, // 0..1 driven by ceremony (global)
    };

    // Control surface used by PensieveVialPour
    vialEl._threadsController = {
      setPour(p) {
        const n = Number(p);
        state.pour = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
      },
    };

    function createWisps(inner, cfg) {
      const result = [];
      const count = cfg.wispCount;

      for (let i = 0; i < count; i++) {
        const startX = inner.left + 4 + Math.random() * (inner.width - 8);
        const startY = inner.top + 4 + Math.random() * (inner.height - 8);

        const segmentCount = randIntRange(cfg.segmentCount.min, cfg.segmentCount.max);
        const segmentLength = inner.height * cfg.segmentLengthFactor;

        const points = [];
        for (let j = 0; j < segmentCount; j++) {
          points.push({
            x: startX,
            y: startY + j * (segmentLength * 0.8),
          });
        }

        const head = points[0];

        const pourOffset = Math.random() * cfg.pour.offsetMax;
        const pourSpan = randRange(cfg.pour.spanMin, cfg.pour.spanMax);

        result.push({
          points,
          head,
          segmentLength,
          angle: Math.random() * Math.PI * 2,

          baseTurnSpeed: randRange(cfg.baseTurnSpeed.min, cfg.baseTurnSpeed.max),
          noiseStrength: randRange(cfg.noiseStrength.min, cfg.noiseStrength.max),
          speed: randRange(cfg.speed.min, cfg.speed.max),

          baseAlpha: randRange(cfg.baseAlpha.min, cfg.baseAlpha.max),
          lineWidth: randRange(cfg.lineWidth.min, cfg.lineWidth.max),
          hue: randRange(cfg.hue.min, cfg.hue.max),

          pourOffset,
          pourSpan,
          localPour: 0,

          // NEW: per-wisp emission cooldown
          _lastEmitMs: 0,
        });
      }

      return result;
    }

    function clampInside(p, inner) {
      const marginX = 1.5;
      const marginY = 2.5;
      if (p.x < inner.left + marginX) p.x = inner.left + marginX;
      if (p.x > inner.right - marginX) p.x = inner.right - marginX;
      if (p.y < inner.top + marginY) p.y = inner.top + marginY;
      if (p.y > inner.bottom - marginY) p.y = inner.bottom - marginY;
    }

    function updateWisps(dt, tSec) {
      const gPour = state.pour;

      for (const wisp of wisps) {
        const { head } = wisp;

        const localPour = clamp01((gPour - wisp.pourOffset) / wisp.pourSpan);
        wisp.localPour = localPour;

        const calm = 1 - localPour * config.pour.pourNoiseDampen;

        const turnNoise =
          (Math.sin(tSec * wisp.baseTurnSpeed + head.x * 0.1 + head.y * 0.07) +
            (Math.random() - 0.5) * 0.6) *
          0.5 *
          wisp.noiseStrength *
          calm;

        wisp.angle += turnNoise * dt;

        const speedMul = 1 + localPour * config.pour.speedMul;
        const gravity = localPour * config.pour.gravity;

        head.x += Math.cos(wisp.angle) * wisp.speed * speedMul * dt;
        head.y += Math.sin(wisp.angle) * wisp.speed * speedMul * dt;

        head.y += gravity * dt;

        const targetAngle = Math.PI / 2;
        const steer = localPour * config.pour.steer;
        wisp.angle = lerpAngle(wisp.angle, targetAngle, steer);

        let bounced = false;
        if (head.x < inner.left + 2) {
          head.x = inner.left + 2;
          wisp.angle = Math.PI - wisp.angle;
          bounced = true;
        } else if (head.x > inner.right - 2) {
          head.x = inner.right - 2;
          wisp.angle = Math.PI - wisp.angle;
          bounced = true;
        }
        if (head.y < inner.top + 3) {
          head.y = inner.top + 3;
          wisp.angle = -wisp.angle;
          bounced = true;
        } else if (head.y > inner.bottom - 3) {
          head.y = inner.bottom - 3;
          wisp.angle = -wisp.angle;
          bounced = true;
        }

        if (bounced) {
          wisp.angle += (Math.random() - 0.5) * 0.6;
        }

        clampInside(head, inner);

        // follow chain
        const pts = wisp.points;
        const targetLen = wisp.segmentLength;

        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1];
          const curr = pts[i];

          const dx = curr.x - prev.x;
          const dy = curr.y - prev.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;

          const desiredX = prev.x + (dx / dist) * targetLen;
          const desiredY = prev.y + (dy / dist) * targetLen;

          const followStrength = 10 - localPour * 1.5;

          curr.x += (desiredX - curr.x) * followStrength * dt;
          curr.y += (desiredY - curr.y) * followStrength * dt;

          clampInside(curr, inner);
        }
      }
    }

    // NEW: world-space emission when head reaches bottom zone while pouring
    function maybeEmit(timeMs) {
      const eg = config.egress;
      if (!eg || !eg.enabled || typeof eg.onEmit !== 'function') return;

      const gPour = state.pour;
      if (gPour <= 0.001) return;

      const emitZoneStart = inner.bottom - inner.height * (eg.emitZone ?? 0.1);
      const maxPerFrame = eg.maxPerFrame ?? 3;
      const cooldownMs = eg.cooldownMs ?? 120;

      const rect = canvas.getBoundingClientRect();

      let emitted = 0;
      for (const wisp of wisps) {
        if (emitted >= maxPerFrame) break;

        const localPour = wisp.localPour;
        if (localPour <= 0.001) continue;

        const head = wisp.points[0];
        if (head.y < emitZoneStart) continue;

        if (timeMs - wisp._lastEmitMs < cooldownMs) continue;
        wisp._lastEmitMs = timeMs;
        emitted++;

        // map vial-view coords (0..70,0..190) to page coords
        const nx = head.x / widthView;
        const ny = head.y / heightView;
        const worldX = rect.left + rect.width * nx;
        const worldY = rect.top + rect.height * ny;

        eg.onEmit({
          x: worldX,
          y: worldY,

          hue: wisp.hue,
          lineWidth: wisp.lineWidth,
          alpha: wisp.baseAlpha * 0.9,

          angle: wisp.angle,
          speed: wisp.speed,
          noiseStrength: wisp.noiseStrength,
          baseTurnSpeed: wisp.baseTurnSpeed,

          localPour,
        });
      }
    }

    function drawFrame(timeMs) {
      if (!lastTime) lastTime = timeMs;
      let dt = (timeMs - lastTime) / 1000;
      if (dt > 0.05) dt = 0.05;
      lastTime = timeMs;

      const tSec = timeMs / 1000;

      ctx.clearRect(0, 0, widthView, heightView);

      // Clip to vial interior
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(inner.left, inner.top + 10);
      ctx.quadraticCurveTo(inner.left, inner.top, inner.left + 5, inner.top - 4);
      ctx.lineTo(inner.right - 5, inner.top - 4);
      ctx.quadraticCurveTo(inner.right, inner.top, inner.right, inner.top + 10);
      ctx.lineTo(inner.right, inner.bottom - 6);
      ctx.quadraticCurveTo(
        (inner.left + inner.right) / 2,
        inner.bottom + 10,
        inner.left,
        inner.bottom - 6
      );
      ctx.closePath();
      ctx.clip();

      // subtle haze
      const centerX = (inner.left + inner.right) / 2;
      const centerY = inner.top + inner.height * 0.55;
      const haze = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        inner.height * 0.7
      );
      haze.addColorStop(0, 'rgba(255,255,255,0.14)');
      haze.addColorStop(0.4, 'rgba(255,255,255,0.06)');
      haze.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = haze;
      ctx.fillRect(inner.left, inner.top, inner.width, inner.height);

      updateWisps(dt, tSec);

      // NEW: export a few wisps to world-space travel layer
      maybeEmit(timeMs);

      const fadeZoneStart = inner.bottom - inner.height * config.pour.fadeZone;

      for (const wisp of wisps) {
        const pts = wisp.points;

        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }

        const localPour = wisp.localPour;

        const headY = pts[0].y;
        const fadeT = clamp01((headY - fadeZoneStart) / (inner.bottom - fadeZoneStart));
        const pourFade = 1 - fadeT * localPour;

        const headAlpha = wisp.baseAlpha * pourFade;
        const tailAlpha = wisp.baseAlpha * 0.4 * pourFade;

        const grad = ctx.createLinearGradient(
          pts[0].x,
          pts[0].y,
          pts[pts.length - 1].x,
          pts[pts.length - 1].y
        );
        grad.addColorStop(0, `hsla(${wisp.hue}, 80%, 95%, ${headAlpha})`);
        grad.addColorStop(1, `hsla(${wisp.hue}, 70%, 90%, ${tailAlpha})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = wisp.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const glowDampen = 1 - localPour * 0.35;
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 7 * glowDampen;

        ctx.stroke();
      }

      ctx.restore();
      animationId = requestAnimationFrame(drawFrame);
    }

    function start() {
      if (animationId !== null) cancelAnimationFrame(animationId);
      lastTime = 0;
      animationId = requestAnimationFrame(drawFrame);
    }

    start();

    canvas._cleanupThreads = () => {
      if (animationId !== null) cancelAnimationFrame(animationId);
    };
  }

  global.PensieveVialThreads = { init };
})(window);
