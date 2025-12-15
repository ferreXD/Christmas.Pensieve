// scripts/main.js
import { Manuscript } from '../vendor/khoshnus/khoshnus.js';
import { FONT_MATRIX, initialize } from '../vendor/khoshnus/initialize.js';

// NOTE: Manuscript is also defined by the library; depending on how it's exported,
// you might also be able to do: `import { Manuscript } from '../vendor/khoshnus.js';`
// For now we'll assume it's on the global (see comment below).

document.addEventListener('DOMContentLoaded', () => {
    PensieveHandwriting.init({
      text: {
        // line1: 'Some memories are small, but still worth keeping.',
        // line2: 'These are a few I wanted to save with you.',
      },
      wrap: { maxCharsPerLine: 30 },
      layout: { baseY: 30, lineSpacing: 16, blockGap: 4 },
      timing: { eachLetterDelay: 100, linePause: 500, revealPaddingMs: 2000 },
      manuscript: {
        fontName: 'Pinyon Script',
        fontSize: '12px',
        ManuscriptCtor: Manuscript,
        fontMatrix: FONT_MATRIX,
      }
    });

    PensieveRippleTransition?.init({
      durationMs: 0,
      prelude: 0.33,
      preludeFadeStart: 0.56,
      fadeIntroMs: 0,

      normalUrl: 'assets/water-normal.jpeg',
      normalScale: 1.60,
      normalSpeed: 0.055,
      refractStrength: 0.018,

      edgeSoftness: 0.060,
      darkWater: [0.015, 0.02, 0.04],

      preludeRingFreq: 58.0,
      preludeRingSpeed: 3.2,
      preludeRingBoost: 0.92,

      wavefrontBoost: 0.50,
      onEnd: rippleTransitionCallback
    });

    const tilt = PensieveVialTilt.create({
      tiltPhase: { from: 0.00, to: 0.52 }, // normalized window
      maxTiltDeg: 20,  // positive = tilt right
      liftPx: -4,
      totalDurationMs: 1000
    });

    let activeCeremony = null;

    PensieveVialCork?.init({
      allowToggle: false,
      onOpen: ({ vialButton, memoryId }) => {
        // Guard: only one ceremony at a time
        if (activeCeremony?.clock?.isRunning()) return;

        // Mark running (helps CSS / future modules)
        vialButton.classList.add('is-ceremony-running');

        const clock = CeremonyClock.create({
          totalDurationMs: 3600,
          onUpdate: ({ t }) => {
            tilt.apply(vialButton, t);
            // Later: pour.apply(...), camera.apply(...), etc.
          },
          onEnd: () => {
            // For now we keep the vial tilted at its final pose.
            // If you want it to “rest” back later, we’ll add a return phase.
            console.log('Ceremony end for memory', memoryId);
          }
        });

        activeCeremony = { clock, vialButton, memoryId };
        clock.start();
      }
    });
});


function rippleTransitionCallback() {
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
}