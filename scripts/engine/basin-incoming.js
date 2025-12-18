(function (global) {
  const DEFAULTS = {
    canvasId: 'basin-canvas',
    // Visual tuning
    maxAlpha: 0.9,
    lineCount: 18,
    jitter: 10,
  };

  function create(userOptions = {}) {
    const cfg = { ...DEFAULTS, ...userOptions };

    const canvas = document.getElementById(cfg.canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const state = { incoming: 0, wake: 0};

    function setWake(p) {
        const n = Number(p);
        state.wake = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));

        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }


    window.addEventListener('resize', resize);
    resize();

    let raf = null;

    function setIncoming(p) {
      const n = Number(p);
      state.incoming = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
      if (state.incoming > 0 && raf == null) raf = requestAnimationFrame(draw);
    }

    function clear() {
      state.incoming = 0;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
    }

    function draw(timeMs) {
      raf = requestAnimationFrame(draw);

      const p = state.incoming;
      if (p <= 0.001) return;

      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      // Simple “threadfall” placeholder: thin silvery lines falling into a center basin area.
      // Later we’ll replace this with a more magical, basin-aware simulation.
      const centerX = w * 0.5;
      const topY = h * 0.0;
      const basinY = h * 0.60;

      ctx.save();
      ctx.globalAlpha = cfg.maxAlpha * p;
      ctx.lineWidth = 1;

      for (let i = 0; i < cfg.lineCount; i++) {
        const phase = (timeMs / 1000) * 1.2 + i * 0.35;
        const x = centerX + Math.sin(phase) * (cfg.jitter * (0.3 + 0.7 * p));
        const drift = Math.cos(phase * 1.6) * 6;

        const y0 = topY + (i * 6) * (1 - p);
        const y1 = basinY + drift;

        const wake = state.wake;
        ctx.globalAlpha = cfg.maxAlpha * p * (0.65 + 0.35 * wake);

        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.strokeStyle = `rgba(200, 220, 255, ${0.18 + 0.35 * p})`;
        ctx.shadowColor = 'rgba(230,240,255,0.8)';
        ctx.shadowBlur = (8 + 12 * wake) * p;
        ctx.stroke();
      }

      ctx.restore();
    }

    return { setIncoming, setWake, clear, resize };
  }

  global.PensieveBasinIncoming = { create };
})(window);
