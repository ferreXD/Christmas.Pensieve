// pensieve-handwriting.js
// Public API:
//   PensieveHandwriting.init(options)
//   PensieveHandwriting.wrapText(text, maxCharsPerLine)

(function (global) {
  const DEFAULTS = {
    svgId: 'khoshnus-main',
    // Elements
    selectors: {
      fallbackLines: '.page__handwriting-fallback',
      cta: '.page__cta',
      quote: '.page__quote',
    },

    // Text content (can be overridden)
    text: {
    //   line1: 'Some memories are small, but still worth keeping.',
    //   line2: 'These are a few I wanted to save with you.',
    },

    // Wrapping / layout
    wrap: {
      maxCharsPerLine: 30,
      // If you want different wrapping per block:
      // maxCharsPerLineLine1: 30,
      // maxCharsPerLineLine2: 30,
    },
    layout: {
      baseY: 30,        // % of viewBox height
      lineSpacing: 16,  // % between lines
      // optional extra gap between block1 and block2
      blockGap: 0,      // % extra added starting at block2
    },

    // Manuscript config
    manuscript: {
      // Provide these or it will try to use globals Manuscript/FONT_MATRIX
      ManuscriptCtor: null,
      fontMatrix: null,
      fontName: 'Pinyon Script',
      fontSize: '12px',

      start: null,
      end: null,
      durations: null,
    },

    // Timing
    timing: {
      eachLetterDelay: 100,
      linePause: 500,
      revealPaddingMs: 2000, // after computed typing time
    },

    // Hooks
    onFallback: null, // (ctx) => void
    onReady: null,    // (ctx) => void
    onDone: null,     // (ctx) => void
  };

  function init(userOptions = {}) {
    const cfg = deepMerge(structuredClone(DEFAULTS), userOptions);

    const svg = document.getElementById(cfg.svgId);
    const fallbackLines = Array.from(document.querySelectorAll(cfg.selectors.fallbackLines));
    const cta = document.querySelector(cfg.selectors.cta);
    const quote = document.querySelector(cfg.selectors.quote);

    const ManuscriptCtor = cfg.manuscript.ManuscriptCtor ?? global.Manuscript;
    const fontMatrix = cfg.manuscript.fontMatrix ?? global.FONT_MATRIX;

    const ctx = { cfg, svg, fallbackLines, cta, quote, ManuscriptCtor, fontMatrix };

    // Guardrails: if anything required is missing, fallback.
    if (!svg || !ManuscriptCtor || !fontMatrix) {
      showFallback(ctx);
      cfg.onFallback?.(ctx);
      return { ok: false, reason: 'missing-deps-or-svg', ...ctx };
    }

    // Hide fallback
    fallbackLines.forEach(el => (el.style.display = 'none'));

    // Resolve font + manuscript options
    const fontKey = cfg.manuscript.fontName;
    const fm = fontMatrix[fontKey];

    // If font not found in matrix, fallback (better than silently wrong).
    if (!fm?.name) {
      showFallback(ctx);
      cfg.onFallback?.(ctx);
      return { ok: false, reason: 'font-not-found', ...ctx };
    }

    const start = cfg.manuscript.start ?? {
      startStrokeDashoffset: fm.strokeDashoffset,
      startStroke: 'white',
      startStrokeWidth: 0.0000000001,
      startFill: 'transparent',
    };

    const end = cfg.manuscript.end ?? {
      endStrokeDashoffset: 0,
      endStroke: 'transparent',
      endStrokeWidth: 0.3,
      endFill: 'white',
    };

    const durations = cfg.manuscript.durations ?? {
      strokeDashoffsetDuration: 3500,
      strokeWidthDuration: 2500,
      strokeDuration: 2500,
      fillDuration: 4000,
    };

    const manuscript = new ManuscriptCtor({
      svgId: cfg.svgId,
      font: fm.name,
      fontSize: cfg.manuscript.fontSize,
      start,
      end,
      durations,
    });

    cfg.onReady?.({ ...ctx, manuscript });

    // Build lines
    const maxCharsPerLine = cfg.wrap.maxCharsPerLine;
    const wrappedLines1 = wrapText(cfg.text.line1, maxCharsPerLine);
    const wrappedLines2 = wrapText(cfg.text.line2, maxCharsPerLine);
    const allLines = [...wrappedLines1, ...wrappedLines2];

    const { eachLetterDelay, linePause, revealPaddingMs } = cfg.timing;
    const { baseY, lineSpacing, blockGap } = cfg.layout;

    let currentDelay = 0;
    let totalChars = 0;

    allLines.forEach((text, index) => {
      const isSecondBlock = index >= wrappedLines1.length;
      const y =
        baseY +
        index * lineSpacing +
        (isSecondBlock ? blockGap : 0);

      manuscript.write(text, {
        textElementAttributes: {
          x: '50%',
          y: `${y}%`,
          textAnchor: 'middle',
          dominantBaseline: 'middle',
        },
        writeConfiguration: {
          delayOperation: currentDelay,
          eachLetterDelay,
        },
      });

      totalChars += text.length;
      currentDelay += text.length * eachLetterDelay + linePause;
    });

    // Reveal CTA + quote after the handwriting is done (rough estimate).
    const totalDurationMs = totalChars * eachLetterDelay + revealPaddingMs;

    const revealTimer = setTimeout(() => {
      if (cta) cta.classList.add('page__cta--visible');
      if (quote) quote.classList.add('page__quote--visible');
      cfg.onDone?.({ ...ctx, manuscript });
    }, totalDurationMs);

    return {
      ok: true,
      ...ctx,
      manuscript,
      stop() {
        clearTimeout(revealTimer);
        // no strong cancel API from Manuscript assumed; this only stops reveal.
      },
      estimatedDurationMs: totalDurationMs,
      lines: allLines,
    };
  }

  function showFallback(ctx) {
    const { fallbackLines, cta, quote } = ctx;
    fallbackLines.forEach(el => (el.style.display = 'block'));
    if (cta) cta.classList.add('page__cta--visible');
    if (quote) quote.classList.add('page__quote--visible');
  }

  function wrapText(text, maxCharsPerLine) {
    const words = String(text ?? '').split(' ').filter(Boolean);
    const lines = [];
    let current = '';

    for (const word of words) {
      const testLine = current ? current + ' ' + word : word;
      if (testLine.length <= maxCharsPerLine) {
        current = testLine;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }

    if (current) lines.push(current);
    return lines;
  }

  // --- tiny utils ---
  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const key of Object.keys(source)) {
      const sv = source[key];
      const tv = target[key];

      if (Array.isArray(sv)) {
        target[key] = sv.slice();
      } else if (sv && typeof sv === 'object') {
        target[key] = deepMerge(tv && typeof tv === 'object' ? tv : {}, sv);
      } else if (sv !== undefined) {
        target[key] = sv;
      }
    }
    return target;
  }

  global.PensieveHandwriting = {
    init,
    wrapText,
  };
})(window);
