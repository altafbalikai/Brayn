import React, { useEffect, useRef } from "react";

const RewindBackground = () => {
  const canvasRef = useRef(null);
  let t = 0;
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    let width, height, dpr;
    let particles = [];
    const PARTICLE_COUNT = 120;
    const MAX_DISTANCE = 150;

    const css = getComputedStyle(document.documentElement);

    const COLORS = {
      bg: css.getPropertyValue("--theme-dark").trim(),
      ambient: css.getPropertyValue("--theme-light").trim(),
      link: css.getPropertyValue("--theme-secondary").trim(),
      accent: css.getPropertyValue("--theme-accent").trim(),
      node: css.getPropertyValue("--theme-text").trim(),
      muted: css.getPropertyValue("--theme-muted").trim(),
      active: css.getPropertyValue("--theme-textaccent").trim(),
    };

    class Particle {
      constructor() {
        this.reset();
      }

      reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.35;
        this.vy = (Math.random() - 0.5) * 0.35;
        this.r = Math.random() * 1.6 + 0.8;
        this.energy = Math.random();
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        this.energy += 0.01;
        if (this.energy > 1) this.energy = 0;

        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;
      }

      draw() {
        const alpha = 0.6 + this.energy * 0.4;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(229,231,235,${alpha})`;
        ctx.fill();
      }
    }

    const initParticles = () => {
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(new Particle());
      }
    };

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      initParticles();
    };

    const drawBackground = () => {
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, width, height);

      // Animate gradient positions
      const x1 = width * (0.3 + Math.sin(t * 0.0005) * 0.1);
      const y1 = height * (0.3 + Math.cos(t * 0.0004) * 0.1);

      const x2 = width * (0.7 + Math.cos(t * 0.0003) * 0.1);
      const y2 = height * (0.7 + Math.sin(t * 0.0006) * 0.1);

      // Gradient 1 (ambient glow)
      const g1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, width * 0.9);
      g1.addColorStop(0, COLORS.ambient);
      g1.addColorStop(1, "transparent");

      // Gradient 2 (depth accent)
      const g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, width * 0.8);
      g2.addColorStop(0, COLORS.accent);
      g2.addColorStop(1, "transparent");

      // Blend gradients
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, width, height);

      ctx.globalAlpha = 0.6;
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    };

    const connectParticles = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < MAX_DISTANCE) {
            const opacity = 1 - dist / MAX_DISTANCE;
            ctx.strokeStyle = `${COLORS.link}${opacity * 0.4})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    };

    const animate = () => {
      t += 16; // ~1 frame (ms)

      drawBackground();

      particles.forEach((p) => {
        p.update();
        p.draw();
      });

      connectParticles();
      requestAnimationFrame(animate);
    };

    window.addEventListener("resize", resize);
    resize();
    animate();

    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
};

export default RewindBackground;
