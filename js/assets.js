/* Asset loading: gamedata.json + native-resolution sprite/tile atlases + screens. */
'use strict';

const Assets = (() => {
  let data = null;
  const images = {};

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('cannot load ' + src));
      img.src = src;
    });
  }

  async function load(progress) {
    const resp = await fetch('assets/gamedata.json');
    data = await resp.json();

    const files = new Set();
    for (const key of Object.keys(data.atlas)) files.add(data.atlas[key].file);
    files.add('level1_bg.png');
    ['title', 'dim', 'end', 'story2', 'story6', 'story11', 'story13', 'text0', 'text1']
      .forEach(s => files.add('screens/' + s + '.png'));

    let done = 0;
    const list = [...files];
    await Promise.all(list.map(async f => {
      images[f] = await loadImage('assets/' + f);
      done++;
      if (progress) progress(done / list.length);
    }));
    return data;
  }

  function img(file) { return images[file]; }

  /** frame of sprite `index` inside atlas `key`: {img,x,y,w,h} */
  function sprFrame(key, index) {
    const a = data.atlas[key];
    if (!a || index < 0 || index >= a.frames.length) return null;
    const f = a.frames[index];
    return { img: images[a.file], x: f[0], y: f[1], w: f[2], h: f[3] };
  }

  function tileFrame(bstKey, index) {
    const a = data.atlas['bst_' + bstKey];
    if (!a || index >= a.frames.length) return null;
    const f = a.frames[index];
    return { img: images[a.file], x: f[0], y: f[1], w: f[2], h: f[3] };
  }

  /** resolve a level sprite slot (0..30 Willy, 31+ level set, 80+ SPEZ) */
  function resolveSlot(level, slot) {
    if (slot >= 80) return ['spez', slot - 80];
    if (slot >= 31) {
      for (const [a, b, key] of level.ranges) {
        if (slot >= a && slot <= b) return [key, slot - a];
      }
      return [null, 0];
    }
    return ['willy', slot];
  }

  return { load, img, sprFrame, tileFrame, resolveSlot,
           get data() { return data; } };
})();
