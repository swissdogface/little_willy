/* Little Willy core game logic — faithful port of the DOS original:
 * same 25 levels (hub maze + 24), same map attributes
 * (pass/solid/special/deadly), same items (required collectibles,
 * bonus, wall-removers, exit card), same enemy patrol data,
 * same physics feel (walk ~60 px/s, 2-tile jump). */
'use strict';

const Game = (() => {
  // physics constants (derived from the original: 4 px/tick @ ~15 Hz,
  // jump apex 32 px, symmetric arc)
  const WALK = 62;          // px/s
  const JUMP_V = -238;      // px/s
  const GRAV = 900;         // px/s^2
  const FALL_MAX = 260;
  const SHOT_V = 210;
  const TICK = 1 / 15;      // enemy/anim tick, like the DOS timer

  // Willy sprite frames (WILLY.SPR slots)
  const FR_L0 = 0, FR_R0 = 12;   // stand/walk cycle bases
  const WALK_FRAMES = 12;

  // slot ranges per level: [start, end, atlasKey] (mirrors LW5.EXE)
  const SPR_RANGES = {
    0: [[31, 34, 'lmain']],
    1: [[31, 44, 'l01']],
    2: [[31, 52, 'l02']],
    3: [[31, 61, 'l03']],
    4: [[31, 59, 'l04'], [60, 64, 'l02']],
    5: [[31, 62, 'l05']],
    6: [[31, 50, 'l06']],
    7: [[31, 51, 'l03'], [52, 61, 'l07']],
    8: [[31, 62, 'l05']],
    9: [[31, 46, 'l09']],
    10: [[31, 39, 'l10']],
    11: [[31, 48, 'l11']],
    12: [[31, 62, 'l05']],
    13: [[31, 59, 'l13']],
    14: [[31, 61, 'l03']],
    15: [[31, 39, 'l10']],
    16: [[31, 48, 'l11']],
    17: [[31, 52, 'l02']],
    18: [[31, 59, 'l04']],
    19: [[31, 40, 'l07']],
    20: [[31, 46, 'l09']],
    21: [[31, 39, 'l10']],
    22: [[31, 50, 'l06']],
    23: [[31, 59, 'l13']],
    24: [[31, 61, 'l03']],
  };

  const st = {
    mode: 'boot',        // boot,title,menu,story,info,play,dying,complete,gameover,end
    levelNo: 0,
    level: null,
    map: null,
    items: [],
    enemies: [],
    doorsDone: {},
    lives: 4,
    score: 0,
    // willy
    wx: 0, wy: 0, vy: 0, onGround: false, face: 1,
    walkPhase: 0, airborne: false,
    needed: 0, card: false, cardNeeded: false,
    shot: null,
    cam: { x: 0, y: 0 },
    t: 0, tick: 0, fadeT: 0,
    hubReturn: null,     // where to respawn in hub after a level
    storyIdx: 0,
    infoLines: [],
    lastDoor: -1,
    endT: 0,
  };

  function saveProgress() {
    try {
      localStorage.setItem('lw_progress', JSON.stringify({
        doors: st.doorsDone, score: st.score,
      }));
    } catch (e) { /* private mode */ }
  }

  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem('lw_progress') || 'null');
      if (p) { st.doorsDone = p.doors || {}; st.score = p.score || 0; }
    } catch (e) { /* ignore */ }
  }

  function resolveSprite(levelNo, slot) {
    if (slot >= 80) return ['spez', slot - 80];
    if (slot >= 31) {
      for (const [a, b, key] of SPR_RANGES[levelNo]) {
        if (slot >= a && slot <= b) return [key, slot - a];
      }
      return [null, 0];
    }
    return ['willy', slot];
  }

  // ------------------------------------------------------------ level setup
  function enterLevel(n, fromDoor) {
    const L = Assets.data.levels[n];
    st.levelNo = n;
    st.level = L;
    st.map = L.map.slice();
    st.items = L.items.map(it => ({ ...it, taken: false }));
    st.enemies = L.enemies.map(e => initEnemy(e));
    st.wx = L.wx; st.wy = L.wy;
    st.vy = 0; st.onGround = false;
    st.face = 1;
    st.shot = null;
    st.cam.x = clamp(L.scx, 0, 640 - Renderer.VW);
    st.cam.y = clamp(L.scy, 0, 384 - Renderer.VH);
    st.needed = L.need;
    st.cardNeeded = L.items.some(it => it.kind === 3);
    st.card = !st.cardNeeded;
    st.lastDoor = fromDoor !== undefined ? fromDoor : st.lastDoor;
    Renderer.initBackdrop(n + 7);
    if (n === 0 && st.hubReturn) {
      st.wx = st.hubReturn.x; st.wy = st.hubReturn.y;
      st.cam.x = clamp(st.wx - Renderer.VW / 2, 0, 640 - Renderer.VW);
      st.cam.y = clamp(st.wy - Renderer.VH / 2, 0, 384 - Renderer.VH);
    }
    Audio2.music(n === 0 ? 'hub' : 'level');
    updateHud();
  }

  function initEnemy(e) {
    const wide = e.maxx - e.minx > 20;
    const tall = e.maxy - e.miny > 20;
    let sx = 0, sy = 0;
    if (e.b[1] === 1) {              // vertical mover flag
      sy = e.b[0] || e.b[2] || 2;
    } else {
      sx = wide ? (e.b[0] || e.b[2] || 2) : 0;
      sy = tall ? (e.b[2] || (wide ? 0 : e.b[0]) || (wide ? 0 : 2)) : 0;
    }
    // px per tick -> px/s at 15 Hz
    return { ...e, px: e.x, py: e.y, dx: (sx || 0) * 15, dy: (sy || 0) * 15,
             dirx: 1, diry: 1, progIdx: 0, progT: 0, alive: true,
             sprite: e.prog.length ? e.prog[0][1] : 31 };
  }

  // ------------------------------------------------------------- collision
  function attrAt(x, y) {
    const c = Math.floor(x / 16), r = Math.floor(y / 16);
    if (c < 0 || c > 39 || r < 0 || r > 23) return 1;
    return st.map[r * 40 + c] >> 6;
  }

  function solidAt(x, y) { return attrAt(x, y) === 1; }

  // Willy hitbox inside his 24x16 sprite (matches original probe points)
  const BL = 6, BR = 17, BT = 1, BB = 15;

  function collideH(nx) {
    const dir = nx > st.wx ? 1 : -1;
    const edge = dir > 0 ? nx + BR : nx + BL;
    if (solidAt(edge, st.wy + BT + 2) || solidAt(edge, st.wy + BB - 1) ||
        solidAt(edge, st.wy + 8)) {
      return true;
    }
    return false;
  }

  function groundBelow(y) {
    return solidAt(st.wx + BL + 1, y + BB + 1) || solidAt(st.wx + BR - 1, y + BB + 1) ||
           solidAt(st.wx + 12, y + BB + 1);
  }

  function ceilingAbove(y) {
    return solidAt(st.wx + BL + 1, y + BT) || solidAt(st.wx + BR - 1, y + BT);
  }

  // ------------------------------------------------------------------ play
  function updatePlay(dt) {
    st.t += dt * 1000;
    const inp = Input.state;

    // horizontal
    let dx = 0;
    if (inp.left) { dx = -WALK * dt; st.face = -1; }
    else if (inp.right) { dx = WALK * dt; st.face = 1; }
    if (dx !== 0) {
      const nx = st.wx + dx;
      if (!collideH(nx)) st.wx = clamp(nx, -BL, 640 - BR - 1);
      st.walkPhase += Math.abs(dx) * 0.25;
    }

    // jump
    if (Input.consume('jump') && st.onGround) {
      // door entry in the hub has priority over jumping
      if (st.levelNo === 0 && tryEnterDoor()) return;
      st.vy = JUMP_V;
      st.onGround = false;
      Audio2.play('jump');
    }

    // gravity
    st.vy = Math.min(st.vy + GRAV * dt, FALL_MAX);
    let ny = st.wy + st.vy * dt;
    if (st.vy > 0) {
      // falling: land on solid
      while (groundBelow(ny) && ny > st.wy - 20) ny -= 1;
      if (groundBelow(ny + 0.5)) {
        // snap to tile top
        ny = Math.round((ny + BB + 1) / 16) * 16 - BB - 1;
        if (!st.onGround && st.vy > 140) Audio2.play('step');
        st.vy = 0;
        st.onGround = true;
      } else {
        st.onGround = false;
      }
    } else if (st.vy < 0) {
      if (ceilingAbove(ny)) {
        ny = st.wy;
        st.vy = 0;
      }
      st.onGround = false;
    }
    st.wy = clamp(ny, 0, 384 - 16);
    if (st.wy >= 384 - 16 && !groundBelow(st.wy)) {
      // fell out of the world
      return die();
    }

    // still on ground?
    if (st.onGround && !groundBelow(st.wy)) st.onGround = false;

    // deadly tile under feet (original: probe at x+8, y+18)
    if (attrAt(st.wx + 12, st.wy + 17) === 3 || attrAt(st.wx + 12, st.wy + 10) === 3) {
      return die();
    }

    // shooting
    if (Input.consume('shot') && !st.shot) {
      st.shot = { x: st.wx + (st.face > 0 ? 20 : -4), y: st.wy + 6,
                  vx: st.face * SHOT_V, t: 0 };
      Audio2.play('shoot');
    }
    if (st.shot) {
      st.shot.x += st.shot.vx * dt;
      st.shot.t += dt;
      if (st.shot.x < -10 || st.shot.x > 640 ||
          solidAt(st.shot.x + 4, st.shot.y + 3)) {
        st.shot = null;
      } else {
        for (const e of st.enemies) {
          if (!e.alive) continue;
          const [key, idx] = resolveSprite(st.levelNo, e.sprite);
          const fr = Assets.sprFrame(key, idx);
          const w = fr ? fr.logical[0] : 24, h = fr ? fr.logical[1] : 16;
          if (st.shot.x > e.px - 4 && st.shot.x < e.px + w &&
              st.shot.y > e.py - 6 && st.shot.y < e.py + h) {
            e.alive = false;
            st.score += 100;
            Renderer.burst(e.px + w / 2, e.py + h / 2, '#ffcf5a', 18, 120);
            Audio2.play('hitEnemy');
            st.shot = null;
            break;
          }
        }
      }
    }

    // fixed-rate tick for enemies/animation (original 15 Hz feel)
    st.tick += dt;
    while (st.tick >= TICK) {
      st.tick -= TICK;
      tickEnemies();
    }
    // enemy contact
    for (const e of st.enemies) {
      if (!e.alive) continue;
      const [key, idx] = resolveSprite(st.levelNo, e.sprite);
      const fr = Assets.sprFrame(key, idx);
      const w = fr ? fr.logical[0] : 24, h = fr ? fr.logical[1] : 16;
      if (st.wx + BR > e.px + 3 && st.wx + BL < e.px + w - 3 &&
          st.wy + BB > e.py + 3 && st.wy + BT < e.py + h - 3) {
        return die();
      }
    }

    // items
    for (const it of st.items) {
      if (it.taken) continue;
      if (Math.abs(it.x - st.wx) <= 16 && Math.abs(it.y - st.wy) <= 16) {
        it.taken = true;
        onItem(it);
      }
    }

    // exit (levels): original checks |wx+4-exx|<16, wy-exy<32,
    // card collected and all required items taken
    if (st.levelNo !== 0 && (st.level.exx || st.level.exy)) {
      if (Math.abs(st.wx + 4 - st.level.exx) < 16 &&
          Math.abs(st.wy - st.level.exy) < 32 &&
          st.card && st.needed <= 0) {
        return completeLevel();
      }
    }

    updateCamera(dt);
    Renderer.updateParticles(dt);
  }

  function tryEnterDoor() {
    for (const d of st.level.doors) {
      if (st.doorsDone[d.level]) continue;
      if (Math.abs(st.wx + 4 - (d.x + 8)) < 18 && st.wy + 15 >= d.y &&
          st.wy <= d.y + 32) {
        // door 1 leads to the FINAL level (the prison, L01) — only
        // playable once every other level is done (as in the original)
        if (d.level === 1 && !allDoneExcept(1)) {
          st.mode = 'info';
          st.infoLines = ['*** Little Willy ***', '',
                          'This is the last level!',
                          'At first, play all other levels.', '',
                          '> Press any key <'];
          Input.onAnyKey(() => { st.mode = 'play'; });
          Audio2.play('denied');
          return true;
        }
        st.hubReturn = { x: d.x, y: d.y + 16 };
        Audio2.play('door');
        showLevelInfo(d.level);
        return true;
      }
    }
    return false;
  }

  function allDoneExcept(n) {
    for (let i = 1; i <= 24; i++) if (i !== n && !st.doorsDone[i]) return false;
    return true;
  }

  function showLevelInfo(n) {
    // item sprites: 80/88 = drink-boxes, 89 = lollypop, 81-83 = keys (bonus),
    // 84-86 = cards that remove mystical stones, 87 = exit card
    const L = Assets.data.levels[n];
    const lines = ['Information about this level:', ''];
    if (L.items.some(i => i.kind === 3)) lines.push('- Find the EXIT-CARD');
    const reqSpr = new Set(L.items.filter(i => i.kind === 0).map(i => i.spr));
    if ([...reqSpr].some(s => s === 80 || s === 88)) lines.push('- Find all drink-boxes');
    if ([...reqSpr].some(s => s === 89 || (s >= 81 && s <= 83))) lines.push('- Find all Lollypops');
    if (L.items.some(i => i.kind === 2)) {
      lines.push('', 'Respect the mystical stones!');
    }
    lines.push('', 'Have a good time!', '', '> Press any key <');
    st.mode = 'info';
    st.infoLines = lines;
    Input.onAnyKey(() => { enterLevel(n); st.mode = 'play'; });
  }

  function onItem(it) {
    const sprite = it.spr;
    if (it.kind === 3) {                     // exit card
      st.card = true;
      Audio2.play('card');
      Renderer.burst(it.x + 8, it.y + 8, '#6aff8a', 20, 130);
    } else if (it.kind === 2) {              // removes a mystical stone
      const c = Math.floor(it.x / 16), r = Math.floor(it.y / 16);
      const i = r * 40 + c;
      if ((st.map[i] >> 6) === 1) st.map[i] -= 0x40;
      Audio2.play('wall');
      Renderer.burst(it.x + 8, it.y + 8, '#b09aff', 16, 110);
      st.score += 50;
    } else if (it.kind === 0) {              // required collectible
      st.needed = Math.max(0, st.needed - 1);
      st.score += 25;
      Audio2.play('pickup');
      Renderer.burst(it.x + 8, it.y + 8, '#ff9ad5', 12, 100);
    } else {                                 // bonus
      st.score += 75;
      Audio2.play('pickup');
      Renderer.burst(it.x + 8, it.y + 8, '#ffe27a', 12, 100);
    }
    updateHud();
  }

  function tickEnemies() {
    for (const e of st.enemies) {
      if (!e.alive) continue;
      // movement: patrol inside bounds
      if (e.dx) {
        e.px += (e.dx / 15) * e.dirx;
        if (e.px <= e.minx) { e.px = e.minx; e.dirx = 1; }
        if (e.px >= e.maxx) { e.px = e.maxx; e.dirx = -1; }
      }
      if (e.dy) {
        e.py += (e.dy / 15) * e.diry;
        if (e.py <= e.miny) { e.py = e.miny; e.diry = 1; }
        if (e.py >= e.maxy) { e.py = e.maxy; e.diry = -1; }
      }
      // animation program: [duration, sprite] pairs, looped
      if (e.prog.length) {
        e.progT++;
        if (e.progT >= e.prog[e.progIdx][0]) {
          e.progT = 0;
          e.progIdx = (e.progIdx + 1) % e.prog.length;
          e.sprite = e.prog[e.progIdx][1];
        }
      }
    }
  }

  function updateCamera(dt) {
    const target = {
      x: clamp(st.wx + 12 - Renderer.VW / 2, 0, 640 - Renderer.VW),
      y: clamp(st.wy + 8 - Renderer.VH / 2, 0, 384 - Renderer.VH),
    };
    const k = 1 - Math.pow(0.0025, dt);
    st.cam.x += (target.x - st.cam.x) * k;
    st.cam.y += (target.y - st.cam.y) * k;
  }

  function die() {
    if (st.mode !== 'play') return;
    st.mode = 'dying';
    st.fadeT = 0;
    st.lives--;
    Audio2.play('die');
    Renderer.burst(st.wx + 12, st.wy + 8, '#ff6a5a', 26, 150);
    updateHud();
  }

  function completeLevel() {
    st.mode = 'complete';
    st.fadeT = 0;
    st.doorsDone[st.levelNo] = true;
    st.score += 500;
    saveProgress();
    Audio2.play('win');
    Audio2.stopMusic();
  }

  // ------------------------------------------------------------------ HUD
  function updateHud() {
    const lvl = document.getElementById('hud-level');
    const items = document.getElementById('hud-items');
    const card = document.getElementById('hud-card');
    const lives = document.getElementById('hud-lives');
    if (st.mode === 'boot' || st.mode === 'title' || st.mode === 'menu') {
      lvl.textContent = ''; items.textContent = '';
      card.textContent = ''; lives.textContent = '';
      return;
    }
    lvl.textContent = st.levelNo === 0
      ? `Galactic Train — ${Object.keys(st.doorsDone).length}/24`
      : `Level ${st.levelNo}`;
    if (st.levelNo !== 0 && (st.needed > 0 || st.level.need > 0)) {
      const drinks = st.level.items.some(i => i.kind === 0 && (i.spr === 80 || i.spr === 88));
      items.textContent = `${drinks ? '🥤' : '🍭'} ${st.needed}`;
    } else {
      items.textContent = '';
    }
    card.textContent = st.levelNo !== 0 && st.cardNeeded
      ? (st.card ? '💳 ✓' : '💳 ?') : '';
    lives.textContent = '❤'.repeat(Math.max(0, st.lives));
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  return { st, enterLevel, updatePlay, showLevelInfo, resolveSprite,
           saveProgress, loadProgress, updateHud, die,
           clamp };
})();
