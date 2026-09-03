/* Keyboard / touch / gamepad input with true press-release edges.
 * Original default keys are kept (A jump, S shot, ',' left, '.' right),
 * plus arrows, Space, Ctrl/X and WASD. */
'use strict';

const Input = (() => {
  const state = { left: false, right: false, jump: false, shot: false };
  const events = [];          // {k, down} edges, consumed by the simulation
  let anyKeyCb = null;
  let lastKey = null;

  const MAP = {
    'a': 'jump', 'A': 'jump', ' ': 'jump', 'ArrowUp': 'jump', 'w': 'jump', 'W': 'jump',
    's': 'shot', 'S': 'shot', 'Control': 'shot', 'x': 'shot', 'X': 'shot', 'Alt': 'shot',
    ',': 'left', 'ArrowLeft': 'left', 'j': 'left', 'J': 'left',
    '.': 'right', 'ArrowRight': 'right', 'l': 'right', 'L': 'right',
  };

  function set(k, down) {
    if (state[k] === down) return;
    state[k] = down;
    events.push({ k, down });
  }

  function fireAnyKey() {
    if (anyKeyCb) { const cb = anyKeyCb; anyKeyCb = null; cb(); }
  }

  function down(e) {
    if (e.repeat) { if (MAP[e.key]) e.preventDefault(); return; }
    Audio2.resume();
    lastKey = e.key;
    fireAnyKey();
    const k = MAP[e.key];
    if (k) { set(k, true); e.preventDefault(); }
    if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
  }

  function up(e) {
    const k = MAP[e.key];
    if (k) { set(k, false); e.preventDefault(); }
  }

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => { for (const k in state) set(k, false); });

  // touch buttons
  document.querySelectorAll('#touch-controls button').forEach(b => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); Audio2.resume(); fireAnyKey(); set(k, true); b.classList.add('on'); };
    const off = (e) => { e.preventDefault(); set(k, false); b.classList.remove('on'); };
    b.addEventListener('touchstart', on, { passive: false });
    b.addEventListener('touchend', off, { passive: false });
    b.addEventListener('touchcancel', off, { passive: false });
    b.addEventListener('mousedown', on);
    b.addEventListener('mouseup', off);
    b.addEventListener('mouseleave', off);
  });

  // any tap advances screens on mobile
  document.getElementById('game').addEventListener('pointerdown', () => {
    Audio2.resume();
    lastKey = 'pointer';
    fireAnyKey();
  });

  // gamepad: poll once per frame
  const padPrev = {};
  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && (pads[0] || pads[1] || pads[2] || pads[3]);
    if (!p) return;
    const ax = p.axes[0] || 0;
    const btn = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const want = {
      left: ax < -0.5 || btn(14),
      right: ax > 0.5 || btn(15),
      jump: btn(0) || btn(3) || btn(12),
      shot: btn(1) || btn(2) || btn(5) || btn(7),
    };
    for (const k in want) {
      if (want[k] !== !!padPrev[k]) {
        padPrev[k] = want[k];
        set(k, want[k]);
        if (want[k]) { Audio2.resume(); lastKey = 'pad'; fireAnyKey(); }
      }
    }
  }

  /** take all queued edge events (simulation calls this once per tick) */
  function take() {
    const ev = events.splice(0, events.length);
    return ev;
  }

  function onAnyKey(cb) { anyKeyCb = cb; }
  function clearAnyKey() { anyKeyCb = null; }

  return { state, take, onAnyKey, clearAnyKey, pollGamepad,
           get lastKey() { return lastKey; } };
})();
