// scripts/vial-pour.js
(function (global) {
  const DEFAULTS = {
    phase: { from: 0.10, to: 0.30 },
    easing: easeOutCubic,

    vialRootSelector: '.vial',
    rigSelector: '.vial__rig', // used to read current tilt if needed

    // How much the threads canvas “spills” visually (px)
    spillDistancePx: 42,
    spillStretch: 0.28,     // extra scaleY at peak
    spillBlurPx: 0.6,       // tiny blur helps the illusion
    spillOpacityDrop: 0.12, // slight fade as it stretches

    // Direction: if you tilt right (+deg), stream goes down-right
    // If you always tilt right, keep this true. If you might tilt left, we compute sign.
    useTiltDirection: true,

    onProgress: null, // (p, { vialButton, t }) => void
  };

  function create(userOptions = {}) {
    const cfg = { ...DEFAULTS, ...userOptions };

    function apply(vialButton, t) {
      const vialRoot = vialButton.querySelector(cfg.vialRootSelector);
      if (!vialRoot) return;

      const ctrl = vialRoot._threadsController;
      if (!ctrl?.setPour) return;

      const local = phaseT(t, cfg.phase.from, cfg.phase.to);
      const p = cfg.easing ? cfg.easing(local) : local;

      // 1) Drive the *internal* pour physics (wisps bias downward)
      ctrl.setPour(p);

      // 2) Drive the *spatial* illusion by moving the canvas
      applyCanvasPose(vialButton, p, cfg);

      // 3) Hook for basin stream etc.
      cfg.onProgress?.(p, { vialButton, t });
    }

    function reset(vialButton) {
      const vialRoot = vialButton.querySelector(cfg.vialRootSelector);
      vialRoot?._threadsController?.setPour?.(0);
      clearCanvasPose(vialButton);
      vialButton.classList.remove('is-pouring');
    }

    return { apply, reset, cfg };
  }

  function applyCanvasPose(vialButton, p, cfg) {
    const vialRoot = vialButton.querySelector(cfg.vialRootSelector);
    if (!vialRoot) return;

    const canvas = vialRoot.querySelector('.vial__threads');
    if (!canvas) return;

    vialButton.classList.add('is-pouring');

    // Compute direction based on tilt. If you always tilt right, you can simplify.
    let angleRad = Math.PI / 2; // fallback: straight down
    if (cfg.useTiltDirection) {
      const rig = vialButton.querySelector(cfg.rigSelector);
      const tiltDeg = readRotateDeg(rig) ?? 20; // fallback to your max
      // We want “down along tilt”, so base is down (90deg) plus some bias.
      angleRad = (Math.PI / 2) + (tiltDeg * Math.PI / 180) * 0.55;
    }

    const dist = cfg.spillDistancePx * p;

    const dx = Math.cos(angleRad) * dist;
    const dy = Math.sin(angleRad) * dist;

    const stretch = 1 + cfg.spillStretch * p;
    const blur = cfg.spillBlurPx * p;
    const opacity = 1 - cfg.spillOpacityDrop * p;

    vialButton.style.setProperty('--pour-x', `${dx.toFixed(2)}px`);
    vialButton.style.setProperty('--pour-y', `${dy.toFixed(2)}px`);
    vialButton.style.setProperty('--pour-rot', `${(p * 2.0).toFixed(2)}deg`); // tiny “pour pull”
    vialButton.style.setProperty('--pour-stretch', `${stretch.toFixed(3)}`);
    vialButton.style.setProperty('--pour-blur', `${blur.toFixed(2)}px`);
    vialButton.style.setProperty('--pour-opacity', `${opacity.toFixed(3)}`);
  }

  function clearCanvasPose(vialButton) {
    vialButton.style.removeProperty('--pour-x');
    vialButton.style.removeProperty('--pour-y');
    vialButton.style.removeProperty('--pour-rot');
    vialButton.style.removeProperty('--pour-stretch');
    vialButton.style.removeProperty('--pour-blur');
    vialButton.style.removeProperty('--pour-opacity');
  }

  function readRotateDeg(el) {
    if (!el) return null;
    const tr = getComputedStyle(el).transform;
    if (!tr || tr === 'none') return null;

    // matrix(a,b,c,d,tx,ty) -> rotation = atan2(b,a)
    const m = tr.match(/^matrix\((.+)\)$/);
    if (!m) return null;

    const parts = m[1].split(',').map(x => parseFloat(x.trim()));
    if (parts.length < 6) return null;

    const a = parts[0];
    const b = parts[1];
    const deg = Math.atan2(b, a) * (180 / Math.PI);
    return deg;
  }

  function phaseT(t, from, to) {
    if (t <= from) return 0;
    if (t >= to) return 1;
    return (t - from) / (to - from);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  global.PensieveVialPour = { create };
})(window);
