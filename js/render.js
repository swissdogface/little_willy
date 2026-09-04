/* Renderer: everything is drawn at the original 320x200 resolution into an
 * offscreen buffer, which is then scaled to the display with an integer
 * factor and nearest-neighbour filtering, so every pixel stays crisp. */
'use strict';

const Renderer = (() => {
  const VW = 320, VH = 200;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const buf = document.createElement('canvas');
  buf.width = VW; buf.height = VH;
  const b = buf.getContext('2d', { alpha: false });
  b.imageSmoothingEnabled = false;
  let scale = 1;

  // ---- display scaling ---------------------------------------------------
  function resize() {
    const stage = document.getElementById('stage');
    const W = stage.clientWidth, H = stage.clientHeight;
    const s = Math.min(W / VW, H / VH);
    scale = s >= 2 ? Math.floor(s) : Math.max(0.5, s);
    const cw = Math.round(VW * scale), ch = Math.round(VH * scale);
    // integer-scaled backing store for a pixel-perfect image
    const bs = Math.max(1, Math.round(scale));
    canvas.width = VW * bs; canvas.height = VH * bs;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  function present() {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, canvas.width, canvas.height);
  }

  // ---- primitives ---------------------------------------------------------
  function clear(color = '#000') {
    b.fillStyle = color;
    b.fillRect(0, 0, VW, VH);
  }

  function rect(x, y, w, h, color) {
    b.fillStyle = color;
    b.fillRect(x, y, w, h);
  }

  function drawSprite(key, index, x, y, alpha = 1) {
    const fr = Assets.sprFrame(key, index);
    if (!fr) return;
    x = Math.round(x); y = Math.round(y);
    if (x + fr.w <= 0 || y + fr.h <= 0 || x >= VW || y >= VH) return;
    if (alpha !== 1) b.globalAlpha = alpha;
    b.drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, x, y, fr.w, fr.h);
    if (alpha !== 1) b.globalAlpha = 1;
  }

  /** sprite drawn as a flat white silhouette (hit flash) */
  const flashCache = {};
  function drawSpriteFlash(key, index, x, y) {
    const fr = Assets.sprFrame(key, index);
    if (!fr) return;
    const id = key + ':' + index;
    let c = flashCache[id];
    if (!c) {
      c = document.createElement('canvas');
      c.width = fr.w; c.height = fr.h;
      const cc = c.getContext('2d');
      cc.drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
      cc.globalCompositeOperation = 'source-in';
      cc.fillStyle = '#ffffff';
      cc.fillRect(0, 0, fr.w, fr.h);
      flashCache[id] = c;
    }
    b.drawImage(c, Math.round(x), Math.round(y));
  }

  function screenImg(name) { return Assets.img('screens/' + name + '.png'); }

  /** full-screen picture; `sy` scrolls a taller picture (the 320x400 title) */
  function drawScreen(name, sy = 0) {
    const img = screenImg(name);
    if (img) b.drawImage(img, 0, sy, VW, VH, 0, 0, VW, VH);
  }

  // ---- palette fades ------------------------------------------------------
  // The original fades a picture in or out by restoring or blanking the 16
  // EGA palette entries one after another, so the colours appear (vanish)
  // one by one.  The pictures are exact EGA colours, so every pixel maps to
  // its attribute index and the effect can be reproduced per pixel.
  const EGA = [[0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170],
               [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
               [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255],
               [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255]];
  const palCache = {};
  function screenPal(name) {
    let e = palCache[name];
    if (e) return e;
    const img = screenImg(name);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const cc = c.getContext('2d');
    cc.drawImage(img, 0, 0);
    const rgba = cc.getImageData(0, 0, img.width, img.height).data;
    const n = img.width * img.height;
    const idx = new Uint8Array(n);
    const lut = {};
    EGA.forEach((col, i) => { lut[(col[0] << 16) | (col[1] << 8) | col[2]] = i; });
    for (let i = 0; i < n; i++) {
      const key = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
      let k = lut[key];
      if (k === undefined) {          // not an EGA colour: nearest one
        let bd = 1e9; k = 0;
        for (let j = 0; j < 16; j++) {
          const e2 = EGA[j];
          const d = (rgba[i * 4] - e2[0]) ** 2 + (rgba[i * 4 + 1] - e2[1]) ** 2 + (rgba[i * 4 + 2] - e2[2]) ** 2;
          if (d < bd) { bd = d; k = j; }
        }
        lut[key] = k;
      }
      idx[i] = k;
    }
    e = { w: img.width, h: img.height, rgba, idx };
    palCache[name] = e;
    return e;
  }
  const palOut = b.createImageData(VW, VH);

  /** draw a screen showing only the palette entries in `mask` (bit i = colour i) */
  function drawScreenPal(name, sy, mask) {
    const e = screenPal(name);
    const out = palOut.data, src = e.rgba, idx = e.idx;
    for (let y = 0; y < VH; y++) {
      const so = (y + sy) * e.w, oo = y * VW;
      for (let x = 0; x < VW; x++) {
        const si = so + x, oi = (oo + x) << 2;
        if (mask & (1 << idx[si])) {
          const s4 = si << 2;
          out[oi] = src[s4]; out[oi + 1] = src[s4 + 1]; out[oi + 2] = src[s4 + 2];
        } else {
          out[oi] = 0; out[oi + 1] = 0; out[oi + 2] = 0;
        }
        out[oi + 3] = 255;
      }
    }
    b.putImageData(palOut, 0, 0);
  }

  // ---- hidden page + dissolve --------------------------------------------
  // The story screens are built on a second video page: pictures dissolve
  // in cell by cell (the original copies random bytes of the hidden page
  // into the visible one), text paragraphs are copied row by row.
  const page = document.createElement('canvas');
  page.width = VW; page.height = VH;
  const p = page.getContext('2d', { alpha: false });
  p.imageSmoothingEnabled = false;
  const CELLS = (VW >> 3) * VH;         // 8000 cells of 8x1 px = the bytes of a plane
  let order = null, orderPos = 0, orderSplit = 0;

  function pageClear(color = '#000') { p.fillStyle = color; p.fillRect(0, 0, VW, VH); }
  function pageBlit() { b.drawImage(page, 0, 0); }
  /** copy a strip of a screen picture into the page */
  function pageCopy(name, sx, sy, w, h, dx, dy) {
    const img = screenImg(name);
    if (img) p.drawImage(img, sx, sy, w, h, dx, dy, w, h);
  }
  function pageRect(x, y, w, h, color) { p.fillStyle = color; p.fillRect(x, y, w, h); }

  /** plan a dissolve: the original draws 32000 random cells, the range of
   *  the random pick growing with the loop counter (the picture first
   *  seeps in from the top), so the first quarter is such a growing pick
   *  and the rest a random walk over the cells that are still missing. */
  function dissolveStart() {
    const seen = new Uint8Array(CELLS);
    const a = [];
    for (let i = 0; i < CELLS; i++) {
      const c = Math.floor(Math.random() * (i + 1));
      if (!seen[c]) { seen[c] = 1; a.push(c); }
    }
    const rest = [];
    for (let i = 0; i < CELLS; i++) if (!seen[i]) rest.push(i);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = rest[i]; rest[i] = rest[j]; rest[j] = t;
    }
    orderSplit = a.length;
    order = Uint16Array.from(a.concat(rest));
    orderPos = 0;
  }

  /** advance the dissolve of `src` (screen name, null = black) to progress
   *  `f` in 0..1; returns true when the picture is complete */
  function dissolveTo(src, f) {
    const img = src ? screenImg(src) : null;
    // first quarter of the time: the growing pick, then the remainder
    const target = f < 0.25 ? Math.floor(orderSplit * f * 4)
                            : orderSplit + Math.floor((order.length - orderSplit) * Math.min(1, (f - 0.25) / 0.75));
    if (!img) p.fillStyle = '#000';
    for (; orderPos < target && orderPos < order.length; orderPos++) {
      const c = order[orderPos];
      const x = (c % 40) << 3, y = (c / 40) | 0;
      if (img) p.drawImage(img, x, y, 8, 1, x, y, 8, 1);
      else p.fillRect(x, y, 8, 1);
    }
    return orderPos >= order.length;
  }

  // ---- background: stars behind fully black tiles -----------------------
  let stars = [];
  let blackTiles = {};   // bstKey -> Set of tile indices that are pure black

  function initBackdrop(seed) {
    stars = [];
    let s = (seed * 2654435761) % 4294967296;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 70; i++) {
      stars.push({ x: rnd() * 640, y: rnd() * 384, z: 0.25 + rnd() * 0.5,
                   tw: rnd() * 6.28, big: rnd() < 0.15 });
    }
  }

  function tileIsBlack(bstKey, index) {
    let set = blackTiles[bstKey];
    if (!set) {
      set = new Set();
      const a = Assets.data.atlas['bst_' + bstKey];
      const img = Assets.img(a.file);
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cc = c.getContext('2d');
      cc.drawImage(img, 0, 0);
      const px = cc.getImageData(0, 0, img.width, img.height).data;
      a.frames.forEach((f, i) => {
        let black = true;
        for (let y = f[1]; y < f[1] + f[3] && black; y++) {
          for (let x = f[0]; x < f[0] + f[2]; x++) {
            const o = (y * img.width + x) * 4;
            if (px[o] || px[o + 1] || px[o + 2]) { black = false; break; }
          }
        }
        if (black) set.add(i);
      });
      blackTiles[bstKey] = set;
    }
    return set.has(index);
  }

  function drawStars(cam, t) {
    for (const st of stars) {
      const px = ((st.x - cam.x * st.z) % 640 + 640) % 640;
      const py = ((st.y - cam.y * st.z) % 384 + 384) % 384;
      if (px >= VW || py >= VH) continue;
      const a = 0.35 + 0.45 * Math.abs(Math.sin(t * 0.0012 + st.tw));
      b.fillStyle = st.big ? `rgba(220,230,255,${a})` : `rgba(160,180,230,${a * 0.8})`;
      b.fillRect(px | 0, py | 0, 1, 1);
    }
  }

  /** draw the visible part of the tile map (cam in world px) */
  function drawTiles(cam, level, map, t) {
    if (level.bg) {
      b.drawImage(Assets.img(level.bg), cam.x, cam.y, VW, VH, 0, 0, VW, VH);
      return;
    }
    const bst = level.bst;
    const c0 = Math.max(0, cam.x >> 4), r0 = Math.max(0, cam.y >> 4);
    const c1 = Math.min(39, (cam.x + VW - 1) >> 4), r1 = Math.min(23, (cam.y + VH - 1) >> 4);
    let anyBlack = false;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const tile = map[r * 40 + c] & 0x3f;
        if (tileIsBlack(bst, tile)) { anyBlack = true; continue; }
        const fr = Assets.tileFrame(bst, tile);
        if (!fr) continue;
        b.drawImage(fr.img, fr.x, fr.y, 16, 16, c * 16 - cam.x, r * 16 - cam.y, 16, 16);
      }
    }
    if (anyBlack) {
      // stars only where the tile is black: draw them, then re-cover with
      // the non-black tiles is expensive, so we draw stars first instead.
    }
  }

  /** returns true if any visible tile is black (caller draws stars first) */
  function hasBlackTiles(cam, level, map) {
    if (level.bg) return false;
    const c0 = Math.max(0, cam.x >> 4), r0 = Math.max(0, cam.y >> 4);
    const c1 = Math.min(39, (cam.x + VW - 1) >> 4), r1 = Math.min(23, (cam.y + VH - 1) >> 4);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (tileIsBlack(level.bst, map[r * 40 + c] & 0x3f)) return true;
    return false;
  }

  // ---- particles (1x pixels) ----------------------------------------------
  let particles = [];
  function burst(x, y, colors, n = 12, speed = 70) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30,
                       life: 0.4 + Math.random() * 0.4, t: 0,
                       color: colors[i % colors.length] });
    }
  }
  function updateParticles(dt) {
    for (const p of particles) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt;
    }
    particles = particles.filter(p => p.t < p.life);
  }
  function drawParticles(cam) {
    for (const p of particles) {
      if (p.t / p.life > 0.7 && ((p.t * 30) | 0) % 2) continue;
      b.fillStyle = p.color;
      b.fillRect((p.x - cam.x) | 0, (p.y - cam.y) | 0, 1, 1);
    }
  }
  function clearParticles() { particles = []; }

  // ---- bitmap text ---------------------------------------------------------
  const glyphCache = {};
  function glyphSheet(color) {
    let c = glyphCache[color];
    if (c) return c;
    const chars = Object.keys(Font.glyphs);
    c = document.createElement('canvas');
    c.width = chars.length * 6; c.height = 8;
    const cc = c.getContext('2d');
    cc.fillStyle = color;
    chars.forEach((ch, i) => {
      const rows = Font.glyphs[ch];
      for (let r = 0; r < 7; r++)
        for (let x = 0; x < 5; x++)
          if (rows[r] & (16 >> x)) cc.fillRect(i * 6 + x, r, 1, 1);
    });
    c.index = {};
    chars.forEach((ch, i) => { c.index[ch] = i; });
    glyphCache[color] = c;
    return c;
  }

  function textWidth(s) { return s.length * 6 - 1; }

  /** draw text; align: 'left' | 'center' | 'right' */
  function text(s, x, y, color = '#fff', align = 'left', shadow = null) {
    x = Math.round(x); y = Math.round(y);
    const w = textWidth(s);
    if (align === 'center') x -= w >> 1;
    else if (align === 'right') x -= w;
    if (shadow) {
      const sh = glyphSheet(shadow);
      for (let i = 0; i < s.length; i++) {
        const gi = sh.index[s[i]];
        if (gi !== undefined) b.drawImage(sh, gi * 6, 0, 5, 7, x + i * 6 + 1, y + 1, 5, 7);
      }
    }
    const sheet = glyphSheet(color);
    for (let i = 0; i < s.length; i++) {
      const gi = sheet.index[s[i]];
      if (gi === undefined) continue;
      b.drawImage(sheet, gi * 6, 0, 5, 7, x + i * 6, y, 5, 7);
    }
  }

  /** double-size text (for titles) */
  function bigText(s, x, y, color = '#fff', align = 'left') {
    const w = textWidth(s) * 2;
    x = Math.round(x); y = Math.round(y);
    if (align === 'center') x -= w >> 1;
    else if (align === 'right') x -= w;
    const sheet = glyphSheet(color);
    for (let i = 0; i < s.length; i++) {
      const gi = sheet.index[s[i]];
      if (gi === undefined) continue;
      b.drawImage(sheet, gi * 6, 0, 5, 7, x + i * 12, y, 10, 14);
    }
  }

  /** framed panel in the style of the original text boxes */
  function panel(x, y, w, h, opts = {}) {
    b.fillStyle = opts.bg || 'rgba(0,0,40,0.86)';
    b.fillRect(x, y, w, h);
    b.fillStyle = opts.border || '#8aa4ff';
    b.fillRect(x, y, w, 1); b.fillRect(x, y + h - 1, w, 1);
    b.fillRect(x, y, 1, h); b.fillRect(x + w - 1, y, 1, h);
    b.fillStyle = opts.border2 || '#3a4a9a';
    b.fillRect(x + 1, y + 1, w - 2, 1); b.fillRect(x + 1, y + h - 2, w - 2, 1);
    b.fillRect(x + 1, y + 1, 1, h - 2); b.fillRect(x + w - 2, y + 1, 1, h - 2);
  }

  /** centred text box with lines; first line highlighted when opts.title */
  function textBox(lines, opts = {}) {
    const lh = 10;
    const w = opts.w || Math.min(VW - 16, Math.max(...lines.map(l => textWidth(l))) + 24);
    const h = lines.length * lh + 14;
    const x = (VW - w) >> 1;
    const y = opts.y !== undefined ? opts.y : ((VH - h) >> 1);
    panel(x, y, w, h);
    lines.forEach((ln, i) => {
      const title = i === 0 && opts.title;
      const col = title ? '#ffe36a' : (ln.startsWith('>') ? '#8cf' : '#e8ecff');
      text(ln, VW >> 1, y + 8 + i * lh, col, 'center');
    });
    return { x, y, w, h };
  }

  function fade(alpha, color = '0,0,8') {
    b.fillStyle = `rgba(${color},${alpha})`;
    b.fillRect(0, 0, VW, VH);
  }

  return { VW, VH, canvas, ctx: b, buf,
           resize, present, clear, rect, drawSprite, drawSpriteFlash, drawScreen,
           drawScreenPal, pageClear, pageBlit, pageCopy, pageRect, dissolveStart, dissolveTo,
           initBackdrop, drawStars, drawTiles, hasBlackTiles,
           burst, updateParticles, drawParticles, clearParticles,
           text, bigText, textWidth, panel, textBox, fade,
           get scale() { return scale; } };
})();
