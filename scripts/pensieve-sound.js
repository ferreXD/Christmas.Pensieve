// scripts/engine/pensieve-sound.js
// PensieveSound
// - Small sound engine for one-shot SFX + optional looping ambience
// - Handles user-gesture unlock (autoplay restrictions)
// - Supports "pools" for overlapping plays (same SFX triggered rapidly)
// - Optional WebAudio path for better control; falls back to HTMLAudioElement

(function (global) {
  const DEFAULTS = {
    // Prefer WebAudio (better layering / volume control), but allow fallback.
    preferWebAudio: true,

    // Master volume (0..1)
    masterVolume: 0.85,

    // Smooth fade times (seconds) for ambience
    ambienceFadeIn: 0.8,
    ambienceFadeOut: 0.6,

    // For one-shot SFX overlap: number of clones/pool size per sound
    poolSize: 4,
  };

  function create(userOptions = {}) {
    const cfg = { ...DEFAULTS, ...userOptions };

    const state = {
      unlocked: false,

      // WebAudio
      ctx: null,
      master: null,

      // registries
      sounds: new Map(),   // key -> def
      pools: new Map(),    // key -> [HTMLAudioElement] (fallback path)
      ambience: null,      // { key, node, gain, source } (webaudio) OR { audio }
    };

    // ---------- Unlock ----------
    function unlock() {
      // Must be called from a user gesture at least once.
      if (state.unlocked) return true;

      if (cfg.preferWebAudio && global.AudioContext) {
        try {
          state.ctx = state.ctx || new global.AudioContext();
          state.master = state.master || state.ctx.createGain();
          state.master.gain.value = clamp01(cfg.masterVolume);
          state.master.connect(state.ctx.destination);

          // Resume if suspended
          if (state.ctx.state === 'suspended') {
            state.ctx.resume?.().catch(() => {});
          }

          state.unlocked = true;
          return true;
        } catch {
          // fall through to HTMLAudio unlock
        }
      }

      // Fallback: HTMLAudio "unlock" is basically just: allow play attempts later.
      state.unlocked = true;
      return true;
    }

    function isUnlocked() {
      return !!state.unlocked;
    }

    // ---------- Register ----------
    // def: { src, volume=1, rate=1, poolSize, kind: 'sfx'|'ambience' }
    function register(key, def) {
      if (!key) throw new Error('PensieveSound.register: key is required');
      if (!def?.src) throw new Error(`PensieveSound.register("${key}"): def.src is required`);

      const normalized = {
        src: def.src,
        volume: def.volume ?? 1,
        rate: def.rate ?? 1,
        kind: def.kind ?? 'sfx',
        poolSize: def.poolSize ?? cfg.poolSize,
      };

      state.sounds.set(key, normalized);

      // Prepare HTMLAudio pool (fallback path).
      // (Even if we use WebAudio, this is cheap and gives us a safe fallback.)
      const pool = [];
      for (let i = 0; i < normalized.poolSize; i++) {
        const a = new Audio(normalized.src);
        a.preload = 'auto';
        a.volume = clamp01(normalized.volume) * clamp01(cfg.masterVolume);
        a.playbackRate = normalized.rate;
        pool.push(a);
      }
      state.pools.set(key, pool);

      return key;
    }

    // ---------- Play one-shot ----------
    async function play(key, options = {}) {
      const def = state.sounds.get(key);
      if (!def) return false;

      const vol = clamp01((options.volume ?? def.volume) * cfg.masterVolume);
      const rate = options.rate ?? def.rate;

      // If not unlocked, try anyway (might fail). Better: caller unlocks on gesture.
      // WebAudio path
      if (cfg.preferWebAudio && state.ctx && state.master) {
        try {
          const buf = await fetchAndDecode(def.src, state.ctx);

          const source = state.ctx.createBufferSource();
          source.buffer = buf;
          source.playbackRate.value = rate;

          const gain = state.ctx.createGain();
          gain.gain.value = vol;

          source.connect(gain);
          gain.connect(state.master);

          source.start(0);

          return true;
        } catch {
          // fallback below
        }
      }

      // HTMLAudio fallback path (pool)
      try {
        const pool = state.pools.get(key);
        if (!pool || pool.length === 0) return false;

        const a = pickAvailableAudio(pool);
        a.volume = vol;
        a.playbackRate = rate;

        // rewind & play
        a.currentTime = 0;
        await a.play();
        return true;
      } catch {
        return false;
      }
    }

    // ---------- Ambience ----------
    // One ambience at a time for simplicity (fits your ceremony vibe).
    async function playAmbience(key, options = {}) {
      const def = state.sounds.get(key);
      if (!def) return false;

      const volTarget = clamp01((options.volume ?? def.volume) * cfg.masterVolume);
      const rate = options.rate ?? def.rate;

      // Stop current ambience if different
      if (state.ambience?.key && state.ambience.key !== key) {
        await stopAmbience({ fadeOut: true });
      }

      // WebAudio ambience
      if (cfg.preferWebAudio && state.ctx && state.master) {
        try {
          const buf = await fetchAndDecode(def.src, state.ctx);

          const source = state.ctx.createBufferSource();
          source.buffer = buf;
          source.loop = true;
          source.playbackRate.value = rate;

          const gain = state.ctx.createGain();
          gain.gain.value = 0;

          source.connect(gain);
          gain.connect(state.master);
          source.start(0);

          const fadeIn = options.fadeInSec ?? cfg.ambienceFadeIn;
          rampGain(state.ctx, gain.gain, 0, volTarget, fadeIn);

          state.ambience = { key, source, gain };
          return true;
        } catch {
          // fallback below
        }
      }

      // HTMLAudio ambience fallback
      try {
        const a = new Audio(def.src);
        a.loop = true;
        a.preload = 'auto';
        a.volume = 0;
        a.playbackRate = rate;

        await a.play();

        const fadeIn = options.fadeInSec ?? cfg.ambienceFadeIn;
        fadeHtmlAudio(a, 0, volTarget, fadeIn);

        state.ambience = { key, audio: a };
        return true;
      } catch {
        return false;
      }
    }

    async function stopAmbience(options = {}) {
      if (!state.ambience) return true;

      const fadeOut = options.fadeOut !== false;
      const fadeOutSec = options.fadeOutSec ?? cfg.ambienceFadeOut;

      // WebAudio
      if (state.ambience.source && state.ambience.gain && state.ctx) {
        const { source, gain } = state.ambience;

        if (fadeOut) {
          rampGain(state.ctx, gain.gain, gain.gain.value, 0, fadeOutSec);
          await sleep(Math.ceil(fadeOutSec * 1000));
        }

        try { source.stop(0); } catch {}
        state.ambience = null;
        return true;
      }

      // HTMLAudio
      if (state.ambience.audio) {
        const a = state.ambience.audio;

        if (fadeOut) {
          fadeHtmlAudio(a, a.volume, 0, fadeOutSec);
          await sleep(Math.ceil(fadeOutSec * 1000));
        }

        try { a.pause(); } catch {}
        state.ambience = null;
        return true;
      }

      state.ambience = null;
      return true;
    }

    // ---------- Master controls ----------
    function setMasterVolume(v) {
      cfg.masterVolume = clamp01(v);
      if (state.master) state.master.gain.value = cfg.masterVolume;

      // also update HTMLAudio pools
      for (const [key, pool] of state.pools.entries()) {
        const def = state.sounds.get(key);
        if (!def) continue;
        for (const a of pool) {
          a.volume = clamp01(def.volume) * cfg.masterVolume;
        }
      }
    }

    function destroy() {
      try { stopAmbience({ fadeOut: false }); } catch {}
      if (state.ctx) {
        try { state.ctx.close?.(); } catch {}
      }
      state.sounds.clear();
      state.pools.clear();
    }

    return {
      unlock,
      isUnlocked,
      register,
      play,
      playAmbience,
      stopAmbience,
      setMasterVolume,
      destroy,
      cfg,
    };
  }

  // ---------- helpers ----------
  const bufferCache = new Map(); // src -> AudioBuffer

  async function fetchAndDecode(src, ctx) {
    const cacheKey = `${src}::${ctx.sampleRate}`;
    if (bufferCache.has(cacheKey)) return bufferCache.get(cacheKey);

    const res = await fetch(src);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr.slice(0));
    bufferCache.set(cacheKey, buf);
    return buf;
  }

  function pickAvailableAudio(pool) {
    // pick first paused, else steal the oldest (index 0) by pausing it
    for (const a of pool) {
      if (a.paused) return a;
    }
    const a = pool[0];
    try { a.pause(); } catch {}
    return a;
  }

  function rampGain(ctx, audioParam, from, to, seconds) {
    const now = ctx.currentTime;
    audioParam.cancelScheduledValues(now);
    audioParam.setValueAtTime(from, now);
    audioParam.linearRampToValueAtTime(to, now + Math.max(0.001, seconds));
  }

  function fadeHtmlAudio(a, from, to, seconds) {
    const start = performance.now();
    const durMs = Math.max(1, seconds * 1000);

    function tick() {
      const t = (performance.now() - start) / durMs;
      if (t >= 1) {
        a.volume = to;
        return;
      }
      a.volume = from + (to - from) * t;
      requestAnimationFrame(tick);
    }
    tick();
  }

  function clamp01(x) {
    x = Number(x);
    if (!Number.isFinite(x)) return 0;
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  global.PensieveSound = { create };
})(window);
