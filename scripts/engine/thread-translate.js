// scripts/thread-translate.js
// Copies the current vial threads canvas into the basin layer each frame,
// translating ONLY vertically during the pour progress window.
//
// Usage:
//   const threadTranslate = PensieveThreadTranslate.create({
//     basinCanvasId: 'basin-canvas',
//     basinSelector: '#scene-basin',
//     targetY: 0.55, // normalized inside basin rect
//     alpha: 0.95,
//   });
//
//   const pour = PensieveVialPour.create({
//     phase: { from: 0.14, to: 0.62 },
//     onProgress: (p, ctx) => threadTranslate?.apply(p, ctx),
//   });

(function (global) {
  const DEFAULTS = {
    basinCanvasId: 'basin-canvas',
    basinSelector: '#scene-basin',

    // Where inside the basin rect the copied threads should end up (vertical only)
    // 0 = top, 1 = bottom
    targetY: 0.55,

    // Visual tuning
    alpha: 1.0,
    clearEachFrame: true,

    // If you want a softer “sink” near the end, tweak this
    easing: (t) => t, // linear by default
  };

  function create(userOptions = {}) {
    const cfg = { ...DEFAULTS, ...userOptions };

    const basinCanvas = document.getElementById(cfg.basinCanvasId);
    if (!basinCanvas) return null;

    const basinEl = document.querySelector(cfg.basinSelector);
    if (!basinEl) return null;

    const ctx = basinCanvas.getContext('2d');

    const state = {
      dpr: window.devicePixelRatio || 1,
      w: 1,
      h: 1,
      lastKey: null, // helps avoid flicker if vial changes
    };

    function resize() {
      state.dpr = window.devicePixelRatio || 1;

      // Size to the basin section (not full screen) so coords are stable
      const r = basinEl.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));

      state.w = w;
      state.h = h;

      basinCanvas.width = Math.max(1, Math.round(w * state.dpr));
      basinCanvas.height = Math.max(1, Math.round(h * state.dpr));
      basinCanvas.style.width = `${w}px`;
      basinCanvas.style.height = `${h}px`;

      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    }

    window.addEventListener('resize', resize, { passive: true });
    resize();

    function clear() {
      ctx.clearRect(0, 0, state.w, state.h);
    }

    function apply(p, { vialButton } = {}) {
      if (!vialButton) return;

      const eased = cfg.easing ? cfg.easing(clamp01(p)) : clamp01(p);
      if (cfg.clearEachFrame) clear();

      const srcCanvas = vialButton.querySelector('.vial__threads');
      if (!srcCanvas) return;

      // We draw in basin-local coords, so we need both rects
      const srcRect = srcCanvas.getBoundingClientRect();
      const basinRect = basinEl.getBoundingClientRect();

      // destination size: match the source canvas *as it appears* on screen
      const destW = Math.max(1, srcRect.width);
      const destH = Math.max(1, srcRect.height);

      // destination X: keep the same X (world alignment), just re-based into basin coords
      const destX = (srcRect.left - basinRect.left);

      // destination Y start: where it currently is (also rebased into basin coords)
      const startY = (srcRect.top - basinRect.top);

      // destination Y end: a target point inside the basin (vertical only)
      const targetWorldY = basinRect.top + basinRect.height * cfg.targetY;
      const endY = (targetWorldY - basinRect.top) - destH * 0.5; // center it vertically

      // vertical-only lerp
      const destY = lerp(startY, endY, eased);

      ctx.save();
      ctx.globalAlpha = cfg.alpha;

      // drawImage uses source bitmap pixels; if canvas is DPR-scaled internally,
      // drawImage still works fine (it samples the bitmap).
      ctx.drawImage(srcCanvas, destX, destY, destW, destH);

      ctx.restore();

      state.lastKey = vialButton;
    }

    function clamp01(x) {
      return x < 0 ? 0 : x > 1 ? 1 : x;
    }

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    return { apply, clear, resize, cfg };
  }

  global.PensieveThreadTranslate = { create };
})(window);
