/* Keyboard + touch input. Original default keys are kept
 * (A jump, S shot, ',' left, '.' right) plus modern equivalents. */
'use strict';

const Input = (() => {
  const state = { left: false, right: false, jump: false, shot: false };
  const pressed = {};   // edge-triggered
  let anyKeyCb = null;

  const MAP = {
    'a': 'jump', 'A': 'jump', ' ': 'jump', 'ArrowUp': 'jump', 'w': 'jump', 'W': 'jump',
    's': 'shot', 'S': 'shot', 'Control': 'shot', 'x': 'shot', 'X': 'shot',
    ',': 'left', 'ArrowLeft': 'left',
    '.': 'right', 'ArrowRight': 'right',
  };

  function down(e) {
    Audio2.resume();
    if (anyKeyCb) { const cb = anyKeyCb; anyKeyCb = null; cb(); }
    const k = MAP[e.key];
    if (k) {
      if (!state[k]) pressed[k] = true;
      state[k] = true;
      e.preventDefault();
    }
    pressed[e.key] = true;
  }

  function up(e) {
    const k = MAP[e.key];
    if (k) { state[k] = false; e.preventDefault(); }
  }

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);

  // touch buttons
  document.querySelectorAll('#touch-controls button').forEach(b => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); Audio2.resume();
                        if (anyKeyCb) { const cb = anyKeyCb; anyKeyCb = null; cb(); }
                        if (!state[k]) pressed[k] = true; state[k] = true; };
    const off = (e) => { e.preventDefault(); state[k] = false; };
    b.addEventListener('touchstart', on, { passive: false });
    b.addEventListener('touchend', off, { passive: false });
    b.addEventListener('touchcancel', off, { passive: false });
    b.addEventListener('mousedown', on);
    b.addEventListener('mouseup', off);
  });

  // any-tap advances screens on mobile
  window.addEventListener('touchstart', () => {
    Audio2.resume();
    if (anyKeyCb) { const cb = anyKeyCb; anyKeyCb = null; cb(); }
  }, { passive: true });

  function consume(k) {
    const v = pressed[k];
    pressed[k] = false;
    return !!v;
  }

  function onAnyKey(cb) { anyKeyCb = cb; }

  return { state, consume, onAnyKey };
})();
