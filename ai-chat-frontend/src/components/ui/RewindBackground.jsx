import React, { useEffect, useRef } from "react";
import { useTheme } from "../../hooks/useTheme";

const RewindBackground = () => {
  const canvasRef = useRef(null);
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");

    /* -------------------- Device & Performance -------------------- */
    const isMobile =
      window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);

    const PARTICLE_COUNT = isMobile ? 100 : 150;
    const MAX_DISTANCE = isMobile ? 150 : 200;

    /* -------------------- Brain Clusters -------------------- */
    const CLUSTERS = 8;
    const CLUSTER_RADIUS = 220;

    /* -------------------- Theme Colors -------------------- */
    const css = getComputedStyle(document.documentElement);
    const getVar = (name) => css.getPropertyValue(name).trim();

    const COLORS = {
      bg: getVar("--hero-bg") || "#05080f",
      ambient: getVar("--hero-ambient") || "#1b2a4a",
      link: `rgba(${getVar("--hero-link") || "120,140,255"},`,
      node: `rgba(${getVar("--hero-node") || "220,225,255"},`,
      active: `rgb(${getVar("--hero-active") || "138,180,255"})`,
    };

    /* -------------------- State -------------------- */
    let width, height, dpr;
    let particles = [];
    let signals = [];
    let t = 0;
    let animationFrameId;

    let mouse = { x: null, y: null };
    let lastInteraction = Date.now();
    let activeMode = true;

    /* -------------------- Particle -------------------- */
    class Particle {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.35;
        this.vy = (Math.random() - 0.5) * 0.35;
        // this.r = Math.random() * 1.0 + 0.2;
        this.r = isLight
  ? Math.random() * 1.6 + 0.6   // light mode
  : Math.random() * 1.0 + 0.2; // dark mode

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

      draw(glow) {
        const pulse = Math.sin(this.energy * Math.PI * 2) * 0.5 + 0.5;
        const alpha = 0.4 + pulse * 0.6;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + pulse * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = `${COLORS.node}${alpha})`;
        ctx.shadowBlur = glow;
        ctx.shadowColor = COLORS.ambient;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    /* -------------------- Signal -------------------- */
    class Signal {
      constructor(from, to) {
        this.from = from;
        this.to = to;
        this.progress = 0;
        this.speed = 0.015 + Math.random() * 0.02;
      }

      update() {
        this.progress += this.speed;
        return this.progress <= 1;
      }

      draw(glow) {
        const x = this.from.x + (this.to.x - this.from.x) * this.progress;
        const y = this.from.y + (this.to.y - this.from.y) * this.progress;

        ctx.beginPath();
        // ctx.arc(x, y, 0.8, 0, Math.PI * 2);
        ctx.arc(x, y, isLight ? 1.2 : 0.8, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.active;
        ctx.shadowBlur = glow;
        ctx.shadowColor = COLORS.active;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    /* -------------------- Init -------------------- */
    const initParticles = () => {
      particles = [];
      const centers = Array.from({ length: CLUSTERS }).map(() => ({
        x: Math.random() * width,
        y: Math.random() * height,
      }));

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const c = centers[i % CLUSTERS];
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * CLUSTER_RADIUS;

        particles.push(
          new Particle(
            c.x + Math.cos(angle) * radius,
            c.y + Math.sin(angle) * radius
          )
        );
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

    /* -------------------- Background -------------------- */
    const drawBackground = () => {
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, width, height);

      const g = ctx.createRadialGradient(
        width * 0.4,
        height * 0.3,
        0,
        width * 0.4,
        height * 0.3,
        width * 0.9
      );
      g.addColorStop(0, COLORS.ambient);
      g.addColorStop(1, "transparent");

      // ctx.globalAlpha = 0.7;
      ctx.globalAlpha = isLight ? 0.85 : 0.7;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    };

    /* -------------------- Connections -------------------- */
    const connectParticles = (signalRate) => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < MAX_DISTANCE) {
            const opacity = 1 - dist / MAX_DISTANCE;
            // ctx.strokeStyle = `${COLORS.link}${opacity * 0.35})`;
            // ctx.lineWidth = 0.6;
            ctx.lineWidth = isLight ? 1.1 : 0.6;

            ctx.strokeStyle = `${COLORS.link}${
              isLight ? opacity * 0.6 : opacity * 0.35
            })`;

            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();

            if (Math.random() < signalRate) {
              signals.push(new Signal(particles[i], particles[j]));
            }
          }
        }
      }
    };

    /* -------------------- Glow Pass -------------------- */
    const postGlow = () => {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.15;
      ctx.filter = "blur(12px)";
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    };

    /* -------------------- Animate -------------------- */
    const animate = () => {
      t += 8;

      if (Date.now() - lastInteraction > 5000) activeMode = false;

      const SIGNAL_RATE = activeMode ? 0.0012 : 0.0002;
      // const GLOW = activeMode ? 8 : 3;
      const GLOW = activeMode
        ? isLight
          ? 6
          : 8
        : isLight
        ? 3
        : 3;

      drawBackground();

      particles.forEach((p) => {
        p.update();
        p.draw(GLOW);

        if (mouse.x) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          if (Math.sqrt(dx * dx + dy * dy) < 120 && Math.random() < 0.02) {
            const target =
              particles[Math.floor(Math.random() * particles.length)];
            signals.push(new Signal(p, target));
          }
        }
      });

      connectParticles(SIGNAL_RATE);

      signals = signals.filter((s) => {
        s.draw(GLOW);
        return s.update();
      });

      postGlow();
      animationFrameId = requestAnimationFrame(animate);
    };

    /* -------------------- Interaction -------------------- */
    const markActive = () => {
      lastInteraction = Date.now();
      activeMode = true;
    };

    const handleMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      markActive();
    };

    const handleKeyDown = () => {
      markActive();
      for (let i = 0; i < 6; i++) {
        if (particles.length > 0) {
          const a = particles[Math.floor(Math.random() * particles.length)];
          const b = particles[Math.floor(Math.random() * particles.length)];
          if (a && b) signals.push(new Signal(a, b));
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", resize);

    resize();
    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [resolvedTheme]);

  return (
    <div className="fixed z-0 inset-0 pointer-events-none">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default RewindBackground;
