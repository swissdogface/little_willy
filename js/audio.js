/* Little Willy — WebAudio sound engine.
 * All sounds and music are synthesized (original compositions),
 * replacing the PC-speaker audio of the DOS version. */
'use strict';

const Audio2 = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let enabled = true;
  let musicTimer = null;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.30;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(master);
  }

  function resume() {
    init();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function toggle() {
    enabled = !enabled;
    if (master) master.gain.value = enabled ? 0.6 : 0;
    return enabled;
  }

  // ---- tiny synth helpers -------------------------------------------------
  function env(g, t, a, d, s, r, peak = 1, sus = 0.4) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus * peak, 0.0001), t + a + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + s + r);
  }

  function tone(type, f0, f1, dur, vol, dest, t0, bendCurve) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    const t = t0 !== undefined ? t0 : ctx.currentTime;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== null && f1 !== f0) {
      if (bendCurve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
    }
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, fLow, fHigh, t0) {
    const t = t0 !== undefined ? t0 : ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime((fLow + fHigh) / 2, t);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(sfxGain);
    src.start(t);
  }

  // ---- game SFX -----------------------------------------------------------
  const sfx = {
    jump()    { tone('square', 220, 520, 0.18, 0.20, sfxGain, undefined, 'exp'); },
    shoot()   { tone('sawtooth', 900, 120, 0.12, 0.18, sfxGain, undefined, 'exp');
                noise(0.06, 0.10, 2000, 6000); },
    pickup()  { const t = ctx.currentTime;
                tone('square', 880, null, 0.07, 0.16, sfxGain, t);
                tone('square', 1320, null, 0.09, 0.16, sfxGain, t + 0.06);
                tone('sine', 1760, null, 0.12, 0.12, sfxGain, t + 0.12); },
    card()    { const t = ctx.currentTime;
                [523, 659, 784, 1047].forEach((f, i) =>
                  tone('triangle', f, null, 0.16, 0.22, sfxGain, t + i * 0.09)); },
    die()     { const t = ctx.currentTime;
                tone('sawtooth', 400, 40, 0.7, 0.25, sfxGain, t, 'exp');
                noise(0.4, 0.18, 100, 700, t + 0.05); },
    hitEnemy(){ noise(0.15, 0.25, 300, 1500);
                tone('square', 300, 60, 0.18, 0.2, sfxGain, undefined, 'exp'); },
    door()    { const t = ctx.currentTime;
                tone('triangle', 200, 400, 0.2, 0.2, sfxGain, t);
                tone('triangle', 300, 600, 0.25, 0.2, sfxGain, t + 0.12); },
    win()     { const t = ctx.currentTime;
                [523, 659, 784, 659, 784, 1047].forEach((f, i) =>
                  tone('square', f, null, 0.14, 0.2, sfxGain, t + i * 0.11)); },
    wall()    { noise(0.2, 0.3, 150, 500);
                tone('sine', 150, 60, 0.25, 0.3); },
    step()    { noise(0.03, 0.05, 800, 2000); },
    denied()  { tone('square', 200, 150, 0.15, 0.18); },
  };

  function play(name) {
    if (!ctx || !enabled) return;
    if (sfx[name]) sfx[name]();
  }

  // ---- music: small pattern sequencer ------------------------------------
  // Original composition: a light space-waltz loop for the hub,
  // and a sprightlier tune for the levels.
  const N = (s) => {
    // note name to frequency, e.g. 'C4', 'D#3'
    if (s === '-') return 0;
    const m = /^([A-G])(#?)(\d)$/.exec(s);
    const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const v = semis[m[1]] + (m[2] ? 1 : 0) + (parseInt(m[3], 10) + 1) * 12;
    return 440 * Math.pow(2, (v - 69) / 12);
  };

  const hubSong = {
    bpm: 92,
    steps: 0.5, // beats per step
    lead: ('E4 - G4 - B4 - G4 - A4 - F4 - A4 - C5 - B4 - G4 - E4 - G4 - ' +
           'F4 - A4 - C5 - A4 - B4 - G4 - B4 - D5 - C5 - - - B4 - G4 -').split(' '),
    bass: ('E2 - - - E2 - - - F2 - - - F2 - - - G2 - - - G2 - - - C2 - - - G2 - - -').split(' '),
  };

  const levelSong = {
    bpm: 120,
    steps: 0.5,
    lead: ('C4 E4 G4 E4 A4 - G4 - F4 A4 C5 A4 G4 - E4 - ' +
           'D4 F4 A4 F4 B4 - A4 - C5 - B4 G4 C5 - - -').split(' '),
    bass: ('C3 - C3 - F2 - F2 - F2 - F2 - C3 - C3 - ' +
           'D3 - D3 - G2 - G2 - C3 - G2 - C3 - - -').split(' '),
  };

  let curSong = null;

  function playSong(song) {
    stopMusic();
    if (!ctx) return;
    curSong = song;
    let step = 0;
    const stepDur = 60 / song.bpm * song.steps;
    const n = Math.max(song.lead.length, song.bass.length);
    musicTimer = setInterval(() => {
      if (!enabled) { step = (step + 1) % n; return; }
      const t = ctx.currentTime;
      const ln = song.lead[step % song.lead.length];
      const bn = song.bass[step % song.bass.length];
      if (ln !== '-') {
        tone('square', N(ln), null, stepDur * 0.9, 0.06, musicGain, t);
        tone('triangle', N(ln) * 2, null, stepDur * 0.5, 0.02, musicGain, t);
      }
      if (bn !== '-') tone('triangle', N(bn), null, stepDur * 1.7, 0.10, musicGain, t);
      step = (step + 1) % n;
    }, stepDur * 1000);
  }

  function music(kind) {
    if (!ctx) return;
    if (kind === 'hub') playSong(hubSong);
    else if (kind === 'level') playSong(levelSong);
    else stopMusic();
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    curSong = null;
  }

  return { resume, play, music, stopMusic, toggle,
           get enabled() { return enabled; } };
})();
