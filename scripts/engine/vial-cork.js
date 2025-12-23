(function (global) {
  const DEFAULTS = {
    vialSelector: '.vials__vial',
    corkSelector: '[data-part="cork"]',
    openClass: 'is-cork-open',
    // For now: single-use. Later we can allow close or re-open policy.
    allowToggle: false,
    onOpen: null, // (ctx) => void
  };

  function init(userOptions = {}) {
    const cfg = { ...DEFAULTS, ...userOptions };

    const vials = Array.from(document.querySelectorAll(cfg.vialSelector));
    if (!vials.length) return { ok: false, reason: 'no-vials' };

    // We listen on the button, but only react if the click originated on the cork.
    vials.forEach((vialBtn) => {
      vialBtn.addEventListener('click', (ev) => {
        const cork = ev.target?.closest?.(cfg.corkSelector);
        if (!cork) return; // click was elsewhere on the vial

        ev.preventDefault();
        ev.stopPropagation();

        const isOpen = vialBtn.classList.contains(cfg.openClass);

        if (isOpen && !cfg.allowToggle) return;

        if (isOpen) {
          vialBtn.classList.remove(cfg.openClass);
          return;
        }

        // Open cork
        vialBtn.classList.add(cfg.openClass);

        cfg.onOpen?.({
          vialButton: vialBtn,
          memoryId: vialBtn.dataset.memory,
          corkElement: cork,
        });
      });
    });

    return { ok: true, vialsCount: vials.length };
  }

  function disableVial(vialBtn) {
    if (!vialBtn) return;
    vialBtn.setAttribute(DEFAULTS.disabledAttr, '1');
  }

  function enableVial(vialBtn) {
    if (!vialBtn) return;
    vialBtn.removeAttribute(DEFAULTS.disabledAttr);
  }

  global.PensieveVialCork = { init, disableVial, enableVial };
})(window);
