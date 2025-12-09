// scripts/vial-threads.js
(function (global) {
  /**
   * Public API
   * @param {string} selector - CSS selector for vial containers
   * @param {Object} userConfig - optional config overrides
   */
  function init(selector = '.vial', userConfig = {}) {
    const vials = Array.from(document.querySelectorAll(selector));
    if (!vials.length) return;

    const config = buildConfig(userConfig);

    vials.forEach((vialEl) => setupVial(vialEl, config));
  }

  // --------- CONFIG & HELPERS ---------

  const defaultConfig = {
    // Geometry
    view: { width: 70, height: 190 },
    // Wisps
    wispCount: 5, // number of threads

    // Trail (body)
    segmentCount: { min: 10, max: 14 }, // joints per wisp
    segmentLengthFactor: 0.015, // factor * inner.height

    // Motion
    speed: { min: 10, max: 20 }, // view units / second
    baseTurnSpeed: { min: 0.6, max: 0.7 }, // how fast it curves
    noiseStrength: { min: 0.8, max: 1.3 }, // how chaotic turns are

    // Visuals
    baseAlpha: { min: 0.45, max: 0.7 },
    lineWidth: { min: 0.9, max: 1.5 },
    hue: { min: 200, max: 225 }, // bluish white
  };

  const inner = {
    left: defaultConfig.view.width * 0.33,
    right: defaultConfig.view.width * 0.67,
    top: defaultConfig.view.height * 0.24,
    bottom: defaultConfig.view.height * 0.85,
  };
  
  function buildConfig(userConfig) {
    const cfg = {
      ...defaultConfig,
      ...userConfig,
      view: { ...defaultConfig.view, ...(userConfig.view || {}) },
      inner: { ...inner, ...(userConfig.inner || {}) },
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
      baseAlpha: { ...defaultConfig.baseAlpha, ...(userConfig.baseAlpha || {}) },
      lineWidth: {
        ...defaultConfig.lineWidth,
        ...(userConfig.lineWidth || {}),
      },
      hue: { ...defaultConfig.hue, ...(userConfig.hue || {}) },
    };

    // derive width/height for inner
    cfg.inner.width = cfg.inner.right - cfg.inner.left;
    cfg.inner.height = cfg.inner.bottom - cfg.inner.top;

    return cfg;
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function randIntRange(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  // --------- CORE IMPLEMENTATION ---------

  function setupVial(vialEl, config) {
    const canvas = vialEl.querySelector('.vial__threads');
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    let widthCss = 0;
    let heightCss = 0;
    let lastTime = 0;
    let animationId = null;

    const view = config.view;
    const inner = { ...config.inner };

    const wisps = createWisps(inner, config);

    function resize() {
      const rect = vialEl.getBoundingClientRect();
      widthCss = rect.width;

      // 🔑 Always derive height from width using the viewBox ratio (70x190)
      heightCss = (widthCss * view.height) / view.width;

      // Force the vial container to match that height so SVG + canvas align
      vialEl.style.height = heightCss + 'px';

      canvas.width = widthCss * dpr;
      canvas.height = heightCss * dpr;
      canvas.style.width = widthCss + 'px';
      canvas.style.height = heightCss + 'px';

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createWisps(inner, cfg) {
      const result = [];
      const count = cfg.wispCount;

      for (let i = 0; i < count; i++) {
        // start somewhere inside the vial
        const startX =
          inner.left + 4 + Math.random() * (inner.width - 8);
        const startY =
          inner.top + 4 + Math.random() * (inner.height - 8);

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

          // motion
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

          // visuals
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

        // --- HEAD STEERING ---
        const turnNoise =
          (Math.sin(tSec * wisp.baseTurnSpeed + head.x * 0.1 + head.y * 0.07) +
            (Math.random() - 0.5) * 0.6) *
          0.5 *
          wisp.noiseStrength;

        wisp.angle += turnNoise * dt;

        // Move head
        head.x += Math.cos(wisp.angle) * wisp.speed * dt;
        head.y += Math.sin(wisp.angle) * wisp.speed * dt;

        // Bounce off glass
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

        // --- BODY FOLLOWS HEAD ---
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
      if (dt > 0.05) dt = 0.05; // avoid giant jumps on tab resume
      lastTime = timeMs;

      const tSec = timeMs / 1000;

      ctx.clearRect(0, 0, widthCss, heightCss);

      const scaleX = widthCss / view.width;
      const scaleY = heightCss / view.height;
      const mx = (x) => x * scaleX;
      const my = (y) => y * scaleY;

      // Clip to inner glass shape (approx)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(mx(inner.left), my(inner.top + 10));
      ctx.quadraticCurveTo(
        mx(inner.left),
        my(inner.top),
        mx(inner.left + 5),
        my(inner.top - 4)
      );
      ctx.lineTo(mx(inner.right - 5), my(inner.top - 4));
      ctx.quadraticCurveTo(
        mx(inner.right),
        my(inner.top),
        mx(inner.right),
        my(inner.top + 10)
      );
      ctx.lineTo(mx(inner.right), my(inner.bottom - 6));
      ctx.quadraticCurveTo(
        mx((inner.left + inner.right) / 2),
        my(inner.bottom + 10),
        mx(inner.left),
        my(inner.bottom - 6)
      );
      ctx.closePath();
      ctx.clip();

      // Inner haze
      const centerX = mx((inner.left + inner.right) / 2);
      const centerY = my(inner.top + inner.height * 0.55);
      const haze = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        my(inner.height * 0.7)
      );
      haze.addColorStop(0, 'rgba(255,255,255,0.14)');
      haze.addColorStop(0.4, 'rgba(255,255,255,0.06)');
      haze.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = haze;
      ctx.fillRect(
        mx(inner.left),
        my(inner.top),
        mx(inner.width),
        my(inner.height)
      );

      // Update & draw wisps
      updateWisps(dt, tSec);

      for (const wisp of wisps) {
        const pts = wisp.points;

        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const px = mx(p.x);
          const py = my(p.y);

          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }

        const headAlpha = wisp.baseAlpha;
        const tailAlpha = wisp.baseAlpha * 0.4;

        const grad = ctx.createLinearGradient(
          mx(pts[0].x),
          my(pts[0].y),
          mx(pts[pts.length - 1].x),
          my(pts[pts.length - 1].y)
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
      resize();
      if (animationId !== null) cancelAnimationFrame(animationId);
      lastTime = 0;
      animationId = requestAnimationFrame(drawFrame);
    }

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(vialEl);

    start();

    // Optional cleanup handle if you ever want to stop this
    canvas._cleanupThreads = () => {
      if (animationId !== null) cancelAnimationFrame(animationId);
      ro.disconnect();
    };
  }

  // Expose in global namespace
  global.PensieveVialThreads = { init };
})(window);
