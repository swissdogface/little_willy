/* Little Willy — game simulation.
 *
 * A faithful re-implementation of the movement, collision, enemy, item and
 * shot logic of LW5.EXE (reverse-engineered).  The original runs at one
 * video page flip per ~28.6 ms (a 25 ms BIOS timer synchronised to the
 * 70 Hz retrace), i.e. 35 logic frames per second, and works entirely in
 * integer pixels on a 640x384 world of 16x16 tiles.  Every constant below
 * (2 px per frame walking, the 37-phase jump table, 6/4/2 px falling, the
 * probe points, the enemy behaviours, ...) comes from the executable. */
'use strict';

const Game = (() => {
  const TICK_HZ = 35;
  const TICK = 1 / TICK_HZ;
  const WORLD_W = 640, WORLD_H = 384;
  const VW = 320, VH = 200;

  // map attributes
  const A_FREE = 0, A_SOLID = 1, A_PLATFORM = 2, A_DEADLY = 3;

  let JT = null;          // jump table (18 rising phases)
  let WF = null;          // Willy frame -> sprite table

  const st = {
    mode: 'boot',         // boot,title,menu,story,info,play,complete,end,message
    levelNo: 0,
    level: null,
    map: null,
    items: [],
    enemies: [],
    deco: [],
    doorsDone: {},
    hubReturn: null,      // {x,y,cx,cy} position in the hub after leaving a level
    tick: 0,              // page flips
    iter: 0,              // main loop iterations (2 flips)
    time: 0,
    cam: { x: 0, y: 0, px: 0, py: 0 },
    w: null,              // Willy
    shot: null,
    expl: null,
    energy: 4, inv: 0,
    god: false,           // cheat: immune to enemies and deadly tiles
    needed: 0, card: false,
    keys: { 81: false, 82: false, 83: false },
    result: null,         // 'complete' | 'dead' | {door:n} set by the simulation
    lastDoor: -1,
    stats: { shots: 0, kills: 0 },
  };

  // ------------------------------------------------------------- helpers
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function attr(r, c) {
    if (c < 0 || c > 39 || r < 0 || r > 23) return A_SOLID;
    return st.map[r * 40 + c] >> 6;
  }
  function solid(r, c) { return attr(r, c) === A_SOLID; }

  function saveProgress() {
    try {
      localStorage.setItem('lw_progress',
        JSON.stringify({ doors: st.doorsDone, god: st.god }));
    } catch (e) { /* private mode */ }
  }

  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem('lw_progress') || 'null');
      if (p) {
        if (p.doors) st.doorsDone = p.doors;
        st.god = !!p.god;
      }
    } catch (e) { /* ignore */ }
  }

  /** cheat mode on/off; returns the new state */
  function toggleGod() {
    st.god = !st.god;
    if (st.god) { st.energy = 4; st.inv = 0; }
    saveProgress();
    return st.god;
  }

  function doorsDoneCount() {
    let n = 0;
    for (let i = 1; i <= 24; i++) if (st.doorsDone[i]) n++;
    return n;
  }

  function allDoneExcept(n) {
    for (let i = 1; i <= 24; i++) if (i !== n && !st.doorsDone[i]) return false;
    return true;
  }

  function spriteSize(slot) {
    const [key, idx] = Assets.resolveSlot(st.level, slot);
    const fr = key ? Assets.sprFrame(key, idx) : null;
    return fr ? [fr.w, fr.h] : [24, 16];
  }

  // -------------------------------------------------------------- level
  function init(data) {
    JT = data.jumpTable;
    WF = data.willyFrames;
  }

  function enterLevel(n) {
    const L = Assets.data.levels[n];
    st.levelNo = n;
    st.level = L;
    st.map = L.map.slice();
    st.tick = 0; st.iter = 0;
    st.result = null;

    // items: cards (kind 2) sit inside a solid blank "mystical stone"
    st.items = L.items.map(it => ({ ...it, state: 1 }));
    for (const it of st.items) {
      if (it.kind === 2) st.map[(it.y >> 4) * 40 + (it.x >> 4)] = 0x40;
    }
    st.keys = { 81: false, 82: false, 83: false };
    st.deco = L.deco;

    st.enemies = L.enemies.map(e => {
      const [w, h] = spriteSize(e.prog[1] !== undefined ? e.prog[1] : 31);
      return {
        x: e.x, y: e.y, vx: e.x, vy: e.y, vpx: e.x, vpy: e.y, dx: 0, dy: 0,
        speed: e.speed, minx: e.minx, maxx: e.maxx, miny: e.miny, maxy: e.maxy,
        dir: e.dir, kind: e.kind, hp: e.hp, hits: e.hp, reset: e.reset,
        prog: e.prog, animIdx: 0, animT: 0, phase: 0, bdir: 0, rdir: 0,
        cool: 0, dead: false, active: false, w, h,
        sprite: e.prog[1] !== undefined ? e.prog[1] : 31,
      };
    });

    st.w = {
      x: L.wx, y: L.wy, px: L.wx, py: L.wy,
      frame: L.face,                // 0 = facing left, 12 = facing right
      hst: 2, lst: 2,               // right / left state machines
      vst: 2,                       // vertical: 0 reset,1 start fall,2 idle,3 falling
      jst: 2, jphase: 0, jy0: 0,    // jump: 0 reset,1 start,2 idle,3 jumping
      held: false,                  // jump key held (auto-rejump)
      slowR: false, slowL: false,   // half-step toggles near walls
      ride: 2, rideIdx: -1,         // 2 normal, 1 just landed on platform, 3 riding, 0 leaving
      alive: 2,                     // 2 alive, 1 just died, 3 dying, 0 done
      deathFrame: 0, deathX: 0,
      frozenX: 0,
    };
    st.shot = { state: 2, dir: 1, x: 0, y: 0, age: 0, spr: 27, anim: 0 };
    st.expl = { state: 2, x: 0, y: 0, frame: 22 };
    st.energy = 4; st.inv = 0;
    st.card = false;
    st.needed = L.need;
    st.stats = { shots: 0, kills: 0 };

    st.cam.x = clamp(L.scx, 0, WORLD_W - VW);
    st.cam.y = clamp(L.scy, 0, WORLD_H - VH);
    if (n === 0 && st.hubReturn) {
      st.w.x = st.w.px = st.hubReturn.x;
      st.w.y = st.w.py = st.hubReturn.y;
      st.cam.x = st.hubReturn.cx;
      st.cam.y = st.hubReturn.cy;
    }
    fixCamera();
    st.cam.px = st.cam.x; st.cam.py = st.cam.y;
    Renderer.initBackdrop(n + 7);
    Renderer.clearParticles();
    Audio2.music(n === 0 ? 'hub' : 'level');
  }

  // -------------------------------------------------------------- input
  function applyInput() {
    const w = st.w;
    for (const ev of Input.take()) {
      if (ev.down && w.alive !== 2) continue;
      switch (ev.k) {
        case 'right':
          if (ev.down) { if (w.hst === 2) w.hst = 1; } else w.hst = 0;
          break;
        case 'left':
          if (ev.down) { if (w.lst === 2) w.lst = 1; } else w.lst = 0;
          break;
        case 'jump':
          if (ev.down) { w.held = true; if (w.jst === 2) w.jst = 1; }
          else w.held = false;
          break;
        case 'shot':
          if (ev.down && st.shot.state === 2) st.shot.state = 1;
          break;
      }
    }
  }

  // -------------------------------------------------------------- Willy
  function willyStep() {
    const w = st.w;
    let ty0 = w.y >> 4, ty1 = (w.y + 15) >> 4, ty2 = (w.y + 16) >> 4;

    // --- horizontal, right
    if (w.hst === 3) {
      const cf = (w.x + 14) >> 4, cs = (w.x + 12) >> 4;
      if (!solid(ty0, cf) && !solid(ty1, cf) && !w.slowR) {
        w.x += 2;
        w.frame++;
        if (w.frame > 23 || w.frame < 12) w.frame = 12;
      } else if (!solid(ty0, cs) && !solid(ty1, cs)) {
        w.x += 2;
        w.frame = 12;
        w.slowR = !w.slowR;
      }
    }
    if (w.hst === 1) {
      const c = (w.x + 12) >> 4;
      if (!solid(ty0, c) && !solid(ty1, c)) {
        w.hst = 3; w.x += 2; w.lst = 2;
      }
    }
    if (w.hst === 0) { w.hst = 2; w.frame = 12; }

    // --- horizontal, left
    if (w.lst === 3) {
      const cf = (w.x - 4) >> 4, cs = (w.x - 2) >> 4;
      if (!solid(ty0, cf) && !solid(ty1, cf) && !w.slowL) {
        w.x -= 2;
        w.frame = (w.frame + 1) % 12;
      } else if (!solid(ty0, cs) && !solid(ty1, cs)) {
        w.x -= 2;
        w.frame = 0;
        w.slowL = !w.slowL;
      }
    }
    if (w.lst === 1) {
      const c = (w.x - 2) >> 4;
      if (!solid(ty0, c) && !solid(ty1, c)) {
        w.x -= 2; w.lst = 3;
        if (w.hst === 3) w.hst = 2;
      }
    }
    if (w.lst === 0) { w.lst = 2; w.frame = 0; }

    const tx0 = w.x >> 4, tx1 = (w.x + 15) >> 4, fx = w.x & 15;
    // "ground" test used by the original: tile under the left foot must be
    // free and (tile under the right foot free or Willy is in the left part
    // of his tile)
    const freeRow = (r) => attr(r, tx0) === A_FREE && (attr(r, tx1) === A_FREE || fx < 5);

    // --- vertical (falling)
    if (w.vst === 0) w.vst = 2;
    if (w.vst === 2 && w.ride === 2) {
      if (freeRow(ty2) && w.jst !== 3) w.vst = 1;
    }
    if (w.vst === 3) {
      if (freeRow((w.y + 21) >> 4)) w.y += 6;
      else if (freeRow((w.y + 19) >> 4)) w.y += 4;
      else if (freeRow((w.y + 17) >> 4)) w.y += 2;
      else { w.vst = 0; w.y = (w.y >> 4) << 4; }
    }
    if (w.vst === 1) { w.y += 2; w.vst = 3; }

    // --- jump
    if (w.jst === 3) {
      if (w.jphase < 18) {
        w.y = w.jy0 - JT[w.jphase];
        ty0 = w.y >> 4;
        const bump = solid(ty0, tx0) || (solid(ty0, tx1) && fx > 5) || w.y < 16;
        if (bump) {
          w.jphase = 35 - w.jphase;
          w.y = ((w.y >> 4) << 4) + 16;
        }
      } else {
        const i = 35 - w.jphase;
        w.y = w.jy0 - (i >= 0 ? JT[i] : 0);
        ty1 = (w.y + 15) >> 4;
        const land = attr(ty1, tx0) !== A_FREE || (attr(ty1, tx1) !== A_FREE && fx > 5);
        if (land) {
          w.jphase = 36;
          w.y = (w.y >> 4) << 4;
        }
      }
      w.jphase++;
    }
    if (w.jst === 1) {
      const r = ty0 - 1;
      if (w.vst !== 3 && w.alive === 2 &&
          !solid(r, tx0) && !(solid(r, tx1) && fx >= 5)) {
        w.jst = 3; w.jy0 = w.y; w.jphase = 0;
      } else {
        w.jst = 2; w.held = false;
      }
    }
    if (w.jst === 0) w.jst = 2;
    if (w.jphase === 37) {
      w.jst = 0; w.jphase = 0;
      if (attr((w.y + 18) >> 4, tx0) === A_FREE && fx < 5) { w.y += 2; w.vst = 3; }
    }
    if (w.jst === 2 && w.held && w.vst === 2 && w.alive === 2) w.jst = 1;

    // --- animation frames while airborne
    if ((w.jst === 3 || w.vst === 3) && w.hst === 3) w.frame = 25;
    if ((w.jst === 3 || w.vst === 3) && w.lst === 3) w.frame = 24;
    if (w.jst === 3 && w.hst === 2 && w.lst === 2 && w.frame < 24) {
      w.frame = w.frame < 12 ? 24 : 25;
    }

    // --- shot / explosion state machines
    const sh = st.shot, ex = st.expl;
    if (sh.state === 0) sh.state = 2;
    if (ex.state === 0) { ex.state = 2; ex.x = 0; }
    if (ex.state === 3 && ex.frame === 26) ex.state = 0;
    if (ex.state === 1) {
      Audio2.play('explosion');
      ex.state = 3; ex.frame = 22; ex.t = 0;
      ex.y = sh.y - 5;
      if (ex.x === 0) ex.x = sh.dir === 1 ? sh.x + 6 : sh.x - 4;
      Renderer.burst(ex.x + 8, ex.y + 8, ['#ffd257', '#ff7b3a', '#fff2a0'], 10, 60);
    }
    if (sh.state === 3) {
      if (sh.x < st.cam.x || sh.x > st.cam.x + VW) sh.state = 0;   // left the screen
      if (sh.dir === 0) {
        if (solid(sh.y >> 4, (sh.x - 4) >> 4)) { sh.state = 0; ex.state = 1; }
        else { sh.age++; sh.x -= sh.age > 8 ? 6 : 4; }
      } else {
        if (solid(sh.y >> 4, (sh.x + 16) >> 4)) { sh.state = 0; ex.state = 1; }
        else { sh.age++; sh.x += sh.age > 8 ? 6 : 4; }
      }
      if (sh.x < 4 || sh.x > 619) { sh.state = 0; ex.state = 1; }
    }
    if (sh.state === 1 && w.alive === 2 && ex.state === 2) {
      const facingLeft = w.frame < 12 || w.frame === 24 || w.frame === 32;
      if (facingLeft) {
        if (solid((w.y + 8) >> 4, (w.x - 8) >> 4)) sh.state = 2;
        else {
          sh.dir = 0; sh.spr = 29; w.frame = 32;
          sh.x = w.x - 14; sh.y = w.y + 4; sh.state = 3; sh.age = 0;
          st.stats.shots++;
          Audio2.play('shoot');
        }
      } else {
        if (solid((w.y + 8) >> 4, (w.x + 22) >> 4)) sh.state = 2;
        else {
          sh.dir = 1; sh.spr = 27; w.frame = 31;
          sh.x = w.x + 12; sh.y = w.y + 4; sh.state = 3; sh.age = 0;
          st.stats.shots++;
          Audio2.play('shoot');
        }
      }
    }

    // --- riding on a platform enemy
    if (w.ride === 0) w.ride = 2;
    if (w.ride === 3 && w.jst === 3) w.ride = 0;
    if (w.ride === 3 && (w.hst === 3 || w.lst === 3)) {
      const e = st.enemies[w.rideIdx];
      if (!e || Math.abs(w.x - e.x) > 10) w.ride = 0;
    }
    if (w.ride === 3 || w.ride === 1) {
      const e = st.enemies[w.rideIdx];
      if (e) {
        w.y = e.y - 16;
        if (e.dir === 0 || e.dir === 1 || e.dir === 7) w.x += e.dx / 2;
        if (w.ride === 1) {
          w.ride = 3; w.vst = 2; w.jst = 2; w.hst = 2; w.lst = 2;
        }
      } else {
        w.ride = 2;
      }
    }

    // --- world bounds
    if (w.x < 2) { w.x = 2; w.lst = 2; }
    if (w.x > 622) { w.x = 622; w.hst = 2; }
    if (w.y > WORLD_H - 16) w.y = WORLD_H - 16;

    // --- frame fixes when standing still
    if (w.lst === 2 && w.hst === 2) {
      if (w.frame < 12 && w.jst !== 3) w.frame = 0;
      if (w.frame > 12 && w.frame < 23) w.frame = 12;
      if (w.frame > 23 && w.jst !== 3) {
        if (w.frame === 24) w.frame = 0;
        if (w.frame === 25) w.frame = 12;
      }
    }

    // --- death animation (frames 26..30) overrides everything
    if (w.alive === 1) {
      w.deathFrame = 26; w.deathX = w.x; w.alive = 3; w.frame = 26;
    }
    if (w.alive === 3) {
      w.x = w.deathX;
      if (st.tick % 4 === 0) w.deathFrame++;
      w.frame = Math.min(w.deathFrame, 30);
      if (w.deathFrame >= 40) w.alive = 0;
    }

    // --- shot sprite animation
    if (sh.state === 3 && st.tick % 3 === 0) {
      sh.spr++;
      if (sh.spr === 29 && sh.dir === 1) sh.spr = 27;
      if (sh.spr === 31) sh.spr = 29;
    }
    if (ex.state === 3) {
      ex.t++;
      if (ex.t % 4 === 0) ex.frame++;
    }
  }

  // ------------------------------------------------------------- camera
  function fixCamera() {
    const w = st.w;
    if (w.y < st.cam.y + 80) st.cam.y = w.y - 80;
    if (w.y > st.cam.y + 120) st.cam.y = w.y - 120;
    st.cam.y = clamp(st.cam.y, 0, WORLD_H - VH);
    if (w.x < st.cam.x + 80) st.cam.x = w.x - 80;
    if (w.x > st.cam.x + 240) st.cam.x = w.x - 240;
    st.cam.x = clamp(st.cam.x, 0, WORLD_W - VW);
  }

  // -------------------------------------------------------------- items
  function itemsStep() {
    const w = st.w;
    for (const it of st.items) {
      if (it.state !== 1) continue;
      if (Math.abs(it.x - w.x) > 16 || Math.abs(it.y - w.y) > 16) continue;
      if (it.kind === 0) {
        it.state = 2;
        Audio2.play('pickup');
        if (it.spr === 80 || it.spr === 88 || it.spr === 89) st.needed--;
        Renderer.burst(it.x + 12, it.y + 8, ['#ff9ad5', '#ffffff'], 8, 50);
        continue;
      }
      switch (it.spr) {
        case 81: case 82: case 83:            // keys
          it.state = 2; st.keys[it.spr] = true;
          Audio2.play('pickup');
          Renderer.burst(it.x + 12, it.y + 8, ['#ffe27a', '#ffffff'], 8, 50);
          break;
        case 84: case 85: case 86:            // cards: need the matching key
          if (!st.keys[it.spr - 3]) break;
          it.state = 2;
          Audio2.play('card');
          st.map[(it.y >> 4) * 40 + (it.x >> 4)] -= 0x40;   // stone becomes passable
          Renderer.burst(it.x + 12, it.y + 8, ['#b09aff', '#ffffff', '#8cf'], 14, 70);
          break;
        case 87:                              // exit card
          it.state = 2; st.card = true;
          Audio2.play('pickup');
          Renderer.burst(it.x + 12, it.y + 8, ['#6aff8a', '#ffffff'], 12, 60);
          break;
        default:
          it.state = 2;
          Audio2.play('pickup');
      }
    }
  }

  // ------------------------------------------------------------ enemies
  function enemyActive(e) {
    return e.maxx + 16 > st.cam.x && e.minx < st.cam.x + 336 &&
           e.maxy + 16 > st.cam.y && e.miny < st.cam.y + 216;
  }

  function enemiesStep() {
    const w = st.w;
    for (const e of st.enemies) {
      e.vpx = e.vx; e.vpy = e.vy; e.dx = 0; e.dy = 0;
      if (e.dead) continue;
      e.active = enemyActive(e);
      if (!e.active) continue;

      // animation program: [duration, sprite] pairs
      const P = e.prog;
      if (e.animT === P[e.animIdx]) { e.animIdx += 2; e.animT = 0; }
      if (e.animIdx >= P.length || P[e.animIdx] === 0xfe) { e.animIdx = 0; e.animT = 0; }
      if (P[e.animIdx] === 0xff) { e.animIdx = e.reset; e.animT = 0; }
      if (e.animIdx + 1 < P.length && P[e.animIdx + 1] !== e.sprite) {
        e.sprite = P[e.animIdx + 1];
        [e.w, e.h] = spriteSize(e.sprite);
      }

      const sp = e.speed;
      const slow = sp >= 100;
      const step = slow ? 0 : 2 * sp;
      const slowStep = slow && (st.iter % (sp - 100) === 1) ? 1 : 0;
      const ox = e.x, oy = e.y;

      switch (e.dir) {
        case 0:   // right
          if (e.x + (slow ? 0 : sp) > e.maxx) {
            e.x = e.maxx; e.dir = 1;
            if (e.reset !== 0) { e.animIdx = 0; e.animT = 0; }
          } else e.x += slow ? slowStep : step;
          break;
        case 1:   // left
          if (e.x - (slow ? 0 : sp) < e.minx) {
            e.x = e.minx; e.dir = 0;
            if (e.reset !== 0) { e.animIdx = e.reset; e.animT = 0; }
          } else e.x -= slow ? slowStep : step;
          break;
        case 2:   // up
          if (e.y - sp < e.miny) { e.y = e.miny; e.dir = 3; }
          else e.y -= step;
          break;
        case 3:   // down
          if (e.y + sp > e.maxy) { e.y = e.maxy; e.dir = 2; }
          else e.y += step;
          break;
        case 4:   // parabolic arc between minx and minx + 70*speed
        case 5: { // vertical bounce
          if (e.dir === 4) {
            const k = e.bdir === 0 ? e.phase : 35 - e.phase;
            e.x = e.minx + k * sp * 2;
          }
          const i = e.phase < 18 ? e.phase : 35 - e.phase;
          e.y = e.maxy - (i >= 0 ? JT[i] : 0) * sp;
          e.phase = (e.phase + 1) % 37;
          if (e.phase === 0) e.bdir ^= 1;
          break;
        }
        case 6: { // random walker
          if (Math.floor(Math.random() * 20) === 1) e.rdir = Math.floor(Math.random() * 4);
          let dxp = 0, dyp = 0;
          const mv = (d) => {
            if (d === 0) e.x += step; else if (d === 1) e.y += step;
            else if (d === 2) e.x -= step; else e.y -= step;
          };
          mv(e.rdir);
          if (e.rdir === 0) { dxp = e.w + 2; if (e.x + dxp > e.maxx) e.rdir = 2; }
          else if (e.rdir === 1) { dyp = e.h + 2; if (e.y + dyp > e.maxy) e.rdir = 3; }
          else if (e.rdir === 2) { dxp = -2; if (e.x - 2 < e.minx) e.rdir = 0; }
          else { dyp = -2; if (e.y - 2 < e.miny) e.rdir = 1; }
          if (attr((e.y + dyp) >> 4, (e.x + dxp) >> 4) !== A_FREE) {
            const sx = e.x, sy = e.y;
            let tries = 0;
            do {
              tries++;
              e.rdir = (e.rdir + 1) % 4;
              e.x = sx; e.y = sy;
              mv(e.rdir);
            } while (solid(e.y >> 4, e.x >> 4) && tries < 6);
          }
          break;
        }
        case 7:   // homing
          if (e.x < w.x) e.x += sp;
          if (e.x > w.x) e.x -= sp;
          if (e.y < w.y) e.y += sp;
          if (e.y > w.y) e.y -= sp;
          break;
      }
      e.dx = e.x - ox; e.dy = e.y - oy;
      e.vx = e.x; e.vy = e.y;
      e.animT++;
      if (e.cool > 0) e.cool--;
    }
  }

  /** odd frames: the original's second video page shows the enemy half a
   *  step ahead (smooth motion for the linear movers) */
  function enemiesInterpolate() {
    for (const e of st.enemies) {
      e.vpx = e.vx; e.vpy = e.vy;
      if (!e.active || e.dead) continue;
      if (e.dir <= 3 || e.dir === 7) { e.vx = e.x + e.dx / 2; e.vy = e.y + e.dy / 2; }
    }
  }

  // ------------------------------------------------------- collisions
  function hurt() {
    if (st.god) return;
    if (st.inv === 0) { st.energy--; st.inv = 16; }
    Audio2.play('hurt');
    if (st.energy <= 0) die();
  }

  function die() {
    const w = st.w;
    if (w.alive !== 2 || st.god) return;
    st.inv = 0;
    w.alive = 1;
    if (w.hst !== 2) w.hst = 0;
    if (w.lst !== 2) w.lst = 0;
    Audio2.play('death');
    Renderer.burst(w.x + 8, w.y + 8, ['#ff6a5a', '#ffd257', '#ffffff'], 18, 90);
  }

  function collisionsStep() {
    const w = st.w;
    if (w.alive !== 2) return;
    for (const e of st.enemies) {
      if (!e.active || e.dead || e.kind !== 0) continue;
      const ew = e.w, eh = e.h;
      const ox = e.x < w.x ? (e.x + ew > w.x + 10)
                           : (e.x < w.x + 14 && e.x + ew > w.x + 16);
      if (!ox) continue;
      const oy = e.y < w.y ? (e.y + eh > w.y) : (e.y < w.y + 16 && e.y + eh > w.y);
      if (!oy) continue;
      hurt();
      if (w.alive !== 2) return;
    }
    if (st.inv > 0) st.inv--;
    // deadly tile under the feet
    if (!st.god && attr((w.y + 18) >> 4, (w.x + 8) >> 4) === A_DEADLY) {
      Audio2.play('hurt');
      die();
    }
  }

  function rideStep() {
    const w = st.w;
    if (w.ride !== 2 || w.alive !== 2) return;
    const descending = w.vst !== 2 || (w.jst === 3 && w.jphase > 18);
    st.enemies.forEach((e, i) => {
      if (!e.active || e.dead) return;
      if (e.kind === 1) {
        if (Math.abs(w.x - e.x) < 10 && Math.abs(w.y - e.y + 16) < 10 && descending) {
          w.ride = 1; w.rideIdx = i;
        }
      } else if (e.kind === 2) {
        if (Math.abs(w.x - e.x) < 10 && Math.abs(w.y - e.y + 60) < 5 &&
            (w.vst === 3 || (w.jst === 3 && w.jphase > 18))) {
          e.animIdx = e.reset; e.animT = 0;
        }
        if (Math.abs(w.x - e.x) < 10 && Math.abs(w.y - e.y + 16) < 20 &&
            (w.vst === 3 || (w.jst === 3 && w.jphase > 18))) {
          w.ride = 1; w.rideIdx = i;
          hurt();
        }
      }
    });
  }

  function shotVsEnemies() {
    const sh = st.shot;
    if (sh.state !== 3) return;
    for (const e of st.enemies) {
      if (!e.active || e.dead || e.kind !== 0) continue;
      const ox = e.x < sh.x ? (e.x + e.w > sh.x) : (e.x < sh.x + 16 && e.x + e.w > sh.x + 16);
      if (!ox) continue;
      const oy = e.y < sh.y ? (e.y + e.h > sh.y) : (e.y < sh.y + 7 && e.y + e.h > sh.y + 7);
      if (!oy) continue;
      if (e.cool === 0 && e.hp !== 0xff) {
        e.hits = (e.hits - 1) & 0xff;
        e.cool = 40;
      }
      Audio2.play('enemyhit');
      sh.state = 0;
      if (e.hits === 0 && e.hp !== 0xff) {
        e.cool = 1;
        st.expl.x = e.x + 2;
        st.expl.state = 1;
        e.dead = true;
        st.stats.kills++;
        Renderer.burst(e.x + e.w / 2, e.y + e.h / 2, ['#ffd257', '#ff7b3a', '#ffffff'], 16, 90);
      }
      break;
    }
  }

  // --------------------------------------------------------- exit/doors
  function exitCheck() {
    const w = st.w, L = st.level;
    if (st.levelNo === 0 || w.alive !== 2) return;
    const dx = (w.x + 4 - L.exx) & 0xffff, dy = (w.y - L.exy) & 0xffff;
    if (dx < 16 && dy < 32 && st.card && st.needed === 0) {
      st.result = 'complete';
    }
  }

  function doorCheck() {
    const w = st.w;
    if (st.levelNo !== 0 || w.alive !== 2) return;
    for (const d of st.level.doors) {
      if (st.doorsDone[d.level]) continue;
      const dy = (w.y - d.y) & 0xffff;
      if (Math.abs(w.x - 4 - d.x) < 18 && dy < 24) {
        let rx = d.x < w.x ? d.x + 22 : d.x - 18;
        if (rx > 624) rx = d.x + 22;
        st.hubReturn = { x: rx, y: d.y + 12, cx: st.cam.x, cy: st.cam.y };
        st.lastDoor = d.level;
        st.result = { door: d.level };
        return;
      }
    }
  }

  // ---------------------------------------------------------------- tick
  function tick() {
    const w = st.w;
    w.px = w.x; w.py = w.y;
    st.cam.px = st.cam.x; st.cam.py = st.cam.y;
    st.time += TICK;

    applyInput();
    willyStep();
    itemsStep();
    if (st.tick % 2 === 0) {
      collisionsStep();
      shotVsEnemies();
      rideStep();
      enemiesStep();
    } else {
      enemiesInterpolate();
      st.iter++;
    }
    fixCamera();
    exitCheck();
    doorCheck();
    if (w.alive === 0) st.result = 'dead';
    st.tick++;
  }

  return { st, TICK, TICK_HZ, VW, VH, WORLD_W, WORLD_H,
           init, enterLevel, tick, saveProgress, loadProgress, toggleGod,
           doorsDoneCount, allDoneExcept, clamp, WF: () => WF };
})();
