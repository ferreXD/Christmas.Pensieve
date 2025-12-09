// particles.js
(function (global) {
    function initCtaParticles() {
        const cta = document.querySelector('.page__cta');
        const canvas = document.querySelector('.page__cta-particles');

        if (!cta || !canvas || !canvas.getContext) return;

        const ctx = canvas.getContext('2d');
        let particles = [];
        let animationId = null;

        function resizeCanvas() {
            const rect = cta.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;

            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;

            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            createParticles(rect.width, rect.height);
        }

        function createParticles(width, height) {
            particles = [];

            // Fewer particles
            const PARTICLE_COUNT = 12;
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                particles.push(createSingleParticle(width, height));
            }
        }

        function createSingleParticle(width, height) {
            const depth = 0.4 + Math.random() * 0.6; // 0.4–1

            return {
                x: Math.random() * width,
                y: Math.random() * height,
                depth,
                // smaller radius overall
                radius: 0.3 + depth * 0.8,
                // gentle diagonal drift
                vx: (Math.random() - 0.5) * 0.10,
                vy: -0.04 - Math.random() * 0.12
            };
        }

        function update() {
            const width = canvas.width / (window.devicePixelRatio || 1);
            const height = canvas.height / (window.devicePixelRatio || 1);

            // No dark overlay: keep canvas transparent every frame
            ctx.clearRect(0, 0, width, height);

            for (let p of particles) {
                p.x += p.vx;
                p.y += p.vy;

                // Wrap around
                if (p.y + p.radius < 0) {
                    p.y = height + p.radius;
                    p.x = Math.random() * width;
                }
                if (p.x - p.radius > width) {
                    p.x = -p.radius;
                } else if (p.x + p.radius < 0) {
                    p.x = width + p.radius;
                }

                // White, translucent, similar to background dust
                const alpha = 0.08 + p.depth * 0.18;  // softer
                const blur = (1 - p.depth) * 3;

                ctx.save();
                ctx.beginPath();
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 1.5})`;
                ctx.shadowBlur = blur;
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            animationId = requestAnimationFrame(update);
        }

        // keep canvas in sync with layout
        const resizeObserver = new ResizeObserver(() => {
            resizeCanvas();
        });
        resizeObserver.observe(cta);

        resizeCanvas();
        update();

        // optional cleanup if you ever navigate away
        canvas._cleanup = () => {
            if (animationId !== null) cancelAnimationFrame(animationId);
            resizeObserver.disconnect();
        };
    }

    global.PensieveCtaParticles = {
        init: initCtaParticles
    };
})(window);
