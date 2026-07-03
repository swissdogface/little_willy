/* Renderer: 320x200 logical viewport at 4x (1280x800 canvas),
 * scrolling over the 640x384 world, with modern effects:
 * parallax starfield, glow, particles, smooth camera. */
'use strict';

const Renderer = (() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const S = 4;                  // upscale factor of the atlases
  const VW = 320, VH = 200;     // logical viewport

  let stars = [];
  let nebula = null;

  function initBackdrop(seed) {
    stars = [];
    let s = seed * 2654435761 % 4294967296;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 90; i++) {
      stars.push({ x: rnd() * 640, y: rnd() * 384, z: 0.2 + rnd() * 0.6,
                   tw: rnd() * Math.PI * 2, r: rnd() < 0.12 ? 2 : 1 });
    }
    // pre-render a soft nebula for depth
    nebula = document.createElement('canvas');
    nebula.width = 640; nebula.height = 400;
    const nc = nebula.getContext('2d');
    const hues = [[40, 20, 90], [90, 20, 70], [20, 40, 90], [80, 30, 40]];
    for (let i = 0; i < 7; i++) {
      const [r, g, b] = hues[Math.floor(rnd() * hues.length)];
      const x = rnd() * 640, y = rnd() * 400, rad = 80 + rnd() * 160;
      const grad = nc.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      nc.fillStyle = grad;
      nc.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }

  function clear() {
    ctx.fillStyle = '#04050e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawBackdrop(cam, t) {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#070a1e');
    g.addColorStop(0.6, '#0a0c26');
    g.addColorStop(1, '#141033');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (nebula) {
      ctx.globalAlpha = 0.8;
      ctx.drawImage(nebula, -cam.x * 0.25 * S * 0.25, -cam.y * 0.25 * S * 0.25,
                    nebula.width * S / 2, nebula.height * S / 2);
      ctx.globalAlpha = 1;
    }
    for (const st of stars) {
      const px = (st.x - cam.x * st.z);
      const py = (st.y - cam.y * st.z);
      const sx = ((px % 640) + 640) % 640 * S * (VW / 640) * 2;
      const sy = ((py % 384) + 384) % 384 * S * (VH / 384) * 2;
      if (sx > canvas.width || sy > canvas.height) continue;
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.001 + st.tw));
      ctx.fillStyle = `rgba(220,230,255,${a * st.z})`;
      ctx.fillRect(sx, sy, st.r * 2, st.r * 2);
    }
  }

  function worldToScreen(cam, x, y) {
    return [(x - cam.x) * S, (y - cam.y) * S];
  }

  function drawSprite(cam, key, index, x, y, alpha = 1) {
    const fr = Assets.sprFrame(key, index);
    if (!fr) return;
    const [sx, sy] = worldToScreen(cam, x, y);
    if (sx < -200 || sy < -200 || sx > canvas.width + 40 || sy > canvas.height + 40) return;
    ctx.globalAlpha = alpha;
    // soft drop shadow for depth
    ctx.drawImage(fr.img, fr.f.x, fr.f.y, fr.f.w, fr.f.h,
                  sx, sy, fr.f.w, fr.f.h);
    ctx.globalAlpha = 1;
  }

  function drawScreenSprite(key, index, sx, sy, scale = 1) {
    const fr = Assets.sprFrame(key, index);
    if (!fr) return;
    ctx.drawImage(fr.img, fr.f.x, fr.f.y, fr.f.w, fr.f.h,
                  sx, sy, fr.f.w * scale, fr.f.h * scale);
  }

  function drawTiles(cam, level, t) {
    const bst = level.bst;
    const map = level.map;
    if (level.bg) {
      const img = Assets.img('level1_bg.png');
      ctx.drawImage(img, cam.x * S, cam.y * S, VW * S, VH * S,
                    0, 0, canvas.width, canvas.height);
    }
    if (!bst) return;
    const c0 = Math.max(0, Math.floor(cam.x / 16));
    const r0 = Math.max(0, Math.floor(cam.y / 16));
    const c1 = Math.min(39, Math.ceil((cam.x + VW) / 16));
    const r1 = Math.min(23, Math.ceil((cam.y + VH) / 16));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const v = map[r * 40 + c];
        const tile = v & 0x3f;
        const attr = v >> 6;
        const fr = Assets.tileFrame(bst, tile);
        if (!fr) continue;
        const [sx, sy] = worldToScreen(cam, c * 16, r * 16);
        ctx.drawImage(fr.img, fr.f.x, fr.f.y, fr.f.w, fr.f.h, sx, sy, 16 * S, 16 * S);
        if (attr === 3) {  // deadly: warm pulsing glow
          const a = 0.10 + 0.10 * Math.sin(t * 0.006 + c + r);
          ctx.fillStyle = `rgba(255,60,20,${a})`;
          ctx.fillRect(sx, sy, 16 * S, 16 * S);
        }
      }
    }
  }

  function itemGlow(cam, x, y, t, color) {
    const [sx, sy] = worldToScreen(cam, x + 8, y + 8);
    const r = (14 + 3 * Math.sin(t * 0.005 + x)) * S / 2;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }

  // ---- particles ---------------------------------------------------------
  let particles = [];
  function burst(x, y, color, n = 14, speed = 90) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
                       life: 0.5 + Math.random() * 0.5, t: 0, color });
    }
  }
  function updateParticles(dt) {
    for (const p of particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
    }
    particles = particles.filter(p => p.t < p.life);
  }
  function drawParticles(cam) {
    for (const p of particles) {
      const [sx, sy] = worldToScreen(cam, p.x, p.y);
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(sx - 3, sy - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
  }

  function vignette() {
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2,
                                       canvas.height * 0.45,
                                       canvas.width / 2, canvas.height / 2,
                                       canvas.height * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,10,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ---- full-screen images & text -----------------------------------------
  function drawScreen(name, opts = {}) {
    const img = Assets.img('screens/' + name + '.png');
    if (!img) return;
    const srcH = opts.half ? img.height / 2 : img.height;
    const srcY = opts.bottom ? img.height / 2 : 0;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, srcY, img.width, srcH, 0, 0, canvas.width, canvas.height);
  }

  function textBox(lines, opts = {}) {
    const w = canvas.width * (opts.w || 0.62);
    const lh = canvas.height * 0.052;
    const h = lh * lines.length + lh * 1.6;
    const x = (canvas.width - w) / 2;
    const y = opts.y !== undefined ? opts.y * canvas.height : (canvas.height - h) / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(80,120,255,0.8)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = 'rgba(10,14,40,0.92)';
    roundRect(x, y, w, h, 18);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(140,170,255,0.7)';
    ctx.lineWidth = 3;
    roundRect(x, y, w, h, 18);
    ctx.stroke();
    ctx.fillStyle = '#eaf0ff';
    ctx.textAlign = 'center';
    lines.forEach((ln, i) => {
      const big = i === 0 && opts.title;
      ctx.font = `${big ? 'bold ' : ''}${Math.round(lh * (big ? 0.85 : 0.68))}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = big ? '#ffd76a' : '#eaf0ff';
      ctx.fillText(ln, canvas.width / 2, y + lh * (i + 1.4));
    });
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fade(alpha) {
    ctx.fillStyle = `rgba(0,0,5,${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return { canvas, ctx, S, VW, VH,
           initBackdrop, clear, drawBackdrop, drawTiles, drawSprite,
           drawScreenSprite, itemGlow, burst, updateParticles, drawParticles,
           vignette, drawScreen, textBox, fade, worldToScreen };
})();
