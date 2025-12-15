// scripts/vial-tilt.js
(function (global) {
  const DEFAULTS = {
    rigSelector: '.vial__rig',
    tiltPhase: { from: 0.00, to: 0.18 }, // normalized window
    maxTiltDeg: -22, // negative = tilt left; tune by feel
    liftPx: -2,      // subtle lift while tilting
  };

  function create(userOptions = {}) {
    const cfg = deepMerge(structuredClone(DEFAULTS), userOptions);

    function apply(vialBtn, t) {
      const rig = vialBtn.querySelector(cfg.rigSelector);
      if (!rig) return;

      const local = phaseT(t, cfg.tiltPhase.from, cfg.tiltPhase.to);
      // local is 0..1 within phase
      const tilt = cfg.maxTiltDeg * local;
      const lift = cfg.liftPx * local;

      rig.style.transform = `translateY(${lift}px) rotate(${tilt}deg)`;
    }

    function reset(vialBtn) {
      const rig = vialBtn.querySelector(cfg.rigSelector);
      if (rig) rig.style.transform = '';
    }

    return { apply, reset, cfg };
  }

  function phaseT(t, from, to) {
    if (t <= from) return 0;
    if (t >= to) return 1;
    return (t - from) / (to - from);
  }

  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const key of Object.keys(source)) {
      const sv = source[key];
      const tv = target[key];

      if (Array.isArray(sv)) target[key] = sv.slice();
      else if (sv && typeof sv === 'object') target[key] = deepMerge(tv && typeof tv === 'object' ? tv : {}, sv);
      else if (sv !== undefined) target[key] = sv;
    }
    return target;
  }

  global.PensieveVialTilt = { create };
})(window);
