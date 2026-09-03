/* Little Willy — WebAudio sound engine.
 * Sound effects are the original PC-speaker sequences from LW5.EXE
 * ((frequency, frames) pairs at the 35 Hz game rate), played as a soft
 * square wave.  The music is a small synthesized pattern sequencer. */
'use strict';

const Audio2 = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let sfxEnabled = true;
  let musicEnabled = true;
  let musicTimer = null;
  let curSfx = null;         // currently playing effect nodes (PC speaker is monophonic)
  const FRAME = 1 / 35;

  try {
    const saved = JSON.parse(localStorage.getItem('lw_audio') || 'null');
    if (saved) { sfxEnabled = saved.sfx !== false; musicEnabled = saved.music !== false; }
  } catch (e) { /* ignore */ }

  function save() {
    try { localStorage.setItem('lw_audio', JSON.stringify({ sfx: sfxEnabled, music: musicEnabled })); }
    catch (e) { /* ignore */ }
  }

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = musicEnabled ? 0.28 : 0;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxEnabled ? 1 : 0;
    // soften the square wave a little
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5000;
    sfxGain.connect(lp).connect(master);
  }

  function resume() {
    const first = !ctx;
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (first && ctx && curSongName) {      // music requested before the context existed
      const k = curSongName;
      curSongName = null;
      music(k);
    }
  }

  function toggleSfx() {
    sfxEnabled = !sfxEnabled;
    if (sfxGain) sfxGain.gain.value = sfxEnabled ? 1 : 0;
    save();
    return sfxEnabled;
  }

  function toggleMusic() {
    musicEnabled = !musicEnabled;
    if (musicGain) musicGain.gain.value = musicEnabled ? 0.28 : 0;
    save();
    return musicEnabled;
  }

  // ---- PC speaker style sequences ---------------------------------------
  let seqs = {};
  function setSequences(s) { seqs = s; }

  function stopSfx() {
    if (curSfx) {
      try { curSfx.osc.stop(); } catch (e) { /* already stopped */ }
      curSfx = null;
    }
  }

  function playSeq(seq, vol = 0.09) {
    if (!ctx || !sfxEnabled) return;
    stopSfx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    let t = ctx.currentTime + 0.005;
    const t0 = t;
    g.gain.setValueAtTime(0, t);
    for (const [f, d] of seq) {
      const dur = d * FRAME;
      if (f > 1) {
        osc.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(vol, t);
      } else {
        g.gain.setValueAtTime(0, t);
      }
      t += dur;
    }
    g.gain.setValueAtTime(0, t);
    osc.connect(g).connect(sfxGain);
    osc.start(t0);
    osc.stop(t + 0.02);
    curSfx = { osc };
  }

  /** the original's sweep jingles (level complete / death) */
  function sweep(up, vol = 0.07) {
    if (!ctx || !sfxEnabled) return;
    stopSfx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    const t0 = ctx.currentTime + 0.005;
    const len = up ? 1.1 : 1.3;
    osc.frequency.setValueAtTime(up ? 120 : 2600, t0);
    osc.frequency.exponentialRampToValueAtTime(up ? 2600 : 60, t0 + len);
    g.gain.setValueAtTime(vol, t0);
    g.gain.setValueAtTime(vol, t0 + len - 0.05);
    g.gain.linearRampToValueAtTime(0, t0 + len);
    osc.connect(g).connect(sfxGain);
    osc.start(t0);
    osc.stop(t0 + len + 0.02);
    curSfx = { osc };
  }

  function play(name) {
    if (!ctx || !sfxEnabled) return;
    switch (name) {
      case 'complete': return sweep(true);
      case 'death':    return sweep(false);
      case 'door':     return playSeq(seqs.fall || []);
      case 'start':    return playSeq(seqs.rise || [], 0.05);
      case 'denied':   return playSeq([[100, 3], [1, 2], [100, 3]]);
      default:
        if (seqs[name]) playSeq(seqs[name]);
    }
  }

  // ---- music: small pattern sequencer ------------------------------------
  const N = (s) => {
    if (s === '-') return 0;
    const m = /^([A-G])(#?)(\d)$/.exec(s);
    const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const v = semis[m[1]] + (m[2] ? 1 : 0) + (parseInt(m[3], 10) + 1) * 12;
    return 440 * Math.pow(2, (v - 69) / 12);
  };

  const hubSong = {
    bpm: 96, steps: 0.5,
    lead: ('E4 - G4 - B4 - G4 - A4 - F4 - A4 - C5 - B4 - G4 - E4 - G4 - ' +
           'F4 - A4 - C5 - A4 - B4 - G4 - B4 - D5 - C5 - - - B4 - G4 -').split(' '),
    bass: ('E2 - - - E2 - - - F2 - - - F2 - - - G2 - - - G2 - - - C2 - - - G2 - - -').split(' '),
  };

  const levelSong = {
    bpm: 124, steps: 0.5,
    lead: ('C4 E4 G4 E4 A4 - G4 - F4 A4 C5 A4 G4 - E4 - ' +
           'D4 F4 A4 F4 B4 - A4 - C5 - B4 G4 C5 - - -').split(' '),
    bass: ('C3 - C3 - F2 - F2 - F2 - F2 - C3 - C3 - ' +
           'D3 - D3 - G2 - G2 - C3 - G2 - C3 - - -').split(' '),
  };

  function tone(type, f, dur, vol, t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(musicGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  let curSongName = null;

  function playSong(song) {
    stopMusic();
    if (!ctx) return;
    let step = 0;
    const stepDur = 60 / song.bpm * song.steps;
    const n = Math.max(song.lead.length, song.bass.length);
    musicTimer = setInterval(() => {
      if (!musicEnabled) { step = (step + 1) % n; return; }
      const t = ctx.currentTime;
      const ln = song.lead[step % song.lead.length];
      const bn = song.bass[step % song.bass.length];
      if (ln !== '-') {
        tone('square', N(ln), stepDur * 0.9, 0.05, t);
        tone('triangle', N(ln) * 2, stepDur * 0.5, 0.02, t);
      }
      if (bn !== '-') tone('triangle', N(bn), stepDur * 1.7, 0.09, t);
      step = (step + 1) % n;
    }, stepDur * 1000);
  }

  function music(kind) {
    if (kind === curSongName) return;
    curSongName = kind;
    if (!ctx) return;
    if (kind === 'hub') playSong(hubSong);
    else if (kind === 'level') playSong(levelSong);
    else stopMusic();
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    curSongName = null;
  }

  return { resume, play, music, stopMusic, toggleSfx, toggleMusic, setSequences,
           get sfxEnabled() { return sfxEnabled; },
           get musicEnabled() { return musicEnabled; } };
})();
