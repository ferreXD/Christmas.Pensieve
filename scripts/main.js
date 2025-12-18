// scripts/main.js
import { Manuscript } from '../vendor/khoshnus/khoshnus.js';
import { FONT_MATRIX, initialize } from '../vendor/khoshnus/initialize.js';

// NOTE: Manuscript is also defined by the library; depending on how it's exported,
// you might also be able to do: `import { Manuscript } from '../vendor/khoshnus.js';`
// For now we'll assume it's on the global (see comment below).

const MEMORY_CONTENT = {
  // memoryId coming from vial cork open
  "memory-1": { kind: "image", src: "assets/memories/m1.jpg", caption: "Caption number 1" },
  "memory-2": { kind: "image", src: "assets/memories/m2.jpg", caption: "Caption number 2" },
  "memory-3": { kind: "image", src: "assets/memories/m3.jpg", caption: "Caption number 3" },
};

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
      tiltPhase: { from: 0.00, to: 0.04 }, // normalized window
      maxTiltDeg: 20,  // positive = tilt right
      liftPx: -4,
      totalDurationMs: 1000
    });

    const basinWater = PensieveBasinWater.create({
      canvasId: 'basin-water',
      baseUrl: 'assets/water-base-2.jpg',
      normalUrl: 'assets/water-normal.jpg',

       // Much darker ink base (deep blue-black)
      darkWater: [0.004, 0.007, 0.016],

      // Keep texture alive but submerged
      baseMix: 0.48,
      baseContrast: 1.10,
      baseBrightness: 0.80,

      // Bigger “waves” + slower drift
      normalScale: 0.88,
      normalSpeed: 0.015,
      refractStrength: 0.030,

      // Add low-frequency drift without getting chaotic
      secondLayerStrength: 0.60,
      secondLayerScaleMul: 0.70,
      secondLayerSpeedMul: 0.30,

      breathSpeed: 0.65,
      breathStrength: 0.06,
      wakeBoost: 0.18,

      glowTint: [0.14, 0.20, 0.36],
      glowIntensity: 0.075,

      preferRepeatIfPOT: true
    });

    const basinWake = PensieveBasinWake?.create({
        phase: { from: 0.18, to: 0.50 },
        onWake: (p) => {
          basinWater?.setWake?.(p);
        }
    });

    const basinVisibility = PensieveBasinVisibility?.create({
        phase: { from: 0.12, to: 0.50 },
        showAt: 0.15,
        onShow: () => {
          basinWater.resize();
          basinWater.start();
        }
    });

    // const threadTranslate = PensieveThreadTranslate?.create({
    //   basinCanvasId: 'basin-canvas',
    //   basinSelector: '#scene-basin',
    //   targetY: 0.52,
    //   alpha: 0.95,
    //   easing: (t) => t, // keep linear for now
    // });

    // const pour = PensieveVialPour.create({
    //   phase: { from: 0.14, to: 0.62 },
    //   onProgress: (p, { vialButton, t }) => {
    //     // threadTranslate?.apply(p, { vialButton, t });
    //   }
    // });

    const camera = PensieveSceneCamera?.create({
      phase: { from: 0.08, to: 0.42 },
      stackSelector: '#scene-stack',
      travelScreens: 1
    });

    const circleForm = PensieveCircleFormation?.create({
      canvasId: 'basin-canvas',      // important: use basin layer canvas
      basinSelector: '#scene-basin',
      phase: { from: 0.52, to: 0.78 },
      ringRadius: 0.335,
      maxParticles: 54,

      // new gentle spawn params
      spawnRate: 32,
      spawnJitterPx: 4,
      spawnRingBias: 0.62,
      spawnAlphaIn: 0.18,

      lineWidth: { min: 2.2, max: 3.4 },
      trailPoints: 32,
      maxAlpha: 0.42,
      glowBlur: 10,

      wobbleAmp: 0.010,
      wobbleFreq: 0.28,
      ringNoiseAmp: 0.012,
      ringNoiseFreq: 0.45,

      lockStrength: 3.6,
      radiusDamping: 0.90,

      swirlBase: 0.11,
      swirlVar: 0.03,
      swirlAccel: 0.06,
      spiralBias: 0.010,

      bubbleBobAmp: 8,
      bubbleBobFreq: 0.22,
      bubbleBobPhaseLock: 0.90,
    });

    const memoryLayer = PensieveMemoryLayer?.create({
      basinSelector: '#scene-basin',
      ringCenter: { x: 0.215, y: 0.435 },
      ringRadius: 0.285,
      featherPx: 20,
      caption: { offsetPx: 150 }
    });

    const mediaReveal = PensieveMemoryReveal?.create({
      selector: '#memory-media',
      phase: { from: 0.42, to: 1 },
      liftPx: 4,
      blurPx: 8,
      mask: { enabled: true, kind: 'radial', feather: 0.22, travel: 0.06 },
      edgeBlur: { from: 24, to: 4 },
      edgeMask: { from: 42, to: 58 },
      edgeMaskEnd: { from: 72, to: 88 },
    });

    const captionReveal = PensieveMemoryReveal?.create({
      selector: '#memory-caption',
      phase: { from: 0.62, to: 1 },
      liftPx: 2,
      blurPx: 4,
      mask: { enabled: false }, // caption doesn’t need mask
    });

    let activeCeremony = null;

    PensieveVialCork?.init({
      allowToggle: false,
      onOpen: ({ vialButton, memoryId }) => {
        // Guard: only one ceremony at a time
        if (activeCeremony?.clock?.isRunning()) return;

        // Mark running (helps CSS / future modules)
        vialButton.classList.add('is-ceremony-running');
        
        const content = MEMORY_CONTENT[`memory-${memoryId}`];
        if (content) {
          memoryLayer?.mount({ id: memoryId, ...content });
          mediaReveal?.reset();
          captionReveal?.reset();
        }

        const clock = CeremonyClock.create({
          totalDurationMs: 8000,
          onUpdate: ({ t }) => {
            tilt.apply(vialButton, t);
            // pour.apply(vialButton, t);
            camera?.apply(t);

            basinVisibility?.apply(t);
            basinWake?.apply(t);

            mediaReveal?.apply(t);
            captionReveal?.apply(t);
            circleForm?.apply(t);
          },
          onEnd: () => {
            // For now we keep the vial tilted at its final pose.
            // If you want it to “rest” back later, we’ll add a return phase.
            // pourTravel?.clear?.();
            // mediaReveal?.reset();
            // captionReveal?.reset();
            // memoryLayer?.clear();
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

     const wispBridge = PensieveWispBridge?.create({
      canvasId: 'pour-travel',        // reuse existing overlay canvas
      basinSelector: '#scene-basin',
      basinTarget: { x: 0.5, y: 0.46 } // “second layer” feel (a bit higher than your basin center)
    });

    if (PensieveVialThreads) {
      PensieveVialThreads.init('.vial', {
        wispCount: 24,
        speed: { min: 6, max: 12 },
        segmentCount: { min: 6, max: 10 },
        noiseStrength: { min: 0.4, max: 0.6 },
        baseAlpha: { min: 0.35, max: 0.55 },
        pour: {
          offsetMax: 1.0,
          gravity: 14,
          steer: 0.03,
          speedMul: 0.18,
          pourNoiseDampen: 0.45
        },
        egress: {
          enabled: true,
          emitZone: 0.10,
          maxPerFrame: 4,
          cooldownMs: 90,
          onEmit: (p) => wispBridge?.emit(p)
        }
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