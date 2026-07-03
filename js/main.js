/* Main loop and screen flow:
 * boot -> title -> menu -> story -> hub -> (info -> level)* -> end */
'use strict';

(async () => {
  const st = Game.st;
  const R = Renderer;

  // ---- boot / loading
  let loadFrac = 0;
  const drawLoading = () => {
    R.clear();
    R.textBox(['Little Willy', 'Loading … ' + Math.round(loadFrac * 100) + '%'],
              { title: true });
  };
  drawLoading();
  await Assets.load(f => { loadFrac = f; drawLoading(); });
  Game.loadProgress();

  st.mode = 'title';
  Input.onAnyKey(() => { if (st.mode === 'title') toMenu(); });

  // debug/testing: ?level=N[&x=..&y=..] jumps straight into a level
  const dbgParams = new URLSearchParams(location.search);
  if (dbgParams.get('level') !== null) {
    st.mode = 'play';
    Game.enterLevel(parseInt(dbgParams.get('level'), 10) || 0);
    if (dbgParams.get('x') !== null) {
      st.wx = parseInt(dbgParams.get('x'), 10);
      st.wy = parseInt(dbgParams.get('y'), 10) || st.wy;
    }
  }

  function toMenu() {
    st.mode = 'menu';
    Audio2.music(null);
  }

  const STORY = [
    { img: 'story2', lines: ['Willy and his mother live happily', 'on a small green planet …'] },
    { img: 'story6', lines: ['O no! An attack on the space-station!', 'Mama has been kidnapped!'] },
    { img: 'story11', lines: ['The kidnappers escaped', 'through the Galactic Train …'] },
    { img: 'story13', lines: ['Willy follows them.', 'And you must help him!', '', '"Where is mama?"'] },
  ];

  function startNewGame() {
    st.doorsDone = {};
    st.lives = 4;
    st.score = 0;
    st.hubReturn = null;
    st.storyIdx = 0;
    st.mode = 'story';
    Input.onAnyKey(advanceStory);
  }

  function continueGame() {
    st.lives = 4;
    st.hubReturn = null;
    startHub();
  }

  function advanceStory() {
    st.storyIdx++;
    if (st.storyIdx >= STORY.length) startHub();
    else Input.onAnyKey(advanceStory);
  }

  function startHub() {
    st.mode = 'play';
    Game.enterLevel(0);
  }

  // menu keys
  window.addEventListener('keydown', (e) => {
    if (st.mode === 'menu') {
      const k = e.key.toLowerCase();
      if (k === 'n') startNewGame();
      else if (k === 'l' || k === 'c') continueGame();
      else if (k === 'o') {
        const on = Audio2.toggle();
        document.getElementById('btn-sound').textContent = on ? '🔊' : '🔇';
      }
      else if (k === 't') { st.mode = 'title'; Input.onAnyKey(() => toMenu()); }
    } else if (st.mode === 'play' && e.key === 'Escape') {
      // back to menu (progress kept)
      Audio2.stopMusic();
      st.mode = 'menu';
      Game.updateHud();
    } else if (st.mode === 'gameover' || st.mode === 'end') {
      if (e.key) { st.mode = 'menu'; Game.updateHud(); }
    }
  });

  document.getElementById('btn-sound').addEventListener('click', () => {
    Audio2.resume();
    const on = Audio2.toggle();
    document.getElementById('btn-sound').textContent = on ? '🔊' : '🔇';
  });
  document.getElementById('btn-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.getElementById('stage').requestFullscreen();
  });

  // ------------------------------------------------------------- rendering
  function drawWilly() {
    let frame;
    const moving = Input.state.left || Input.state.right;
    if (st.face > 0) {
      frame = 12 + (moving && st.onGround ? Math.floor(st.walkPhase) % 12 : 0);
    } else {
      frame = 0 + (moving && st.onGround ? Math.floor(st.walkPhase) % 12 : 0);
    }
    if (!st.onGround) frame = st.face > 0 ? 16 : 4;
    R.drawSprite(st.cam, 'willy', frame, st.wx, st.wy);
  }

  function drawLevel(t) {
    R.drawBackdrop(st.cam, t);
    R.drawTiles(st.cam, { ...st.level, map: st.map }, t);

    // deco sprites
    for (const d of st.level.deco || []) {
      const [key, idx] = Game.resolveSprite(st.levelNo, d.spr);
      if (key) R.drawSprite(st.cam, key, idx, d.x, d.y);
    }

    // hub: green overlay door for completed levels
    if (st.levelNo === 0) {
      for (const d of st.level.doors) {
        if (st.doorsDone[d.level]) {
          R.drawSprite(st.cam, 'lmain', 3, d.x - 8, d.y + 3);
        }
        // level number floats above door
        const [sx, sy] = R.worldToScreen(st.cam, d.x + 16, d.y - 4);
        if (sx > -40 && sx < R.canvas.width + 40 && sy > -20 && sy < R.canvas.height) {
          R.ctx.font = `bold ${R.S * 6}px "Segoe UI", sans-serif`;
          R.ctx.textAlign = 'center';
          R.ctx.fillStyle = st.doorsDone[d.level] ? 'rgba(120,255,150,0.85)'
                                                  : 'rgba(230,240,255,0.75)';
          R.ctx.fillText(d.level, sx, sy);
        }
      }
    }

    // items with glow
    for (const it of st.items) {
      if (it.taken) continue;
      const bob = Math.sin(st.t * 0.004 + it.x * 0.3) * 1.5;
      const colors = { 0: 'rgba(255,150,220,0.30)', 1: 'rgba(255,230,120,0.30)',
                       2: 'rgba(170,140,255,0.33)', 3: 'rgba(110,255,140,0.4)' };
      R.itemGlow(st.cam, it.x, it.y, st.t, colors[it.kind] || colors[0]);
      R.drawSprite(st.cam, 'spez', it.spr - 80, it.x, it.y + bob);
    }

    // enemies
    for (const e of st.enemies) {
      if (!e.alive) continue;
      const [key, idx] = Game.resolveSprite(st.levelNo, e.sprite);
      if (key) R.drawSprite(st.cam, key, idx, e.px, e.py);
    }

    // willy + shot
    drawWilly();
    if (st.shot) {
      const fr = 27 + (Math.floor(st.t / 50) % 4);
      R.drawSprite(st.cam, 'willy', fr, st.shot.x, st.shot.y);
    }

    R.drawParticles(st.cam);
    R.vignette();
  }

  // --------------------------------------------------------------- loop
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now;

    switch (st.mode) {
      case 'title':
        R.drawScreen('title', { half: true });
        if (Math.floor(t / 600) % 2 === 0) {
          R.textBox(['Press any key'], { y: 0.86, w: 0.4 });
        }
        break;

      case 'menu':
        R.drawScreen('title', { half: true });
        R.fade(0.72);
        R.textBox([
          '*** Little Willy ***', '',
          '[ N ]  New game',
          '[ C ]  Continue  (' + Object.keys(st.doorsDone).length + '/24 levels done)',
          '[ O ]  Sound on/off',
          '[ T ]  Title screen', '',
          'Keys:  A jump · S shoot · , left · . right',
          '(or arrows + Space/Ctrl) · Esc = menu',
        ], { title: true });
        break;

      case 'story': {
        const s = STORY[Math.min(st.storyIdx, STORY.length - 1)];
        R.drawScreen(s.img);
        R.textBox([...s.lines, '', '> Press any key <'], { y: 0.72, w: 0.7 });
        break;
      }

      case 'info':
        if (st.level) drawLevel(t); else R.clear();
        R.textBox(st.infoLines, { title: true });
        break;

      case 'play':
        Game.updatePlay(dt);
        st.t += 0;  // t advanced in updatePlay
        drawLevel(t);
        break;

      case 'dying': {
        st.fadeT += dt;
        drawLevel(t);
        R.updateParticles(dt);
        R.fade(Math.min(1, st.fadeT * 1.2));
        if (st.fadeT > 1.1) {
          if (st.lives <= 0) {
            st.mode = 'gameover';
            Audio2.stopMusic();
          } else {
            // respawn: hub -> at last door; level -> level start
            Game.enterLevel(st.levelNo);
            st.mode = 'play';
          }
        }
        break;
      }

      case 'complete': {
        st.fadeT += dt;
        drawLevel(t);
        R.textBox(['Level ' + st.levelNo + ' complete!', '',
                   'Back to the Galactic Train …'], { title: true });
        if (st.fadeT > 2.2) {
          if (st.levelNo === 1) {           // the prison — game finished!
            st.mode = 'end';
            st.endT = 0;
            Audio2.play('win');
          } else {
            st.mode = 'play';
            Game.enterLevel(0);
          }
        }
        break;
      }

      case 'gameover':
        R.clear();
        R.drawScreen('dim');
        R.fade(0.6);
        R.textBox(['GAME OVER', '', 'Score: ' + st.score, '',
                   'Press any key for the menu'], { title: true });
        break;

      case 'end': {
        st.endT += dt;
        R.drawScreen('end');
        const y = Math.max(0.15, 0.8 - st.endT * 0.05);
        R.textBox(['You did it — Mama is free!', '',
                   'Willy and his mother return home.', '',
                   'Score: ' + st.score, '',
                   'Thanks and … see you later!',
                   '(c) 1993/1994 I. Mustun — Dimension 16 & M.B. Soft',
                   'Browser remake 2026'], { y, w: 0.75 });
        break;
      }

      default:
        R.clear();
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
