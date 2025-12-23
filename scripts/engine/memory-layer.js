// scripts/memory-layer.js
// PensieveMemoryLayer (DROP-IN replacement)
// - Mounts image/video + caption into #scene-basin
// - Positions & masks media using the same ringCenter/ringRadius as CircleFormation
// - Correctly positions caption BELOW the spiral ring (not overlapping media)
// - Uses basin-local coordinates (fixes "too far right" / off-center issues)
// - Adds "sharp + edge-blur" stack inside #memory-media
// - Does NOT animate by itself; you drive it with PensieveMemoryReveal instances

(function (global) {
  const DEFAULTS = {
    basinSelector: '#scene-basin',
    layerId: 'memory-layer',
    mediaId: 'memory-media',
    captionId: 'memory-caption',

    ringCenter: { x: 0.5, y: 0.56 },
    ringRadius: 0.305,

    // Mask feather (used by your CSS mask / clip)
    featherPx: 28,

    // Caption placement
    caption: {
      // distance below ring bottom
      offsetPx: 18,
      // keep some bottom breathing room inside basin
      bottomPaddingPx: 18,
      // width cap (CSS px)
      maxWidthPx: 560,
    },

    // edge-blur stack defaults (can be overridden via CSS vars too)
    edgeBlurPx: 12,
    edgeStartPct: 55, // where blur starts (0..100)
    edgeEndPct: 82,   // where blur fully shows (0..100)
    edgeOpacity: 0.95,

    // video behavior
    video: {
      playsInline: true,
      muted: true,
      loop: true,
      autoplay: true,
      preload: 'auto',
    },
  };

  function create(userOptions = {}) {
    const cfg = deepMerge(structuredClone(DEFAULTS), userOptions);

    const basin = document.querySelector(cfg.basinSelector);
    const layer = document.getElementById(cfg.layerId);
    const mediaHost = document.getElementById(cfg.mediaId);
    const captionHost = document.getElementById(cfg.captionId);

    if (!basin || !layer || !mediaHost || !captionHost) return null;

    const state = {
      activeId: null,
      mountedType: null,
      ro: null,
      _onScroll: null,
      _onResize: null,
    };

    // --- helpers ---

    function clamp(min, v, max) {
      return v < min ? min : v > max ? max : v;
    }

    function getBasinBox() {
      // Basin-local box in CSS pixels
      // IMPORTANT: do NOT use rect.left/top for positioning INSIDE the basin.
      const w = basin.clientWidth || 1;
      const h = basin.clientHeight || 1;
      return { w, h };
    }

    function computeGeometry() {
      const { w, h } = getBasinBox();
      const minDim = Math.min(w, h);

      const cx = w * cfg.ringCenter.x;
      const cy = h * cfg.ringCenter.y;
      const r = minDim * cfg.ringRadius;

      return { w, h, minDim, cx, cy, r };
    }

    function applyCssVars(geom) {
      layer.style.setProperty('--mem-cx', `${geom.cx}px`);
      layer.style.setProperty('--mem-cy', `${geom.cy}px`);
      layer.style.setProperty('--mem-r', `${geom.r}px`);
      layer.style.setProperty('--mem-feather', `${cfg.featherPx}px`);

      layer.style.setProperty('--edge-blur', `${cfg.edgeBlurPx}px`);
      layer.style.setProperty('--edge-start', `${cfg.edgeStartPct}%`);
      layer.style.setProperty('--edge-end', `${cfg.edgeEndPct}%`);
      layer.style.setProperty('--edge-opacity', `${cfg.edgeOpacity}`);
    }

    function positionMedia(geom) {
      // media is a circle of diameter 2r centered at (cx, cy)
      mediaHost.style.position = 'absolute';
      mediaHost.style.left = `${geom.cx}px`;
      mediaHost.style.top = `${geom.cy}px`;
      mediaHost.style.width = `${geom.r * 2}px`;
      mediaHost.style.height = `${geom.r * 2}px`;
      mediaHost.style.transform = 'translate(-50%, -50%)';
      mediaHost.style.pointerEvents = 'none';

      // Hard guarantee: media is clipped to the circle.
      // (Your reveal mask can still run on top; this is the physical crop.)
      mediaHost.style.overflow = 'hidden';
      mediaHost.style.borderRadius = '50%';
    }


    function positionCaption(geom) {
      const offset = cfg.caption?.offsetPx ?? 18;
      const bottomPad = cfg.caption?.bottomPaddingPx ?? 18;

      const ringBottom = geom.cy + geom.r;
      let top = ringBottom + offset;

      const maxTop = geom.h - bottomPad - 1;
      top = clamp(0, top, maxTop);

      captionHost.style.position = 'absolute';
      captionHost.style.left = '50%';
      captionHost.style.transform = 'translateX(-50%)';
      captionHost.style.top = `${top}px`;

      const maxW = cfg.caption?.maxWidthPx ?? 560;
      const basinWCap = Math.floor(geom.w * 0.86);
      captionHost.style.width = `${Math.min(maxW, basinWCap)}px`;

      captionHost.style.textAlign = 'center';
      captionHost.style.pointerEvents = 'none';
      captionHost.style.fontFamily = 'Pinyon Script';
      captionHost.style.fontSize = '32px';
      captionHost.style.color = 'white';
      captionHost.style.textShadow = '0 4px 12px rgba(0,0,0,0.45)';
    }


    function ensureLayerPositioning() {
      // Make sure the layer is a positioning context
      // (If your CSS already does this, it’s harmless.)
      if (getComputedStyle(basin).position === 'static') {
        basin.style.position = 'relative';
      }
      layer.style.position = 'absolute';
      layer.style.inset = '0';
      layer.style.pointerEvents = 'none';
    }

    function updateLayout() {
      ensureLayerPositioning();
      const geom = computeGeometry();
      applyCssVars(geom);

      positionMedia(geom);
      positionCaption(geom);
    }

    // --- media mounting ---

    function clearMedia() {
      mediaHost.innerHTML = '';
      captionHost.textContent = '';
      state.mountedType = null;
      layer.setAttribute('aria-hidden', 'true');
      state.activeId = null;
    }

    function createImg(src, alt) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = alt || '';
      img.decoding = 'async';
      img.loading = 'eager';
      return img;
    }

    function createVideo(src) {
      const v = document.createElement('video');
      v.src = src;

      v.playsInline = !!cfg.video?.playsInline;
      v.muted = !!cfg.video?.muted;
      v.loop = !!cfg.video?.loop;
      v.autoplay = !!cfg.video?.autoplay;
      v.preload = cfg.video?.preload ?? 'auto';

      return v;
    }

    function mount({ id, kind, src, caption }) {
      // kind: 'image' | 'video'
      clearMedia();
      updateLayout();

      // Build stack container
      const stack = document.createElement('div');

      stack.className = 'memory-media__stack';

      const sharpWrap = document.createElement('div');
      sharpWrap.className = 'memory-media__sharp';

      const blurWrap = document.createElement('div');
      blurWrap.className = 'memory-media__blur';

      // Create two copies (sharp + blurred)
      let sharpNode = null;
      let blurNode = null;

      if (kind === 'video') {
        sharpNode = createVideo(src);
        blurNode = createVideo(src);

        // keep blur video always muted too (some browsers require muted to autoplay)
        blurNode.muted = true;

        // best-effort start
        Promise.resolve().then(() => {
          sharpNode.play?.().catch(() => {});
          blurNode.play?.().catch(() => {});
        });
      } else {
        sharpNode = createImg(src, caption);
        blurNode = createImg(src, caption);
      }

      stack.style.width = '100%';
      stack.style.height = '100%';
      stack.style.position = 'relative';

      sharpWrap.style.position = 'absolute';
      sharpWrap.style.inset = '0';

      blurWrap.style.position = 'absolute';
      blurWrap.style.inset = '0';

      // ensure img/video fills the circle
      for (const node of [sharpNode, blurNode]) {
        node.style.width = '100%';
        node.style.height = '100%';
        node.style.objectFit = 'cover';
        node.style.display = 'block';
      }

      sharpWrap.appendChild(sharpNode);
      blurWrap.appendChild(blurNode);

      stack.appendChild(sharpWrap);
      stack.appendChild(blurWrap);

      mediaHost.appendChild(stack);
      captionHost.textContent = caption || '';

      state.activeId = id;
      state.mountedType = kind;
      layer.setAttribute('aria-hidden', 'false');
    }

    // --- observers / lifecycle ---

    state.ro = new ResizeObserver(() => updateLayout());
    state.ro.observe(basin);

    state._onResize = () => updateLayout();
    window.addEventListener('resize', state._onResize);

    // If page scrolls, bounding boxes shift; basin-local sizing stays,
    // but some layouts/fonts can reflow; this keeps it rock-solid.
    state._onScroll = () => updateLayout();
    window.addEventListener('scroll', state._onScroll, { passive: true });

    // Initial layout pass
    updateLayout();

    return {
      mount,
      clear: clearMedia,
      updateLayout,
      cfg,
    };
  }

  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const key of Object.keys(source)) {
      const sv = source[key];
      const tv = target[key];
      if (Array.isArray(sv)) target[key] = sv.slice();
      else if (sv && typeof sv === 'object')
        target[key] = deepMerge(tv && typeof tv === 'object' ? tv : {}, sv);
      else if (sv !== undefined) target[key] = sv;
    }
    return target;
  }

  global.PensieveMemoryLayer = { create };
})(window);
