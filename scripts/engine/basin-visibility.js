(function (global) {
  const DEFAULTS = {
    sceneSelector: '.scene',
    phase: { from: 0.12, to: 0.30 }, // align with Camera travel (or slightly after)
    showAt: 0.35, // local threshold inside phase
    className: 'basin-visible',
    onShow: null
  };

  function create(userOptions = {}) {
    const cfg = { ...DEFAULTS, ...userOptions };
    const scene = document.querySelector(cfg.sceneSelector);
    if (!scene) return null;

    let shown = false;

    function apply(t) {
      const local = phaseT(t, cfg.phase.from, cfg.phase.to);
      if (!shown && local >= cfg.showAt) {
        scene.classList.add(cfg.className);
        shown = true;
        cfg.onShow?.();
      }
    }

    function reset() {
      scene.classList.remove(cfg.className);
      shown = false;
    }

    return { apply, reset, cfg };
  }

  function phaseT(t, from, to) {
    if (t <= from) return 0;
    if (t >= to) return 1;
    return (t - from) / (to - from);
  }

  global.PensieveBasinVisibility = { create };
})(window);
