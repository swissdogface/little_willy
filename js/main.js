/* Main loop and screen flow:
 * boot -> title -> menu -> story -> hub -> (info -> level)* -> end
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
  let storyIdx = 0;

  st.mode = 'title';
  Input.onAnyKey(() => { if (st.mode === 'title') toMenu(); });

  // debug/testing: ?level=N[&x=..&y=..] jumps straight into a level
  const dbgParams = new URLSearchParams(location.search);
  if (dbgParams.get('level') !== null) {
    Game.enterLevel(parseInt(dbgParams.get('level'), 10) || 0);
    if (dbgParams.get('x') !== null) {
      st.w.x = st.w.px = parseInt(dbgParams.get('x'), 10);
      st.w.y = st.w.py = parseInt(dbgParams.get('y'), 10) || st.w.y;
    }
    st.mode = 'play';
    Input.clearAnyKey();
  }

  const STORY = [
    { img: 'story2', lines: ['Willy and his mother live happily', 'on a small green planet ...'] },
    { img: 'story6', lines: ['Oh no! An attack on the space station!', 'Mama has been kidnapped!'] },
    { img: 'story11', lines: ['The kidnappers escaped', 'through the Galactic Train ...'] },
    { img: 'story13', lines: ['Willy follows them.', 'And you must help him!', '', '"Where is mama?"'] },
  ];

  function toMenu() {
    st.mode = 'menu';
    Audio2.music(null);
  }

  function menuStoryNext() {
    storyIdx++;
    if (storyIdx >= STORY.length) toMenu();
    else Input.onAnyKey(menuStoryNext);
  }

  function startNewGame() {
    st.doorsDone = {};
    Game.saveProgress();
    st.hubReturn = null;
    paused = false;
    storyIdx = 0;
    st.mode = 'story';
    Input.onAnyKey(advanceStory);
  }

  function continueGame() {
    st.hubReturn = null;
    paused = false;
    startHub(true);
  }

  function advanceStory() {
    storyIdx++;
    if (storyIdx >= STORY.length) startHub(true);
    else Input.onAnyKey(advanceStory);
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
    if (n === 1 && !Game.allDoneExcept(1)) {
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
      else if (k === 'y') { storyIdx = 0; st.mode = 'story'; Input.onAnyKey(menuStoryNext); }
      else if (k === 'o') Audio2.toggleSfx();
      else if (k === 'm') Audio2.toggleMusic();
      else if (k === 'f') toggleFullscreen();
      else if (k === 't') { st.mode = 'title'; Input.onAnyKey(() => toMenu()); }
      else if (k === 'h' && paused) { paused = false; st.hubReturn = null; startHub(false); }
      else if (e.key === 'Escape' && paused) {
        paused = false; st.mode = 'play';
        Audio2.music(st.levelNo === 0 ? 'hub' : 'level');
      }
    } else if (st.mode === 'play') {
      if (e.key === 'Escape') { paused = true; toMenu(); }
      else if (k === 'f') toggleFullscreen();
      else if (k === 'm') Audio2.toggleMusic();
      else if (k === 'o') Audio2.toggleSfx();
    } else if (st.mode === 'end') {
      if (endT > 2) { st.mode = 'menu'; }
    }
  });

  // ---- touch: show the on-screen buttons only on coarse pointers
  const tc = document.getElementById('touch-controls');
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) tc.classList.add('show');

  // ------------------------------------------------------------- rendering
  const lerp = (a, b, t) => a + (b - a) * t;

  function drawHeart(x, y, on) {
    const c = on ? '#ff3b4a' : '#3a2a3a';
    R.rect(x + 1, y, 2, 1, c); R.rect(x + 4, y, 2, 1, c);
    R.rect(x, y + 1, 7, 2, c);
    R.rect(x + 1, y + 3, 5, 1, c);
    R.rect(x + 2, y + 4, 3, 1, c);
    R.rect(x + 3, y + 5, 1, 1, c);
    if (on) { R.rect(x + 1, y + 1, 1, 1, '#ff9aa4'); }
  }

  function drawHud() {
    // energy
    R.rect(2, 2, 40, 10, 'rgba(0,0,20,0.55)');
    for (let i = 0; i < 4; i++) drawHeart(5 + i * 9, 4, i < st.energy);
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
    Input.pollGamepad();

    switch (st.mode) {
      case 'title':
        R.drawScreen('title');
        if (Math.floor(blink * 1.6) % 2 === 0) {
          R.text('> Press any key <', VW / 2, VH - 14, '#ffffff', 'center', '#202040');
        }
        break;

      case 'menu': {
        R.drawScreen('title');
        R.fade(0.7);
        const lines = ['*** Little Willy ***', ''];
        lines.push('[ N ]  New game');
        lines.push('[ C ]  Continue (' + Game.doorsDoneCount() + '/24 doors done)');
        lines.push('[ Y ]  Game story');
        lines.push('[ O ]  Sound effects: ' + (Audio2.sfxEnabled ? 'on' : 'off'));
        lines.push('[ M ]  Music: ' + (Audio2.musicEnabled ? 'on' : 'off'));
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
        const s = STORY[Math.min(storyIdx, STORY.length - 1)];
        R.drawScreen(s.img);
        R.textBox([...s.lines, '', '> Press any key <'], { y: VH - 14 - (s.lines.length + 2) * 10 - 8, w: 300 });
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
        const lines = ['You did it. Mama is free!', '',
                       'Willy and his mother return home.', '',
                       'Thanks and ... see you later!', '',
                       '(c) 1993/94 I. Mustun, Dimension 16', '',
                       endT > 2 ? '> Press any key <' : ''];
        R.textBox(lines, { y: 4, w: 260 });
        break;
      }

      default:
        R.clear('#000');
    }

    R.present();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
