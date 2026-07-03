#!/usr/bin/env python3
"""Little Willy asset pipeline.

Decodes the original DOS data files (LEV/SPR/BST/DAT) into JSON + PNG
assets for the browser remake, including 4x pixel-art upscaling.

Formats (reverse-engineered from LW5.EXE):
  .BST  n tiles x 128 bytes: 16x16 px, 4 EGA bitplanes (B,G,R,I), 2 bytes/row
  .SPR  per sprite: [width_bytes][height] + 4 pre-shifted copies x 5 planes
        (B,G,R,I + mask; mask bit 1 = transparent), width_bytes*height
        bytes per plane. Copy 0 (unshifted) used.
  .LEV  960 bytes map (24 rows x 40 cols) -> attr = byte>>6
        (0 pass, 1 solid, 2 special, 3 deadly), tile = byte&0x3f.
        + enemies (91 B: x,x2,y,y2 words; type byte; minx,maxx,miny,maxy
          words; 4 bytes params; 70-byte anim program [dur,sprite]... 0xff)
        + items (6 B: x,y words, sprite byte (80..89 = SPEZ), kind byte:
          0 = required collectible, 1 = bonus, 2 = wall-remover, 3 = exit card)
        + deco sprites (5 B: x,y words, sprite byte)
        + tail: willy x,y; facing; scroll x,y; exit x,y; required count
  .DAT  BMP (some with patched magic), 16-color
Hub doors: LMAIN map scanned row-major for door tops (tile 0x10/0x14/0x18
with +1 right and +2 below) -> door i = level i+1. 24 doors.
"""
import json
import os
import struct
import io

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ORIG = os.path.join(HERE, '..', 'original')
OUT = os.path.join(HERE, '..', 'assets')

EGA = [(0, 0, 0), (0, 0, 170), (0, 170, 0), (0, 170, 170),
       (170, 0, 0), (170, 0, 170), (170, 85, 0), (170, 170, 170),
       (85, 85, 85), (85, 85, 255), (85, 255, 85), (85, 255, 255),
       (255, 85, 85), (255, 85, 255), (255, 255, 85), (255, 255, 255)]

# per-level file config, mirrored from the EXE's level() dispatch
LEVELS = {
    0:  dict(lev='LMAIN.LEV', spr='LMAIN.SPR', bst='LMAIN.BST', bg=None),
    1:  dict(lev='L01.LEV', spr='L01.SPR', bst=None, bg='LEVEL1.DAT'),
    2:  dict(lev='L02.LEV', spr='L02.SPR', bst='L02.BST', bg=None),
    3:  dict(lev='L03.LEV', spr='L03.SPR', bst='L03.BST', bg=None),
    4:  dict(lev='L04.LEV', spr='L04.SPR', spr2='L02.SPR', bst='L04.BST', bg=None),
    5:  dict(lev='L05.LEV', spr='L05.SPR', bst='L05.BST', bg=None),
    6:  dict(lev='L06.LEV', spr='L06.SPR', bst='L06.BST', bg=None),
    7:  dict(lev='L07.LEV', spr='L03.SPR', spr2='L07.SPR', bst='L07.BST', bg=None),
    8:  dict(lev='L08.LEV', spr='L05.SPR', bst='L08.BST', bg=None),
    9:  dict(lev='L09.LEV', spr='L09.SPR', bst='L09.BST', bg=None),
    10: dict(lev='L10.LEV', spr='L10.SPR', bst='L10.BST', bg=None),
    11: dict(lev='L11.LEV', spr='L11.SPR', bst='L11.BST', bg=None),
    12: dict(lev='L12.LEV', spr='L05.SPR', bst='L05.BST', bg=None),
    13: dict(lev='L13.LEV', spr='L13.SPR', bst='L13.BST', bg=None),
    14: dict(lev='L14.LEV', spr='L03.SPR', bst='L03.BST', bg=None),
    15: dict(lev='L15.LEV', spr='L10.SPR', bst='L08.BST', bg=None),
    16: dict(lev='L16.LEV', spr='L11.SPR', bst='L11.BST', bg=None),
    17: dict(lev='L17.LEV', spr='L02.SPR', bst='L02.BST', bg=None),
    18: dict(lev='L18.LEV', spr='L04.SPR', bst='L04.BST', bg=None),
    19: dict(lev='L19.LEV', spr='L07.SPR', bst='L07.BST', bg=None),
    20: dict(lev='L20.LEV', spr='L09.SPR', bst='L09.BST', bg=None),
    21: dict(lev='L21.LEV', spr='L10.SPR', bst='L10.BST', bg=None),
    22: dict(lev='L22.LEV', spr='L06.SPR', bst='L06.BST', bg=None),
    23: dict(lev='L23.LEV', spr='L13.SPR', bst='L13.BST', bg=None),
    24: dict(lev='L24.LEV', spr='L03.SPR', bst='L03.BST', bg=None),
}

