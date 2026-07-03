/* Asset loading: gamedata.json + sprite/tile atlases + screens. */
'use strict';

const Assets = (() => {
  let data = null;
  const images = {};

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  }

  async function load(progress) {
    const resp = await fetch('assets/gamedata.json');
    data = await resp.json();

    const files = new Set();
    for (const key of Object.keys(data.atlas)) files.add(data.atlas[key].file);
    files.add('level1_bg.png');
    ['title', 'dim', 'end', 'story2', 'story6', 'story11', 'story13']
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

  /** atlas frame for sprite slot within a given SPR atlas key */
  function sprFrame(key, index) {
    const a = data.atlas[key];
    if (!a || index < 0 || index >= a.frames.length) return null;
    return { img: images[a.file], f: a.frames[index], logical: a.logical[index] };
  }

  function tileFrame(bstKey, index) {
    const a = data.atlas['bst_' + bstKey];
    if (!a || index >= a.frames.length) return null;
    return { img: images[a.file], f: a.frames[index] };
  }

  return { load, img, sprFrame, tileFrame,
           get data() { return data; } };
})();
