// scripts/main.js
import { Manuscript } from '../vendor/khoshnus/khoshnus.js';
import { FONT_MATRIX, initialize } from '../vendor/khoshnus/initialize.js';
import { write } from '../vendor/khoshnus/operations/operations.js';

// NOTE: Manuscript is also defined by the library; depending on how it's exported,
// you might also be able to do: `import { Manuscript } from '../vendor/khoshnus.js';`
// For now we'll assume it's on the global (see comment below).

document.addEventListener('DOMContentLoaded', () => {
    initHandwriting();
    initRippleTransition();
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

function initRippleTransition() {
  const page = document.querySelector('.page');
  const cta = document.querySelector('.page__cta');
  const canvas = document.getElementById('page-ripple-canvas');
  const vialsScreen = document.getElementById('screen-vials');
  const intro = document.querySelector('.page__content');

  if (!page || !cta || !canvas || !vialsScreen || !intro) return;
  if (!window.html2canvas) {
    console.warn('html2canvas not found; ripple transition disabled.');
    return;
  }

  const ctx = canvas.getContext('2d');
  let widthCss = 0;
  let heightCss = 0;
  let dpr = window.devicePixelRatio || 1;

  function resizeCanvas() {
    widthCss = window.innerWidth;
    heightCss = window.innerHeight;

    canvas.width = widthCss * dpr;
    canvas.height = heightCss * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  let animating = false;

  cta.addEventListener('click', async () => {
    if (animating) return;
    animating = true;

    cta.disabled = true;
    cta.classList.add('page__cta--clicked');

    // 1) Capture screenshot of current page (intro visible)
    const screenshotCanvas = await window.html2canvas(page, {
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      scrollX: 0,
      scrollY: 0,
      backgroundColor: null
    });

    // 2) Prepare a lower-res buffer for the ripple (for performance)
    const LOW_RES_SCALE = 0.55; // tweak: 0.4–0.7
    const lowW = Math.max(160, Math.round(widthCss * LOW_RES_SCALE));
    const lowH = Math.max(90, Math.round(heightCss * LOW_RES_SCALE));

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = lowW;
    srcCanvas.height = lowH;
    const srcCtx = srcCanvas.getContext('2d');

    srcCtx.drawImage(
      screenshotCanvas,
      0, 0, screenshotCanvas.width, screenshotCanvas.height,
      0, 0, lowW, lowH
    );

    const srcImageData = srcCtx.getImageData(0, 0, lowW, lowH);
    const srcData = srcImageData.data;

    const destCanvas = document.createElement('canvas');
    destCanvas.width = lowW;
    destCanvas.height = lowH;
    const destCtx = destCanvas.getContext('2d');
    let destImageData = destCtx.createImageData(lowW, lowH);
    let destData = destImageData.data;

    // 3) Compute ripple origin in LOW-RES coords
    const btnRect = cta.getBoundingClientRect();
    const originX = btnRect.left + btnRect.width / 2;
    const originY = btnRect.top + btnRect.height / 2;

    const scaleX = lowW / widthCss;
    const scaleY = lowH / heightCss;
    const originXLow = originX * scaleX;
    const originYLow = originY * scaleY;

    // 4) Start fade out/in
    page.classList.add('page--ripple');

    // Show vials + hide intro halfway through animation
    const DURATION = 2600; // ms
    const startTime = performance.now();

    setTimeout(() => {
      page.classList.add('page--vials-active');
      intro.classList.add('page__content--gone');
      
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
    }, DURATION * 0.5);

    function frame(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / DURATION);

      // Clear final canvas
      ctx.clearRect(0, 0, widthCss, heightCss);

      // Once done, stop drawing and free CPU
      if (t >= 1) {
        animating = false;
        ctx.clearRect(0, 0, widthCss, heightCss);
        return;
      }

      // Compute physical-ish wave parameters
      const maxRadius = Math.sqrt(lowW * lowW + lowH * lowH);

      const eased = easeOutQuad(t); // 0→1
      const waveRadius = eased * maxRadius;

      const AMPLITUDE = 4.5;   // px in low-res space
      const WAVELENGTH = 38;   // smaller = more oscillations
      const DECAY = 0.010;     // how fast ripple dies with distance
      const WAVE_SPEED = 1.8;  // time factor

      // Rebuild dest image each frame
      destImageData = destCtx.createImageData(lowW, lowH);
      destData = destImageData.data;

      for (let y = 0; y < lowH; y++) {
        for (let x = 0; x < lowW; x++) {
          const idx = (y * lowW + x) * 4;

          const dx = x - originXLow;
          const dy = y - originYLow;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;

          // Only affect pixels inside the expanding band
          // This creates a ring-ish ripple, not entire screen swirl.
          const influence = Math.exp(-DECAY * dist);

          // Phase: wave moves outward over time
          const phase = (dist - WAVE_SPEED * eased * maxRadius) / WAVELENGTH;

          // radial displacement
          const disp = AMPLITUDE * influence * Math.sin(phase * Math.PI * 2);

          const ux = dx / dist;
          const uy = dy / dist;

          let sx = x + ux * disp;
          let sy = y + uy * disp;

          // if outside, fall back to original coord
          if (sx < 0 || sx >= lowW || sy < 0 || sy >= lowH) {
            sx = x;
            sy = y;
          }

          const sx0 = Math.floor(sx);
          const sy0 = Math.floor(sy);
          const sIdx = (sy0 * lowW + sx0) * 4;

          destData[idx]     = srcData[sIdx];     // R
          destData[idx + 1] = srcData[sIdx + 1]; // G
          destData[idx + 2] = srcData[sIdx + 2]; // B
          destData[idx + 3] = srcData[sIdx + 3]; // A
        }
      }

      destCtx.putImageData(destImageData, 0, 0);

      // Draw low-res ripple stretched to full viewport
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, widthCss, heightCss);
      ctx.drawImage(destCanvas, 0, 0, widthCss, heightCss);
      ctx.restore();

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  });

  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }
}