SCALE = 4


def rp(name):
    return os.path.join(ORIG, name)


# ---------------------------------------------------------------- decoding

def parse_bst(fn):
    d = open(rp(fn), 'rb').read()
    tiles = []
    for t in range(len(d) // 128):
        img = Image.new('RGBA', (16, 16))
        px = img.load()
        for y in range(16):
            for x in range(16):
                v = 0
                for p in range(4):
                    if (d[t * 128 + p * 32 + y * 2 + x // 8] >> (7 - (x % 8))) & 1:
                        v |= 1 << p
                px[x, y] = EGA[v] + (255,)
        tiles.append(img)
    return tiles


def parse_spr(fn):
    d = open(rp(fn), 'rb').read()
    pos = 0
    sprites = []
    while pos < len(d):
        w, h = d[pos], d[pos + 1]
        pos += 2
        copies = []
        for _ in range(4):
            planes = []
            for _ in range(5):
                planes.append(d[pos:pos + w * h])
                pos += w * h
            copies.append(planes)
        sprites.append((w, h, copies[0]))
    assert pos == len(d), fn
    return sprites


def spr_img(w, h, planes):
    img = Image.new('RGBA', (w * 8, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w * 8):
            byi = y * w + x // 8
            bit = 7 - (x % 8)
            if (planes[4][byi] >> bit) & 1:
                continue  # transparent
            v = 0
            for i in range(4):
                if (planes[i][byi] >> bit) & 1:
                    v |= 1 << i
            px[x, y] = EGA[v] + (255,)
    return img


def parse_lev(fn):
    d = open(rp(fn), 'rb').read()
    m = list(d[:960])
    pos = 960
    n1 = d[pos]; pos += 1
    enemies = []
    for _ in range(n1):
        x, x2, y, y2 = struct.unpack('<4H', d[pos:pos + 8])
        typ = d[pos + 8]
        minx, maxx, miny, maxy = struct.unpack('<4H', d[pos + 9:pos + 17])
        b = list(d[pos + 17:pos + 21])
        raw = d[pos + 21:pos + 91]
        prog = []
        for i in range(0, 70, 2):
            if raw[i] == 0xff:
                break
            if raw[i] == 0 and raw[i + 1] == 0:
                break
            prog.append([raw[i], raw[i + 1]])
        enemies.append(dict(x=x, y=y, type=typ,
                            minx=minx, maxx=maxx, miny=miny, maxy=maxy,
                            b=b, prog=prog))
        pos += 91
    n2 = d[pos]; pos += 1
    items = []
    for _ in range(n2):
        x, y = struct.unpack('<HH', d[pos:pos + 4])
        items.append(dict(x=x, y=y, spr=d[pos + 4], kind=d[pos + 5]))
        pos += 6
    n3 = d[pos]; pos += 1
    deco = []
    for _ in range(n3):
        x, y = struct.unpack('<HH', d[pos:pos + 4])
        deco.append(dict(x=x, y=y, spr=d[pos + 4]))
        pos += 5
    t = d[pos:pos + 14]
    wx, wy = struct.unpack('<HH', t[0:4])
    scx, scy, exx, exy = struct.unpack('<4H', t[5:13])
    tail = dict(wx=wx, wy=wy, face=t[4], scx=scx, scy=scy,
                exx=exx, exy=exy, need=t[13])
    return m, enemies, items, deco, tail


def load_dat(fn):
    d = bytearray(open(rp(fn), 'rb').read())
    d[0:2] = b'BM'
    return Image.open(io.BytesIO(bytes(d))).convert('RGBA')


# ------------------------------------------------------------- upscaling

def scale2x(img):
    w, h = img.size
    src = img.load()
    out = Image.new('RGBA', (w * 2, h * 2))
    dst = out.load()

    def at(x, y):
        return src[max(0, min(w - 1, x)), max(0, min(h - 1, y))]

    for y in range(h):
        for x in range(w):
            c = at(x, y)
            a = at(x, y - 1)
            b = at(x + 1, y)
            l = at(x - 1, y)
            d = at(x, y + 1)
            e0 = l if (l == a and l != d and a != b) else c
            e1 = b if (a == b and a != l and b != d) else c
            e2 = l if (d == l and d != b and l != a) else c
            e3 = b if (b == d and b != a and d != l) else c
            dst[x * 2, y * 2] = e0
            dst[x * 2 + 1, y * 2] = e1
            dst[x * 2, y * 2 + 1] = e2
            dst[x * 2 + 1, y * 2 + 1] = e3
    return out


def antialias_diag(img):
    """Soften remaining stair-steps by blending hard diagonal corners."""
    w, h = img.size
    src = img.copy().load()
    out = img
    dst = out.load()
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            c = src[x, y]
            n, s = src[x, y - 1], src[x, y + 1]
            wl, e = src[x - 1, y], src[x + 1, y]
            for d1, d2 in ((n, wl), (n, e), (s, wl), (s, e)):
                if d1 == d2 and d1 != c and d1[3] == 255 and c[3] == 255:
                    dst[x, y] = tuple((a * 2 + b) // 3 for a, b in zip(c, d1))
                    break
    return out


def upscale4(img, smooth=True):
    up = scale2x(scale2x(img))
    if smooth:
        up = antialias_diag(up)
    return up


# --------------------------------------------------------------- atlases

def pack_sheet(images, pad=2):
    cols = min(10, max(1, len(images)))
    cw = max(i.width for i in images) + pad
    ch = max(i.height for i in images) + pad
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cw, rows * ch), (0, 0, 0, 0))
    frames = []
    for i, im in enumerate(images):
        x = (i % cols) * cw
        y = (i // cols) * ch
        sheet.paste(im, (x, y))
        frames.append(dict(x=x, y=y, w=im.width, h=im.height))
    return sheet, frames


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(OUT, 'screens'), exist_ok=True)

    atlas = {}

    # ---- sprites: every SPR file once
    spr_files = sorted({cfg[k] for cfg in LEVELS.values()
                        for k in ('spr', 'spr2') if cfg.get(k)})
    spr_files += ['SPEZ.SPR', 'WILLY.SPR', 'LEND.SPR']
    for fn in spr_files:
        sprites = parse_spr(fn)
        ups = [upscale4(spr_img(w, h, p)) for w, h, p in sprites]
        sheet, frames = pack_sheet(ups)
        key = fn.replace('.SPR', '').lower()
        sheet.save(os.path.join(OUT, f'spr_{key}.png'))
        atlas[key] = dict(file=f'spr_{key}.png',
                          frames=frames,
                          logical=[[w * 8, h] for w, h, _ in sprites])
        print(f'{fn}: {len(sprites)} sprites')

    # ---- tiles
    bst_files = sorted({cfg['bst'] for cfg in LEVELS.values() if cfg['bst']})
    for fn in bst_files:
        tiles = parse_bst(fn)
        ups = [upscale4(t) for t in tiles]
        sheet, frames = pack_sheet(ups, pad=0)
        key = fn.replace('.BST', '').lower()
        sheet.save(os.path.join(OUT, f'bst_{key}.png'))
        atlas['bst_' + key] = dict(file=f'bst_{key}.png', frames=frames,
                                   count=len(tiles))
        print(f'{fn}: {len(tiles)} tiles')

    # ---- level 1 background + full-screen art
    lvl1 = load_dat('LEVEL1.DAT')
    upscale4(lvl1, smooth=True).save(os.path.join(OUT, 'level1_bg.png'))
    for fn, key in [('TITLE2.DAT', 'title'), ('DIM.DAT', 'dim'),
                    ('END.DAT', 'end'), ('STORY2.DAT', 'story2'),
                    ('STORY6.DAT', 'story6'), ('STORY11.DAT', 'story11'),
                    ('STORY13.DAT', 'story13')]:
        img = load_dat(fn)
        upscale4(img).save(os.path.join(OUT, f'screens/{key}.png'))
        print(f'{fn} -> screens/{key}.png')

    # ---- levels
    levels = {}
    for n, cfg in LEVELS.items():
        m, enemies, items, deco, tail = parse_lev(cfg['lev'])
        levels[n] = dict(
            map=m, enemies=enemies, items=items, deco=deco, **tail,
            spr=cfg['spr'].replace('.SPR', '').lower(),
            spr2=cfg.get('spr2', '').replace('.SPR', '').lower() or None,
            bst=(cfg['bst'] or '').replace('.BST', '').lower() or None,
            bg='level1_bg.png' if cfg['bg'] else None,
        )

    # hub doors: row-major scan for door-top tiles
    m = levels[0]['map']
    doors = []
    for r in range(24):
        for c in range(40):
            v = m[r * 40 + c] & 0x3f
            if v in (0x10, 0x14, 0x18) and c + 1 < 40 and r + 1 < 24 \
               and (m[r * 40 + c + 1] & 0x3f) == v + 1 \
               and (m[(r + 1) * 40 + c] & 0x3f) == v + 2:
                doors.append(dict(x=c * 16, y=r * 16, level=len(doors) + 1))
    levels[0]['doors'] = doors
    print(f'hub doors: {len(doors)}')

    game = dict(levels=levels, atlas=atlas)
    with open(os.path.join(OUT, 'gamedata.json'), 'w') as f:
        json.dump(game, f, separators=(',', ':'))
    size = os.path.getsize(os.path.join(OUT, 'gamedata.json'))
    print(f'gamedata.json: {size/1024:.0f} KB')


if __name__ == '__main__':
    main()
