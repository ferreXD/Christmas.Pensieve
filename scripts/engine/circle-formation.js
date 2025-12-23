// scripts/circle-formation.js
// PensieveCircleFormation v2
// - Burst bubble rise during phase window
// - Then locks particles onto a ring and runs forever (spiral loop)
// - Stops only when you call .stop()

(function (global) {
  const DEFAULTS = {
    canvasId: 'basin-canvas',
    basinSelector: '#scene-basin',

    // Phase window that TRIGGERS the burst/lock
    phase: { from: 0.30, to: 0.70 },

    // Ring placement inside basin rect
    ringCenter: { x: 0.5, y: 0.56 },
    ringRadius: 0.305,          // normalized vs min(basinW, basinH)

    // Irregularity / life
    wobbleAmp: 0.022,
    wobbleFreq: 0.45,
    ringNoiseAmp: 0.018,
    ringNoiseFreq: 0.55,

    // Population
    maxParticles: 70,
    spawnRate: 14,          // particles/sec (gentle)
    spawnJitterPx: 6,       // tiny position jitter (not velocity)
    spawnRingBias: 0.55,    // 0=center, 1=near ring; start closer to ring
    spawnAlphaIn: 0.12,     // seconds to fade-in each particle

    // Lock + infinite loop dynamics
    lockStrength: 4.6,          // how hard they converge to ring
    radiusDamping: 0.90,        // damp radial oscillation
    swirlBase: 0.18,            // base angular speed
    swirlVar: 0.07,             // per-particle variance
    swirlAccel: 0.10,           // during lock-in, speeds up swirl slightly
    spiralBias: 0.015,           // tiny inward/outward breathing drift

    // Timing inside the phase window (local 0..1)
    lockStart: 0.10,
    lockEnd: 0.92,

    // Draw style (thread-like trails)
    lineWidth: { min: 1.6, max: 2.6 },
    maxAlpha: 0.42,
    glowBlur: 9,
    hue: { min: 205, max: 225 },
    trailPoints: 7,

    // Fade-in when starting; after locked, it stays visible
    burstFadeIn: 0.10,
    
    spawnOuterBand: {
      min: 0.72,  // 0..1 of baseR (raise to shorten travel more)
      max: 0.98,  // keep < 1 to avoid popping outside edge
    },

    bubbleBobAmp: 10,      // px
    bubbleBobFreq: 0.35,   // Hz-ish (slow)
    bubbleBobPhaseLock: 0.85, // 0..1 (1 = locked to spiral angle)
  };

  function create(userOptions = {}) {
    const cfg = deepMerge(structuredClone(DEFAULTS), userOptions);
    const canvas = document.getElementById(cfg.canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const state = {
      dpr: window.devicePixelRatio || 1,
      raf: null,
      last: 0,

      // lifecycle
      started: false,     // burst has been triggered at least once
      locked: false,      // ring lock achieved
      running: false,     // drawing loop running

      // time
      startMs: 0,
      lastTNorm: 0,

      particles: [],
    };

    function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
    function rand(min, max) { return min + Math.random() * (max - min); }

    function resize() {
      const basin = document.querySelector(cfg.basinSelector);
      if (!basin) return;

      const dpr = window.devicePixelRatio || 1;
      const r = basin.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));

      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    function getBasinRect() {
      const basin = document.querySelector(cfg.basinSelector);
      return basin ? basin.getBoundingClientRect() : null;
    }

    function phaseT(t, from, to) {
      if (t <= from) return 0;
      if (t >= to) return 1;
      return (t - from) / (to - from);
    }

    function ensureLoop() {
      if (state.raf != null) return;
      state.last = 0;
      state.running = true;
      state.raf = requestAnimationFrame(frame);
    }

    function stop() {
      state.running = false;
      state.started = false;
      state.locked = false;
      state.particles.length = 0;

      if (state.raf != null) cancelAnimationFrame(state.raf);
      state.raf = null;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }

    // Call this each ceremony tick.
    // It triggers burst/lock once; after lock it keeps animating forever.
    function apply(tNorm) {
      state.lastTNorm = tNorm;

      const p = phaseT(tNorm, cfg.phase.from, cfg.phase.to);
      if (p > 0.0005 && !state.started) {
        state.started = true;
        state.startMs = performance.now();
        ensureLoop();
      }

      // Once started, never auto-stop here. Only stop() stops it.
      // Lock status is progressed inside the animation loop using the same phase window.
    }

    function initTrail(x, y, n) {
      const pts = [];
      for (let i = 0; i < n; i++) pts.push({ x, y });
      return pts;
    }

    function pushTrail(p, x, y) {
        const last = p.trail[0];
        if (last) {
            p.trail.unshift({
                x: last.x + (x - last.x) * 0.75,
                y: last.y + (y - last.y) * 0.75,
            });
        } else {
            p.trail.unshift({ x, y });
        }

        if (p.trail.length > cfg.trailPoints) p.trail.pop();
    }

    function spawnGentle(basin, dt, cx, cy, baseR) {
      if (state.particles.length >= cfg.maxParticles) return;

      // accumulate fractional spawns
      state.spawnCarry = (state.spawnCarry ?? 0) + (cfg.spawnRate ?? 14) * dt;

      const want = Math.min(
        cfg.maxParticles - state.particles.length,
        Math.floor(state.spawnCarry)
      );

      state.spawnCarry -= want;
      if (want <= 0) return;

      const jitter = cfg.spawnJitterPx ?? 6;
      const eps = 0.0001;

      for (let i = 0; i < want; i++) {
        // --- 1) Spawn ANYWHERE inside the disk (uniform area) ---
        const a = Math.random() * Math.PI * 2;
        const band = cfg.spawnOuterBand || { min: 0.72, max: 0.98 };
        const rMin = baseR * Math.max(0, Math.min(1, band.min));
        const rMax = baseR * Math.max(0, Math.min(1, band.max));

        // uniform by AREA within annulus
        const u = Math.random();
        const r = Math.sqrt(rMin * rMin + u * (rMax * rMax - rMin * rMin));


        const x = cx + Math.cos(a) * r + rand(-jitter, jitter);
        const y = cy + Math.sin(a) * r + rand(-jitter, jitter);

        // --- 2) Nearest ring point is at same polar angle ---
        const dx = x - cx;
        const dy = y - cy;
        const theta0 = Math.atan2(dy, dx);

        const hue = rand(cfg.hue.min, cfg.hue.max);
        const lw = rand(cfg.lineWidth.min, cfg.lineWidth.max);

        // Keep omega per-particle variance
        const omega = (cfg.swirlBase + rand(-cfg.swirlVar, cfg.swirlVar));

        // Initialize rOffset so the particle's "intended radius" starts near spawn radius
        const r0 = Math.sqrt(dx * dx + dy * dy);
        const rOffset0 = Math.max(-1, Math.min(1, ((r0 / (baseR + eps)) - 1) / 0.08));

        state.particles.push({
          x, y,
          vx: 0, vy: 0,

          hue,
          lw,
          alpha: rand(0.28, 0.55),

          seed: Math.random() * 1000,
          phase: Math.random() * Math.PI * 2,

          // start theta at spawn angle -> nearest ring point
          theta: theta0,
          omega,

          rOffset: rOffset0,
          rVel: 0,

          bornMs: performance.now(),
          trail: initTrail(x, y, cfg.trailPoints),
        });
      }
    }

    function frame(now) {
      state.raf = requestAnimationFrame(frame);
      if (!state.running) return;

      if (!state.last) state.last = now;
      let dt = (now - state.last) / 1000;
      if (dt > 0.05) dt = 0.05;
      state.last = now;

      const basin = getBasinRect();
      if (!basin) return;

      const tSec = now / 1000;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const minDim = Math.min(basin.width, basin.height);
      const cx = basin.width * cfg.ringCenter.x;
      const cy = basin.height * cfg.ringCenter.y;

      // Compute lock progress using the phase window, but don’t stop after it.
      const p = phaseT(state.lastTNorm, cfg.phase.from, cfg.phase.to);
      const lockT = clamp01((p - cfg.lockStart) / (cfg.lockEnd - cfg.lockStart));
      if (lockT >= 0.999) state.locked = true;

      // Spawn only while not locked (burst phase)// Ring base radius breathing
      const baseR = minDim * cfg.ringRadius;

      // Spawn gently while not locked (no burst)
      if (!state.locked) spawnGentle(basin, dt, cx, cy, baseR);

      // Ring base radius breathing
      const breath = Math.sin(tSec * cfg.wobbleFreq) * cfg.wobbleAmp;

      for (const part of state.particles) {
        // Once locked, we drive them primarily by ring parameters (theta/omega)
        // But we still allow some “thread life” via radius noise + tiny spiral bias.

        // target radius with irregularity
        const rn = Math.sin(tSec * cfg.ringNoiseFreq + part.seed + part.theta * 3.0) * cfg.ringNoiseAmp;
        const targetR = baseR * (1 + breath + rn);

        // lock blending: 0 = burst chaos, 1 = ring control
        const k = state.locked ? 1 : lockT;

        // --- update theta (infinite loop) ---
        const omega = part.omega * (1 + k * cfg.swirlAccel);
        part.theta += omega * dt;

        // --- radial convergence to ring ---
        // model: rOffset is a small signed offset from target radius
        const radialErr = (0 - part.rOffset); // want offset -> 0

        // tiny breathing spiral (keeps “alive” forever)
        const spiral = Math.sin(tSec * 0.6 + part.phase) * cfg.spiralBias;

        // pull offset toward 0 with damping (stronger as k increases)
        part.rVel = (part.rVel + radialErr * (cfg.lockStrength * (0.25 + 0.75 * k)) * dt) * cfg.radiusDamping;
        part.rOffset += part.rVel * dt + spiral * dt;

        // Locked to the spiral angle so it feels like “ritual motion”, not randomness.
        // ceremonial "bubble" as radial breath (NOT vertical bob)
        const bobPhase =
            (cfg.bubbleBobPhaseLock ?? 0.85) * part.theta +
            (1 - (cfg.bubbleBobPhaseLock ?? 0.85)) * (part.seed + part.phase);

        const bobPx = Math.sin(tSec * (cfg.bubbleBobFreq ?? 0.35) * Math.PI * 2 + bobPhase) * (cfg.bubbleBobAmp ?? 10);

        // convert px -> normalized radius delta
        const bobR = bobPx / (baseR + 0.0001);

        // stronger after lock-in
        const bobStrength = state.locked ? 1 : (0.15 + 0.85 * k);

        // apply as a gentle radius modulation
        const targetRBobbed = targetR * (1 + bobR * 0.22 * bobStrength);
        const r = targetRBobbed * (1 + part.rOffset * 0.08);

        // target position on ring
        const tx = cx + Math.cos(part.theta) * r;
        const ty = cy + Math.sin(part.theta) * r;

        if (!state.locked) {
          // during burst: blend from free velocity motion to ring control
          part.vx *= 0.94;
          part.vy *= 0.94;

          part.x += part.vx * dt;
          part.y += part.vy * dt;

          part.x += (tx - part.x) * (0.35 + 0.55 * k) * dt * 8;
          part.y += (ty - part.y) * (0.35 + 0.55 * k) * dt * 8;
        } else {
          // locked: follow ring cleanly (infinite loop)
          part.x += (tx - part.x) * 0.42;
          part.y += (ty - part.y) * 0.42;
        }

        pushTrail(part, part.x, part.y);

        // --- draw as thread trail ---
        const bornAge = (performance.now() - (part.bornMs ?? state.startMs)) / 1000;
        const alphaIn = cfg.spawnAlphaIn ?? 0.12;
        const lifeAlpha = clamp01(bornAge / (alphaIn + 0.0001));
        
        const a = cfg.maxAlpha * part.alpha * lifeAlpha;

        ctx.save();
        ctx.lineWidth = part.lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = cfg.glowBlur;
        ctx.shadowColor = 'rgba(230,240,255,0.85)';

        const tr = part.trail;
        const head = tr[0];
        const tail = tr[tr.length - 1];

        const grad = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
        grad.addColorStop(0, `hsla(${part.hue}, 80%, 95%, ${a})`);
        grad.addColorStop(1, `hsla(${part.hue}, 70%, 90%, ${a * 0.45})`);
        ctx.strokeStyle = grad;

        ctx.beginPath();
        ctx.moveTo(tr[0].x, tr[0].y);
        for (let i = 1; i < tr.length; i++) ctx.lineTo(tr[i].x, tr[i].y);
        ctx.stroke();
        ctx.restore();
      }
    }

    return { apply, stop, resize, cfg };
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

  global.PensieveCircleFormation = { create };
})(window);
