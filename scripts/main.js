// scripts/main.js
import { Manuscript } from '../vendor/khoshnus/khoshnus.js';
import { FONT_MATRIX, initialize } from '../vendor/khoshnus/initialize.js';
import { write } from '../vendor/khoshnus/operations/operations.js';

// NOTE: Manuscript is also defined by the library; depending on how it's exported,
// you might also be able to do: `import { Manuscript } from '../vendor/khoshnus.js';`
// For now we'll assume it's on the global (see comment below).

document.addEventListener('DOMContentLoaded', () => {
    // Inicializamos partículas con los defaults (o puedes pasar opciones)
    if (PensieveParticles) {
        PensieveParticles.init('particles', {
            maxParticles: 70, // puedes bajar a 40 si ves lag
            densityFactor: 0.00012,
        });
    }

    if (PensieveCtaParticles) {
        PensieveCtaParticles.init();
    }

    if (PensieveVialThreads) {
        PensieveVialThreads.init('.vial', {
          wispCount: 24,
          speed: { min: 6, max: 12 },
          segmentCount: { min: 6, max: 10 },
          noiseStrength: { min: 0.4, max: 0.6 },
          baseAlpha: { min: 0.35, max: 0.55 },
        });
    }
    
    if (PensieveVialsOrbit) {
      PensieveVialsOrbit.init('#vials-orbit', {
        baseSpeed: 0.08,
        radiusXFactor: 0.38,
        radiusYFactor: 0.08,
        scaleMin: 0.65,
        scaleMax: 1.20
      });
    }

    initHandwriting();
});

// main.js (or wherever your handwriting init lives)
function initHandwriting() {
  const svg = document.getElementById('khoshnus-main');
  const fallbackLines = Array.from(
    document.querySelectorAll('.page__handwriting-fallback')
  );
  const cta = document.querySelector('.page__cta');
  const quote = document.querySelector('.page__quote');

  const ManuscriptCtor = Manuscript;
  const fontMatrix = FONT_MATRIX;

  if (!svg || !ManuscriptCtor || !fontMatrix) {
    // Fallback: plain text
    fallbackLines.forEach(el => {
      el.style.display = 'block';
    });
    if (cta) cta.classList.add('page__cta--visible');
    if (quote) quote.classList.add('page__quote--visible');
    return;
  }

  // Hide fallback text
  fallbackLines.forEach(el => {
    el.style.display = 'none';
  });

  const rawLine1 = 'Some memories are small, but still worth keeping.';
  const rawLine2 = 'These are a few I wanted to save with you.';

  // 1) Wrap both lines
  const maxCharsPerLine = 30; // tweak by eye
  const wrappedLines1 = wrapText(rawLine1, maxCharsPerLine);
  const wrappedLines2 = wrapText(rawLine2, maxCharsPerLine);
  const allLines = [...wrappedLines1, ...wrappedLines2];

  // 2) Create Manuscript bound to SVG
  const manuscript = new ManuscriptCtor({
    svgId: 'khoshnus-main',
    font: fontMatrix['Pinyon Script'].name,
    fontSize: '12px', // tune visually
        start: {
            startStrokeDashoffset: FONT_MATRIX["Pinyon Script"].strokeDashoffset,
            startStroke: "white",
            startStrokeWidth: 0.0000000001,
            startFill: "transparent",
        },
        end: {
            endStrokeDashoffset: 0,
            endStroke: "transparent",
            endStrokeWidth: 0.3,
            endFill: "white",
        },
        durations: {
            strokeDashoffsetDuration: 3500,
            strokeWidthDuration: 2500,
            strokeDuration: 2500,
            fillDuration: 4000,
        }
  });

  const eachLetterDelay = 100; // ms
  const linePause = 500;       // pause between lines

  // 3) Layout: base Y + spacing per line
  const baseY = 30;           // as percentage of viewBox height
  const lineSpacing = 16;     // percentage between lines

  let currentDelay = 0;
  let totalChars = 0;

  allLines.forEach((text, index) => {
    const isSecondBlock = index >= wrappedLines1.length;
    const lineIndexWithinBlock = isSecondBlock
      ? index - wrappedLines1.length
      : index;

    // Option A: treat all lines as one vertical stack:
    const y = baseY + index * lineSpacing;

    // If you want a little extra gap between block1 and block2:
    // const extraGap = isSecondBlock ? 4 : 0;
    // const y = baseY + index * lineSpacing + extraGap;

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

  // 4) CTA + quote reveal after everything is “comfortably done”
  const totalDuration = totalChars * eachLetterDelay + 2000;

  setTimeout(() => {
    if (cta) cta.classList.add('page__cta--visible');
    if (quote) quote.classList.add('page__quote--visible');
  }, totalDuration);
}

// helper used above
function wrapText(text, maxCharsPerLine) {
  const words = text.split(' ');
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


function showFallback(fallbackLines, cta, quote) {
    fallbackLines.forEach(el => {
        el.style.display = 'block';
    });
    if (cta) cta.classList.add('page__cta--visible');
    if (quote) quote.classList.add('page__quote--visible');
}