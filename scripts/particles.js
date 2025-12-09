// particles.js
(function (global) {
    const DEFAULT_MAX_PARTICLES = 70; // 👈 constante a tunear
    const DEFAULTS = {
        maxParticles: DEFAULT_MAX_PARTICLES,
        // factor de densidad relativo a tamaño de pantalla (para no petar móviles chicos)
        densityFactor: 0.00008,
        baseSpeed: 0.08,
        baseRadius: 0.7,
        color: '255, 255, 255', // RGB
    };

    function initParticles(canvasId = 'particles', userOptions = {}) {
        const canvas = document.getElementById(canvasId);

        if (!canvas || !canvas.getContext) return;

        const options = { ...DEFAULTS, ...userOptions };
        const ctx = canvas.getContext('2d');

        // Por si se llama dos veces, cancelamos animación anterior
        if (canvas._pensieveParticlesCleanup) {
            canvas._pensieveParticlesCleanup();
        }

        let particles = [];
        let animationFrameId = null;

        function resize() {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();

            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            createParticles();
        }

        function createParticles() {
            particles = [];

            const width = canvas.width / (window.devicePixelRatio || 1);
            const height = canvas.height / (window.devicePixelRatio || 1);

            // Densidad basada en el área, pero topeada por maxParticles
            const idealCount = Math.min(
                options.maxParticles,
                Math.floor(width * height * options.densityFactor)
            );

            for (let i = 0; i < idealCount; i++) {
                particles.push(createSingleParticle(width, height, options));
            }
        }

        function createSingleParticle(width, height, options) {
            const depth = randBetween(0.15, 1); // 0.15 = muy al fondo, 1 = más cerca

            return {
                x: Math.random() * width,
                y: Math.random() * height,
                depth,
                radius: options.baseRadius + depth * 1.3,
                speedY: options.baseSpeed + depth * 0.35,
            };
        }

        function update() {
            const width = canvas.width / (window.devicePixelRatio || 1);
            const height = canvas.height / (window.devicePixelRatio || 1);

            ctx.clearRect(0, 0, width, height);

            for (let p of particles) {
                p.y += p.speedY;

                if (p.y - p.radius > height) {
                    // reaparece arriba con nueva posición X y nueva profundidad
                    const depth = randBetween(0.15, 1);
                    p.y = -p.radius;
                    p.x = Math.random() * width;
                    p.depth = depth;
                    p.radius = options.baseRadius + depth * 1.3;
                    p.speedY = options.baseSpeed + depth * 0.35;
                }

                const blur = (1 - p.depth) * 6; // más al fondo = más blur
                const alpha = 0.05 + p.depth * 0.15;

                ctx.save();
                ctx.beginPath();
                ctx.fillStyle = `rgba(${options.color}, ${alpha})`;
                ctx.shadowColor = `rgba(${options.color}, ${alpha * 1.5})`;
                ctx.shadowBlur = blur;
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            animationFrameId = requestAnimationFrame(update);
        }

        function onResize() {
            resize();
        }

        window.addEventListener('resize', onResize);
        resize();
        update();

        // Guardamos una función de limpieza por si más adelante quieres reinit o cambiar opciones
        canvas._pensieveParticlesCleanup = () => {
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
            }
            window.removeEventListener('resize', onResize);
        };
    }

    function randBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    global.PensieveParticles = {
        init: initParticles,
        DEFAULTS,
    };
})(window);
