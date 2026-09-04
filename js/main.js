/* Main loop and screen flow:
 * boot -> presents -> title -> menu -> story -> hub -> (info -> level)* -> end
 * The simulation runs at a fixed 35 Hz (like the original); rendering
 * happens at the display rate with interpolation between logic frames. */
'use strict';

(async () => {
  const st = Game.st;
  const R = Renderer;
  const VW = R.VW, VH = R.VH;

  // ---- boot / loading
  let loadFrac = 0;
  const drawLoading = () => {
    R.clear('#05060f');
    R.textBox(['Little Willy', 'Loading ... ' + Math.round(loadFrac * 100) + '%'], { title: true });
    R.present();
  };
  drawLoading();
  try {
    await Assets.load(f => { loadFrac = f; drawLoading(); });
  } catch (e) {
    R.clear('#05060f');
    R.textBox(['Little Willy', 'Could not load the game data.', '',
               'Please serve the folder with a', 'web server (see README).'], { title: true });
    R.present();
    throw e;
  }
  Game.init(Assets.data);
  Audio2.setSequences(Assets.data.sounds);
  Game.loadProgress();

  let paused = false;         // a level is suspended behind the menu
  let fadeT = 0, blink = 0, msgT = 0;
  let msgLines = null, msgNext = null;
  let toast = null, toastT = 0;

  /** short status line shown over the playfield */
  function showToast(s) { toast = s; toastT = 1.8; }

  // debug/testing: ?level=N[&x=..&y=..] jumps straight into a level, ?god=1 cheats
  const dbgParams = new URLSearchParams(location.search);
  if (dbgParams.get('god') !== null) st.god = dbgParams.get('god') !== '0';
  if (dbgParams.get('level') !== null) {
    Game.enterLevel(parseInt(dbgParams.get('level'), 10) || 0);
    if (dbgParams.get('x') !== null) {
      st.w.x = st.w.px = parseInt(dbgParams.get('x'), 10);
      st.w.y = st.w.py = parseInt(dbgParams.get('y'), 10) || st.w.y;
    }
    st.mode = 'play';
    Input.clearAnyKey();
  }

  // ------------------------------------------------ intro, title and story
  // Timings are the original's, counted in vertical retraces (70 Hz).
  const VS = 1 / 70;
  const PAL_T = 48 * VS;          // 16 palette entries, 3 retraces each
  let cine = null;                // state of the running screen sequence

  /** palette mask while fading in (entries appear one by one) */
  const palIn = (t) => (1 << Math.min(16, Math.floor(t / (3 * VS)) + 1)) - 1;
  /** palette mask while fading out (entries vanish one by one) */
  const palOut = (t) => ~palIn(t) & 0xffff;

  /* "Dimension 16 & M.B. Soft presents": DIM.DAT fades in, stays about
   * three seconds or until a key is pressed, then the title fades in. */
  function startIntro() {
    st.mode = 'intro';
    cine = { phase: 'in', t: 0 };
    Input.onAnyKey(() => {
      if (st.mode === 'intro' && cine.phase !== 'out') { cine.phase = 'out'; cine.t = 0; }
    });
  }

  /* The title picture is 320x400: the title on top, the credits below. The
   * original holds each half for 300 retraces and scrolls between them at
   * two rows per retrace; any key fades out to the menu. */
  function startTitle() {
    st.mode = 'title';
    cine = { phase: 'in', t: 0, y: 0, dir: 1 };
    Input.onAnyKey(() => {
      if (st.mode === 'title' && cine.phase !== 'out') { cine.phase = 'out'; cine.t = 0; }
    });
  }

  /* The story as LW5.EXE plays it: four pictures dissolve in one after the
   * other; after the second and the fourth the text paragraphs of
   * TEXT0.DAT/TEXT1.DAT close over the picture like a curtain, each one
   * waiting for a key ('>KEY<'), and at the end everything dissolves to
   * black.  Rows and positions are the ones hard-coded in the EXE. */
  const STORY = [
    { kind: 'dissolve', img: 'story2' },
    { kind: 'dissolve', img: 'story6' },
    { kind: 'text', img: 'text0', blocks: 4, bh: 50, rows: 50, steps: 26, white: 24,
      x: 16, y: 134, w: 160 },
    { kind: 'dissolve', img: 'story11' },
    { kind: 'dissolve', img: 'story13' },
    { kind: 'text', img: 'text1', blocks: 4, bh: 39, rows: 38, steps: 20, white: 19,
      x: 152, y: 25, w: 136 },
    { kind: 'dissolve', img: null },
  ];
  const DISSOLVE_T = 46 * VS;     // 32000 cell copies, one retrace per 700

  function startStory(next) {
    st.mode = 'story';
    cine = { step: -1, next };
    R.pageClear();
    storyAdvance();
  }

  function storyAdvance() {
    const c = cine;
    c.step++;
    c.t = 0;
    if (c.step >= STORY.length) { storyEnd(); return; }
    const s = STORY[c.step];
    if (s.kind === 'dissolve') R.dissolveStart();
    else { c.block = 0; c.k = -1; c.wait = false; }
  }

  function storyKey() {
    const c = cine;
    if (!c || st.mode !== 'story' || !c.wait) return;
    c.block++;
    if (c.block >= STORY[c.step].blocks) storyAdvance();
    else { c.k = -1; c.t = 0; c.wait = false; }
  }

  function storyEnd() {
    const next = cine.next;
    cine = null;
    Input.clearAnyKey();
    next();
  }

  /** Esc skips the rest of the story, as in the original */
  function storySkip() { if (st.mode === 'story' && cine) storyEnd(); }

  function toMenu() {
    st.mode = 'menu';
    Audio2.music(null);
  }

  function startNewGame() {
    st.doorsDone = {};
    Game.saveProgress();
    st.hubReturn = null;
    paused = false;
    startStory(() => startHub(true));
  }

  function continueGame() {
    st.hubReturn = null;
    paused = false;
    startHub(true);
  }

  function startHub(showKeys) {
    Game.enterLevel(0);
    if (showKeys) showInfo(0, () => { st.mode = 'play'; });
    else st.mode = 'play';
  }

  /** level information screen, texts as in the original */
  function infoLines(n) {
    if (n === 0) {
      return ['*** Little Willy ***', '',
              'Default keys:  [ A ] jump',
              '               [ S ] shot',
              '               [ , ] go left',
              '               [ . ] go right', '',
              'Walk into a door to enter a level.', '',
              '> Press any key <'];
    }
    const lines = ['Information about this level:', '', '- Find the EXIT-CARD'];
    const both = [3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 23, 24];
    if (n === 2 || n === 9) lines.push('- Find all drink-boxes');
    if (both.includes(n)) lines.push('- Find all drink-boxes', '- Find all Lollypops');
    if (n === 14) lines.push('', 'Respect the mystical stones!', 'You can not see them!');
    if (n === 24) lines.push('', 'Respect the mystical stones!', 'You can pass them.');
    if (n === 20) lines.push('', "Don't take the drink-boxes!");
    lines.push('', 'Have a good time!', '', '> Press any key <');
    return lines;
  }

  function showInfo(n, next) {
    st.mode = 'info';
    msgLines = infoLines(n);
    Input.onAnyKey(next);
  }

  function showMessage(lines, next) {
    st.mode = 'message';
    msgLines = lines;
    Input.onAnyKey(next);
  }

  function enterDoor(n) {
    // door 1 is the finale and normally needs the other 24 levels first
    if (n === 1 && !st.god && !Game.allDoneExcept(1)) {
      Audio2.play('denied');
      showMessage(['*** Little Willy ***', '', 'This is the last level!',
                   'At first, play all other levels.', '', '> Press any key <'],
                  () => { Game.enterLevel(0); st.mode = 'play'; });
      return;
    }
    Audio2.play('door');
    Game.enterLevel(n);
    showInfo(n, () => { st.mode = 'play'; });
  }

  function levelComplete() {
    st.doorsDone[st.levelNo] = true;
    Game.saveProgress();
    Audio2.stopMusic();
    Audio2.play('complete');
    st.mode = 'complete';
    fadeT = 0;
  }

  /** cheat mode: Willy takes no damage at all */
  function toggleGod() {
    const on = Game.toggleGod();
    showToast(on ? 'God mode ON - items granted' : 'God mode off');
    Audio2.play(on ? 'card' : 'denied');
    if (on && st.w) Renderer.burst(st.w.x + 8, st.w.y + 8, ['#ffd257', '#ffffff', '#8cf'], 16, 70);
    return on;
  }

  function toggleFullscreen() {
    const el = document.getElementById('stage');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }

  // ---- menu keys
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (st.mode === 'menu') {
      if (k === 'n') startNewGame();
      else if (k === 'c') continueGame();
      else if (k === 'y') startStory(toMenu);
      else if (k === 'o') Audio2.toggleSfx();
      else if (k === 'm') Audio2.toggleMusic();
      else if (k === 'g') toggleGod();
      else if (k === 'f') toggleFullscreen();
      else if (k === 't') startTitle();
      else if (k === 'h' && paused) { paused = false; st.hubReturn = null; startHub(false); }
      else if (e.key === 'Escape' && paused) {
        paused = false; st.mode = 'play';
        Audio2.music(st.levelNo === 0 ? 'hub' : 'level');
      }
    } else if (st.mode === 'play') {
      if (e.key === 'Escape') { paused = true; toMenu(); }
      else if (k === 'f') toggleFullscreen();
      else if (k === 'm') { showToast('Music: ' + (Audio2.toggleMusic() ? 'on' : 'off')); }
      else if (k === 'o') { showToast('Sound: ' + (Audio2.toggleSfx() ? 'on' : 'off')); }
      else if (k === 'g') toggleGod();
    } else if (st.mode === 'story') {
      if (e.key === 'Escape') storySkip();
    } else if (st.mode === 'end') {
      if (endT > 2) { st.mode = 'menu'; }
    }
  });

  // ---- touch: show the on-screen buttons only on coarse pointers
  const tc = document.getElementById('touch-controls');
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) tc.classList.add('show');

  // ------------------------------------------------------------- rendering
  const lerp = (a, b, t) => a + (b - a) * t;

  /* The reunion at the end, from LEND.SPR. The [duration, frame] program is
   * the one LW5.EXE feeds to the ending figure: Mama waits, bends down, picks
   * Willy up, then the pair flashes white (frame 11) and is gone (frame 12)
   * before it starts over. */
  const END_ANIM = [[55, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
                    [2, 7], [2, 8], [2, 9], [25, 10],
                    [1, 11], [6, 10], [1, 11], [5, 10], [1, 11], [4, 10],
                    [1, 11], [3, 10], [1, 11], [1, 10], [1, 11], [1, 10],
                    [1, 11], [1, 10], [1, 11], [1, 10], [20, 12]];
  const END_TOTAL = END_ANIM.reduce((s, p) => s + p[0], 0);

  function endFrame(tick) {
    let k = tick % END_TOTAL;
    for (const [d, f] of END_ANIM) { if (k < d) return f; k -= d; }
    return 0;
  }

  function drawHeart(x, y, on, god) {
    const c = god ? '#ffd257' : (on ? '#ff3b4a' : '#3a2a3a');
    R.rect(x + 1, y, 2, 1, c); R.rect(x + 4, y, 2, 1, c);
    R.rect(x, y + 1, 7, 2, c);
    R.rect(x + 1, y + 3, 5, 1, c);
    R.rect(x + 2, y + 4, 3, 1, c);
    R.rect(x + 3, y + 5, 1, 1, c);
    if (on || god) R.rect(x + 1, y + 1, 1, 1, god ? '#fff6c0' : '#ff9aa4');
  }

  function drawToast() {
    if (toastT <= 0 || !toast) return;
    const w = R.textWidth(toast) + 12;
    const a = Math.min(1, toastT * 3);
    R.rect((VW - w) >> 1, 18, w, 12, 'rgba(0,0,20,' + (0.75 * a).toFixed(2) + ')');
    R.text(toast, VW >> 1, 21, '#ffe36a', 'center', '#101020');
  }

  function drawHud() {
    // energy (golden and always full in god mode)
    R.rect(2, 2, st.god ? 62 : 40, 10, 'rgba(0,0,20,0.55)');
    for (let i = 0; i < 4; i++) drawHeart(5 + i * 9, 4, i < st.energy, st.god);
    if (st.god) R.text('GOD', 44, 4, '#ffd257');
    drawToast();
    if (st.levelNo === 0) {
      const s = 'DOORS ' + Game.doorsDoneCount() + '/24';
      const w = R.textWidth(s) + 8;
      R.rect(VW - w - 2, VH - 13, w, 11, 'rgba(0,0,20,0.55)');
      R.text(s, VW - 6, VH - 11, '#cfe0ff', 'right');
      return;
    }
    // items still needed + exit card
    const L = st.level;
    const drinks = L.items.some(i => i.kind === 0 && (i.spr === 80 || i.spr === 88));
    const lolly = L.items.some(i => i.kind === 0 && i.spr === 89);
    const hasCard = L.items.some(i => i.kind === 3);
    let x = VW - 2;
    if (hasCard) {
      x -= 26;
      R.rect(x - 2, 2, 28, 20, 'rgba(0,0,20,0.55)');
      R.drawSprite('spez', 7, x, 4, st.card ? 1 : 0.28);
    }
    if (L.need > 0 || st.needed !== 0) {
      const s = '' + Math.max(0, st.needed);
      const iw = 24, w = iw + R.textWidth(s) + 12;
      x -= w + 2;
      R.rect(x, 2, w, 20, 'rgba(0,0,20,0.55)');
      R.drawSprite('spez', drinks ? 0 : (lolly ? 9 : 0), x + 2, 4);
      R.text(s, x + iw + 5, 8, '#ffffff', 'left', '#000');
    }
  }

  function drawLevel(alpha) {
    const cam = { x: Math.round(lerp(st.cam.px, st.cam.x, alpha)),
                  y: Math.round(lerp(st.cam.py, st.cam.y, alpha)) };
    const L = st.level;
    const t = st.time * 1000;
    if (R.hasBlackTiles(cam, L, st.map)) {
      R.clear('#000');
      R.drawStars(cam, t);
    }
    R.drawTiles(cam, L, st.map, t);

    // deco sprites
    for (const d of st.deco) {
      const [key, idx] = Assets.resolveSlot(L, d.spr);
      if (key) R.drawSprite(key, idx, d.x - cam.x, d.y - cam.y);
    }

    // hub: marker on the doors of completed levels
    if (st.levelNo === 0) {
      for (const d of L.doors) {
        if (st.doorsDone[d.level]) R.drawSprite('lmain', 3, d.x - cam.x, d.y - cam.y);
      }
    }

    // items
    for (const it of st.items) {
      if (it.state !== 1) continue;
      R.drawSprite('spez', it.spr - 80, it.x - cam.x, it.y - cam.y);
    }

    // enemies
    for (const e of st.enemies) {
      if (!e.active || e.dead) continue;
      const [key, idx] = Assets.resolveSlot(L, e.sprite);
      if (!key) continue;
      const ex = Math.round(lerp(e.vpx, e.vx, alpha)) - cam.x;
      const ey = Math.round(lerp(e.vpy, e.vy, alpha)) - cam.y;
      if (e.cool > 0 && (st.iter & 1)) R.drawSpriteFlash(key, idx, ex, ey);
      else R.drawSprite(key, idx, ex, ey);
    }

    // shot + explosion
    if (st.shot.state === 3) {
      R.drawSprite('willy', st.shot.spr, st.shot.x - cam.x, st.shot.y - cam.y);
    }
    if (st.expl.state === 3) {
      R.drawSprite('willy', Math.min(26, st.expl.frame), st.expl.x - cam.x, st.expl.y - cam.y);
    }

    // Willy (flickers while invulnerable)
    const w = st.w;
    const flicker = st.inv > 0 && ((st.tick >> 1) & 1);
    if (!flicker) {
      const wx = Math.round(lerp(w.px, w.x, alpha)) - cam.x;
      const wy = Math.round(lerp(w.py, w.y, alpha)) - cam.y;
      R.drawSprite('willy', Game.WF()[w.frame], wx, wy);
    }

    R.drawParticles(cam);
    drawHud();
  }

  // --------------------------------------------------------------- loop
  let last = performance.now();
  let acc = 0;
  let endT = 0;
  const TICK = Game.TICK;

  function simulate(dt) {
    acc += dt;
    let n = 0;
    while (acc >= TICK && n < 4) {
      Game.tick();
      acc -= TICK;
      n++;
      if (st.result) break;
    }
    if (n === 4) acc = 0;
    return Math.min(1, acc / TICK);
  }

  function handleResult() {
    const r = st.result;
    st.result = null;
    if (r === 'complete') levelComplete();
    else if (r === 'dead') {
      st.mode = 'dead';
      fadeT = 0;
    } else if (r && r.door) enterDoor(r.door);
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    blink += dt;
    if (toastT > 0) toastT -= dt;
    Input.pollGamepad();

    switch (st.mode) {
      case 'intro': {
        const c = cine;
        c.t += dt;
        if (c.phase === 'in') {
          R.drawScreenPal('dim', 0, palIn(c.t));
          if (c.t >= PAL_T) { c.phase = 'hold'; c.t = 0; }
        } else if (c.phase === 'hold') {
          R.drawScreen('dim');
          if (c.t >= 200 * VS) { c.phase = 'out'; c.t = 0; }
        } else {
          R.drawScreenPal('dim', 0, palOut(c.t));
          if (c.t >= PAL_T) startTitle();
        }
        break;
      }

      case 'title': {
        const c = cine;
        c.t += dt;
        if (c.phase === 'in') {
          R.drawScreenPal('title', c.y, palIn(c.t));
          if (c.t >= PAL_T) { c.phase = 'hold'; c.t = 0; }
          break;
        }
        if (c.phase === 'out') {
          R.drawScreenPal('title', Math.round(c.y), palOut(c.t));
          if (c.t >= PAL_T) toMenu();
          break;
        }
        if (c.phase === 'hold') {
          if (c.t >= 300 * VS) { c.phase = 'scroll'; c.t = 0; }
        } else {                                   // scroll: 2 rows per retrace
          c.y = Game.clamp(c.y + c.dir * 2 * dt / VS, 0, VH);
          if (c.y === 0 || c.y === VH) { c.dir = -c.dir; c.phase = 'hold'; c.t = 0; }
        }
        R.drawScreen('title', Math.round(c.y));
        if (Math.floor(blink * 1.6) % 2 === 0) {
          R.text('> Press any key <', VW / 2, VH - 14, '#ffffff', 'center', '#202040');
        }
        break;
      }

      case 'menu': {
        R.drawScreen('title');
        R.fade(0.7);
        const lines = ['*** Little Willy ***', ''];
        lines.push('[ N ]  New game');
        lines.push('[ C ]  Continue (' + Game.doorsDoneCount() + '/24 doors done)');
        lines.push('[ Y ]  Game story');
        lines.push('[ O ]  Sound effects: ' + (Audio2.sfxEnabled ? 'on' : 'off'));
        lines.push('[ M ]  Music: ' + (Audio2.musicEnabled ? 'on' : 'off'));
        lines.push('[ G ]  God mode (cheat): ' + (st.god ? 'ON' : 'off'));
        lines.push('[ F ]  Fullscreen');
        if (paused) {
          lines.push('[ H ]  Return to the Galactic Train');
          lines.push('[ESC]  Return to current level');
        }
        lines.push('', 'A jump  S shot  , left  . right', 'or arrows / Space / Ctrl');
        R.textBox(lines, { title: true, w: 250 });
        break;
      }

      case 'story': {
        const c = cine, s = STORY[c.step];
        c.t += dt;
        if (s.kind === 'dissolve') {
          if (R.dissolveTo(s.img, c.t / DISSOLVE_T)) storyAdvance();
          R.pageBlit();
          break;
        }
        // a text paragraph closes over the picture from both edges, one
        // pair of rows every three retraces, a white line at each edge
        const k = Math.min(s.steps - 1, Math.floor(c.t / (3 * VS)));
        while (c.k < k) {
          c.k++;
          const top = c.block * s.bh + c.k, bot = c.block * s.bh + s.rows - 1 - c.k;
          R.pageCopy(s.img, 0, top, s.w, 1, s.x, s.y + c.k);
          R.pageCopy(s.img, 0, bot, s.w, 1, s.x, s.y + s.rows - 1 - c.k);
          if (c.k < s.white) {
            R.pageRect(s.x, s.y + c.k + 1, s.w, 1, '#ffffff');
            R.pageRect(s.x, s.y + s.rows - 2 - c.k, s.w, 1, '#ffffff');
          }
        }
        if (!c.wait && c.k >= s.steps - 1) { c.wait = true; Input.onAnyKey(storyKey); }
        R.pageBlit();
        if (c.wait) R.text('>KEY<', 272, 185, '#ff55ff');
        break;
      }

      case 'info':
      case 'message':
        if (st.level) drawLevel(1); else R.clear('#000');
        R.fade(0.35);
        R.textBox(msgLines, { title: true });
        break;

      case 'play': {
        const alpha = simulate(dt);
        R.updateParticles(dt);
        drawLevel(alpha);
        if (st.result) handleResult();
        break;
      }

      case 'dead': {
        fadeT += dt;
        R.updateParticles(dt);
        drawLevel(1);
        R.fade(Math.min(1, fadeT * 1.5));
        if (fadeT > 0.9) {
          Game.enterLevel(st.levelNo);
          st.mode = 'play';
          Renderer.clearParticles();
        }
        break;
      }

      case 'complete': {
        fadeT += dt;
        R.updateParticles(dt);
        drawLevel(1);
        R.textBox(['Level ' + st.levelNo + ' completed!', '',
                   'Back to the Galactic Train ...'], { title: true });
        if (fadeT > 1.8) {
          if (st.levelNo === 1) {           // the prison: game finished!
            st.mode = 'end';
            endT = 0;
            Audio2.stopMusic();
          } else {
            Game.enterLevel(0);
            st.mode = 'play';
          }
        }
        break;
      }

      case 'end': {
        endT += dt;
        R.drawScreen('end');
        // Willy and his mother, reunited, on the original's closing artwork
        R.drawSprite('lend', endFrame(Math.floor(endT * Game.TICK_HZ)),
                     (VW - 40) >> 1, 94);
        const lines = ['You did it - Mama is free!', '',
                       '(c) 1993/94 I. Mustun, Dimension 16'];
        lines.push(endT > 2 && Math.floor(blink * 1.6) % 2 === 0
                   ? '> Press any key <' : '');
        R.textBox(lines, { title: true, y: VH - 56, w: 236 });
        break;
      }

      default:
        R.clear('#000');
    }

    R.present();
    requestAnimationFrame(frame);
  }

  if (st.mode !== 'play') startIntro();
  requestAnimationFrame(frame);
})();
