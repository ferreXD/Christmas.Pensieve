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
    let ambienceThreadStarted = false;

    const globalSound = registerGlobalSoundEffects();
    const ambienceSound = registerAmbienceSoundEffects();
    const vialSound = registerVialsSoundEffects();
    const basinSound = registerBasinSoundEffects();

    const tilt = PensieveVialTilt.create({
      tiltPhase: { from: 0.00, to: 0.04 }, // normalized window
      maxTiltDeg: 20,  // positive = tilt right
      liftPx: -4,
      totalDurationMs: 1000,
      onTilt: () => {
        ambienceThreadStarted = true;
        vialSound.playAmbience('vials-threads', { volume: 0.08, loop: true, fadeInSec: 3.2 });
      }
    });

    const basinWater = PensieveBasinWater.create({
      canvasId: 'basin-water',
      baseUrl: 'assets/water-base-2.jpg',
      normalUrl: 'assets/water-normal.jpg',

       // Much darker ink base (deep blue-black)
      darkWater: [0.012, 0.021, 0.048],

      // Keep texture alive but submerged
      baseMix: 0.48,
      baseContrast: 1.55,
      baseBrightness: 0.70,

      // Bigger “waves” + slower drift
      normalScale: 0.88,
      normalSpeed: 0.015,
      refractStrength: 0.055,

      // Add low-frequency drift without getting chaotic
      secondLayerStrength: 0.75,
      secondLayerScaleMul: 0.85,
      secondLayerSpeedMul: 0.40,

      breathSpeed: 0.65,
      breathStrength: 0.18,
      wakeBoost: 0.24,

      glowTint: [0.14, 0.20, 0.36],
      glowIntensity: 0.075,

      preferRepeatIfPOT: true
    });

    const memoryWater = PensieveMemoryWater.create({
      canvasId: 'memory-media',
      normalUrl: 'assets/water-normal.jpg',
      normalScale: 0.80,
      normalSpeed: 0.028,
      refractStrength: 0.016,
      wakeBoost: 0.20,
    });

    let basinSoundStarted = false;
    const basinWake = PensieveBasinWake?.create({
        phase: { from: 0.18, to: 0.50 },
        onWake: (p) => {
          basinWater?.setWake?.(p);
          memoryWater?.setWake?.(p);
          if (!basinSoundStarted && p >= 0.32) {
            basinSoundStarted = true;
            basinSound.playAmbience('basin-ambience', { volume: 0.66, loop: true, fadeInSec: 0.5 });
          }
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

    const camera = PensieveSceneCamera?.create({
      phase: { from: 0.08, to: 0.42 },
      stackSelector: '#scene-stack',
      travelScreens: 1,
      onProgress: (p) => {
        // p: 0 (vials) -> 1 (basin)
        // fade out early so it's gone by the time the basin is on screen
        const fade = 1 - Math.min(1, Math.max(0, (p - 0.05) / 0.35));
        document.documentElement.style.setProperty('--particles-opacity', String(fade));

        if (ambienceThreadStarted && p >= 0.66) {
          ambienceThreadStarted = false;
          vialSound.stopAmbience('vials-threads', { fadeOut: true, fadeOutSec: 2.6 });
        }
      },
    });

    const RING = {
      center: { x: 0.5, y: 0.56 },   // or whatever you want, but ONE truth
      radius: 0.305,
    };

    const circleForm = PensieveCircleFormation?.create({
      canvasId: 'basin-canvas',      // important: use basin layer canvas
      basinSelector: '#scene-basin',
      phase: { from: 0.52, to: 0.78 },
      ringCenter: RING.center,
      ringRadius: RING.radius,
      maxParticles: 64,

      // new gentle spawn params
      spawnRate: 48,
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
      ringCenter: circleForm?.cfg?.ringCenter ??RING.center,
      ringRadius: circleForm?.cfg?.ringRadius ??RING.radius,
      featherPx: 20
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
    const basinEl = document.querySelector('#scene-basin');

    // Gate so click only works after ceremony ended
    let basinBackEnabled = false;

    function onBasinClick(ev) {
      if (!basinBackEnabled) return;

      // optional: ignore clicks on memory-layer content if you want
      if (ev.target.closest?.('#memory-layer')) return;

      basinBackEnabled = false;
      returnToVials();
    }

    basinEl?.addEventListener('click', onBasinClick);

    function animateCameraBack(camera, durationMs = 900, onDone) {
      const start = performance.now();

      function tick(now) {
        const p = Math.min(1, (now - start) / durationMs);
        camera?.applyReverse?.(p);
        if (p < 1) requestAnimationFrame(tick);
        else onDone?.();
      }

      requestAnimationFrame(tick);
    }

    function returnToVials() {
      if (!activeCeremony) return;

      const { vialButton, memoryId } = activeCeremony;

      // fully reset the vial pose
      tilt.reset(vialButton);
      
      // Stop basin ambience
      basinSound.stopAmbience('basin-ambience', { fadeOut: true, fadeOutSec: 1.8 });  
      basinSoundStarted = false;

      // Leave the vial "uncorked" (open class stays), but disable clicking it from now on
      PensieveVialCork?.disableVial?.(vialButton);

      // Make the vial contain only a few bottom “residual” threads
      PensieveVialThreads?.setResidual?.(vialButton, { amount: 6 });

      animateCameraBack(camera, 1800, () => { });
      // Run a short reverse tilt + camera reset
      const backClock = CeremonyClock.create({
        totalDurationMs: 900,
        onUpdate: ({ t }) => {
          // t goes 0..1. We want reverse (1..0)
          // const rev = 1 - t;
          // tilt.apply(vialButton, rev);
        },
        onEnd: () => {
          // 6) Cleanup ceremony running flag
          vialButton.classList.remove('is-ceremony-running');

          // 7) Hide/clear memory content immediately (or you can fade it out with a small reveal reset)
          mediaReveal?.reset();
          captionReveal?.reset();
          memoryLayer?.clear?.();
          circleForm?.stop?.();

          // 8) Drop active ceremony
          activeCeremony = null;
        }
      });

      backClock.start();
    }

    PensieveVialCork?.init({
      allowToggle: false,
      onOpen: ({ vialButton, memoryId }) => {
        // Guard: only one ceremony at a time
        if (activeCeremony?.clock?.isRunning()) return;
        
        vialSound.play('cork-pop', { volume: 0.20 });

        // Mark running (helps CSS / future modules)
        vialButton.classList.add('is-ceremony-running');
        
        const content = MEMORY_CONTENT[`memory-${memoryId}`];
        if (content) {
          memoryLayer?.mount({ id: memoryId, ...content });
          memoryWater.setSource({ kind: content.kind, src: content.src });
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
            console.log('Ceremony end for memory', memoryId);
            basinBackEnabled = true;
          }
        });

        activeCeremony = { clock, vialButton, memoryId };
        clock.start();
      }
    });

    const cta = document.querySelector('.page__cta');

    const ripple = PensieveRippleTransition?.init({
      durationMs: 3600,
      prelude: 0.33,
      preludeFadeStart: 0.56,
      vialsFadeInDelayMs: 120,
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
      originSelector: '.page__handwriting',
      onEnd: () => {
        rippleTransitionCallback(vialSound);
        vialSound.playAmbience('vials-orbit', {
          loop: true,
          volume: 0.01,
          fadeInSec: 0.06
        });
      }
    });

    const handwriting = PensieveHandwriting.init({
      autostart: false,
      text: {
        line1: 'Algunos recuerdos no tienen por qué ser grandes para ser importantes.',
        line2: 'Estos son algunos que no quería perder.'
      },
      wrap: { maxCharsPerLine: 30 },
      layout: { baseY: 10, lineSpacing: 14, blockGap: 4 },
      timing: { eachLetterDelay: 100, linePause: 500, revealPaddingMs: 2000 },
      manuscript: {
        fontName: 'Pinyon Script',
        fontSize: '14px',
        ManuscriptCtor: Manuscript,
        fontMatrix: FONT_MATRIX,
      },
      onDone: () => {
        // Start ripple immediately when handwriting ends
        setTimeout(() => {
          ripple?.start?.();
        }, 2000);
        globalSound.stopAmbience({ fadeOut: true, fadeOutSec: 0.25 });
      }
    });

    cta?.addEventListener('click', () => {
      // Unlock audio + start ambience here (gesture-safe)
      globalSound.unlock();

      // Prevent double clicks
      cta.disabled = true;
      cta.style.pointerEvents = 'none';
      cta.style.opacity = '0';

      // Start the handwriting now
      handwriting.start?.();
      globalSound.playAmbience('handwrite', { volume: 0.25, fadeInSec: 0.05 });
      ambienceSound.playAmbience('pensieve-amb', { volume: 0.03, fadeInSec: 6.0 });
      // Optional: show quote now or later, your choice
      document.querySelector('.page__quote')?.classList.add('page__quote--visible');
    }, { once: true });

    cta?.classList.add('page__cta--visible');
});


function rippleTransitionCallback(sound) {
    if (PensieveParticles) {
        PensieveParticles.init('particles', {
            maxParticles: 70, // puedes bajar a 40 si ves lag
            densityFactor: 0.00012,
        });
    }

    if (PensieveCtaParticles) {
        PensieveCtaParticles.init({
          count: 32,
          intensity: 1.5,
          glow: 1.8,
      });
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
        scaleMax: 1.20,
        onFocus: (_) => {
          sound.stopAmbience();
          // sound.play('vials-touch', { 
          //   volume: 0.01,
          //   playbackRate: 0.95 + Math.random() * 0.1 
          // });
        },
        onFocusOut: (_) => {
          sound.playAmbience('vials-orbit', {
            loop: true,
            volume: 0.01, 
          });
        }
      });
    }
}

