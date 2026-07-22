// Ambient "aurora network" particle field — the one deliberately bold visual
// element in the app. Kept subtle (low opacity, slow drift) so it reads as
// atmosphere behind panels rather than as a distraction while coding.
(() => {
  const canvas = document.getElementById('particles-bg');
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COLORS = ['#7c6cf0', '#e255a1', '#f0a85c', '#57d0e0'];
  let particles = [];
  let w, h, dpr;
  let raf = null;
  let running = true;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    const count = Math.max(24, Math.min(70, Math.floor((w * h) / 26000)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: Math.random() * 1.6 + 0.6,
      c: COLORS[Math.floor(Math.random() * COLORS.length)]
    }));
  }

  function step() {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }

    // connecting lines between nearby particles
    const linkDist = 130;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < linkDist) {
          ctx.strokeStyle = a.c;
          ctx.globalAlpha = (1 - dist / linkDist) * 0.12;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // particles themselves
    for (const p of particles) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    raf = requestAnimationFrame(step);
  }

  window.addEventListener('resize', resize);

  // Pause the animation when the window is hidden/minimized to save CPU.
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden && !reduceMotion;
    if (running && !raf) step();
  });

  resize();
  if (!reduceMotion) {
    running = true;
    step();
  } else {
    // draw a single static, extremely faint frame and stop
    running = false;
    ctx.clearRect(0, 0, w, h);
  }
})();
