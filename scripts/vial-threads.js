// scripts/vial-threads.js
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
    speed: { min: 10, max: 20 },
    baseTurnSpeed: { min: 0.6, max: 0.7 },
    noiseStrength: { min: 0.8, max: 1.3 },
    baseAlpha: { min: 0.45, max: 0.7 },
    lineWidth: { min: 0.9, max: 1.5 },
    hue: { min: 200, max: 225 },
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
    };
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function randIntRange(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function setupVial(vialEl, config) {
    const canvas = vialEl.querySelector('.vial__threads');
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const view = config.view;
    const widthView = view.width;
    const heightView = view.height;

    // Inner region in *viewBox space*
    const inner = {
      left: widthView * 0.33,
      right: widthView * 0.67,
      top: heightView * 0.24,
      bottom: heightView * 0.85,
    };
    inner.width = inner.right - inner.left;
    inner.height = inner.bottom - inner.top;

    // 🔑 Lock logical canvas size to viewBox
    canvas.width = widthView * dpr;
    canvas.height = heightView * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let lastTime = 0;
    let animationId = null;

    const wisps = createWisps(inner, config);

    function createWisps(inner, cfg) {
      const result = [];
      const count = cfg.wispCount;

      for (let i = 0; i < count; i++) {
        const startX = inner.left + 4 + Math.random() * (inner.width - 8);
        const startY = inner.top + 4 + Math.random() * (inner.height - 8);

        const segmentCount = randIntRange(
          cfg.segmentCount.min,
          cfg.segmentCount.max
        );
        const segmentLength = inner.height * cfg.segmentLengthFactor;

        const points = [];
        for (let j = 0; j < segmentCount; j++) {
          points.push({
            x: startX,
            y: startY + j * (segmentLength * 0.8),
          });
        }

        const head = points[0];

        result.push({
          points,
          head,
          segmentLength,
          angle: Math.random() * Math.PI * 2,
          baseTurnSpeed: randRange(
            cfg.baseTurnSpeed.min,
            cfg.baseTurnSpeed.max
          ),
          noiseStrength: randRange(
            cfg.noiseStrength.min,
            cfg.noiseStrength.max
          ),
          speed: randRange(cfg.speed.min, cfg.speed.max),
          baseAlpha: randRange(cfg.baseAlpha.min, cfg.baseAlpha.max),
          lineWidth: randRange(cfg.lineWidth.min, cfg.lineWidth.max),
          hue: randRange(cfg.hue.min, cfg.hue.max),
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
      for (const wisp of wisps) {
        const { head } = wisp;

        const turnNoise =
          (Math.sin(tSec * wisp.baseTurnSpeed + head.x * 0.1 + head.y * 0.07) +
            (Math.random() - 0.5) * 0.6) *
          0.5 *
          wisp.noiseStrength;

        wisp.angle += turnNoise * dt;

        head.x += Math.cos(wisp.angle) * wisp.speed * dt;
        head.y += Math.sin(wisp.angle) * wisp.speed * dt;

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

          const followStrength = 10;
          curr.x += (desiredX - curr.x) * followStrength * dt;
          curr.y += (desiredY - curr.y) * followStrength * dt;

          clampInside(curr, inner);
        }
      }
    }

    function drawFrame(timeMs) {
      if (!lastTime) lastTime = timeMs;
      let dt = (timeMs - lastTime) / 1000;
      if (dt > 0.05) dt = 0.05;
      lastTime = timeMs;

      const tSec = timeMs / 1000;

      // Logical canvas space is fixed: 0..70 x 0..190
      ctx.clearRect(0, 0, widthView, heightView);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(inner.left, inner.top + 10);
      ctx.quadraticCurveTo(
        inner.left,
        inner.top,
        inner.left + 5,
        inner.top - 4
      );
      ctx.lineTo(inner.right - 5, inner.top - 4);
      ctx.quadraticCurveTo(
        inner.right,
        inner.top,
        inner.right,
        inner.top + 10
      );
      ctx.lineTo(inner.right, inner.bottom - 6);
      ctx.quadraticCurveTo(
        (inner.left + inner.right) / 2,
        inner.bottom + 10,
        inner.left,
        inner.bottom - 6
      );
      ctx.closePath();
      ctx.clip();

      // DEBUG: inner box (will now be identical for all vials)
      // ctx.save();
      // ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
      // ctx.lineWidth = 1;
      // ctx.strokeRect(inner.left, inner.top, inner.width, inner.height);
      // ctx.restore();

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

      for (const wisp of wisps) {
        const pts = wisp.points;

        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }

        const headAlpha = wisp.baseAlpha;
        const tailAlpha = wisp.baseAlpha * 0.4;

        const grad = ctx.createLinearGradient(
          pts[0].x,
          pts[0].y,
          pts[pts.length - 1].x,
          pts[pts.length - 1].y
        );
        grad.addColorStop(
          0,
          `hsla(${wisp.hue}, 80%, 95%, ${headAlpha})`
        );
        grad.addColorStop(
          1,
          `hsla(${wisp.hue}, 70%, 90%, ${tailAlpha})`
        );

        ctx.strokeStyle = grad;
        ctx.lineWidth = wisp.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 7;
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