function registerAmbienceSoundEffects() {
  const sound = PensieveSound.create({
    masterVolume: 0.65,
    preferWebAudio: true,
  });

  sound.register('pensieve-amb', { src: 'assets/sfx/pensieve-amb.mp3', loop: true, volume: 0.10 });

  return sound;
}

function registerGlobalSoundEffects() {
  const sound = PensieveSound.create({
    masterVolume: 0.9,
    preferWebAudio: true,
  });

  sound.register('handwrite', { src: 'assets/sfx/handwriting-loop.mp3', loop: true, volume: 0.25 });

  return sound;
}

function registerVialsSoundEffects() {
  const sound = PensieveSound.create({
    masterVolume: 0.33,
    preferWebAudio: true,
  });

  sound.register('cork-pop', { src: 'assets/sfx/cork-pop.mp3', volume: 0.40 });
  sound.register('vials-orbit', { src: 'assets/sfx/vials-orbit.wav', loop: true, volume: 0.01 });
  sound.register('vials-touch', { src: 'assets/sfx/vials-touch.wav', volume: 0.01 });
  sound.register('vials-threads', { src: 'assets/sfx/vials-threads.mp3', volume: 0.12, loop: true });

  return sound;
}

function registerBasinSoundEffects() {
  const sound = PensieveSound.create({
    masterVolume: 0.66,
    preferWebAudio: true,
  });

  sound.register('basin-ambience', { src: 'assets/sfx/basin-ambience.mp3', loop: true, volume: 0.66 });
  sound.register('fade-in', { src: 'assets/sfx/fade-in.mp3', volume: 0.10 });

  return sound;
}