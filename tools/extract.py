#!/usr/bin/env python3
"""Little Willy asset pipeline.

Decodes the original DOS data files (LEV/SPR/BST/DAT) into JSON + PNG
assets for the browser remake.  All graphics are exported at their
native resolution (1 px = 1 px); the renderer scales them with
nearest-neighbour filtering, so the pixel art stays crisp.

Formats (reverse-engineered from LW5.EXE, Turbo-C, huge model):
  .BST  n tiles x 128 bytes: 16x16 px, 4 EGA bitplanes (B,G,R,I), 2 bytes/row
  .SPR  per sprite: [width_bytes][height] + 4 pre-shifted copies x 5 planes
        (B,G,R,I + mask; mask bit 1 = transparent), width_bytes*height
        bytes per plane. Copy 0 (unshifted) is used.
  .LEV  960 bytes map (24 rows x 40 cols) -> attr = byte>>6
        (0 free, 1 solid, 2 one-way platform, 3 deadly), tile = byte&0x3f.
        + enemies (91 B each):
            x, x2, y, y2      words (x2/y2 = second video page copy)
            speed             byte  (>=100: slow mover, 1 px / (speed-100) steps)
            minx, maxx        words (patrol bounds, compared with the sprite origin)
            miny, maxy        words
            dir               byte  (0 right,1 left,2 up,3 down,4 arc,5 bounce,
                                     6 random walk,7 homing)
            kind              byte  (0 enemy, 1 platform, 2 special platform,
                                     other = harmless decoration)
            hp                byte  (0xff = invulnerable)
            reset             byte  (animation index used when turning right)
            program           70 bytes: [duration, sprite] pairs,
                                     0xfe = loop to 0, 0xff = loop to reset
        + items (6 B: x,y words, sprite byte (80..89 = SPEZ), kind byte:
          0 = collectible (80/88/89 count), 1 = key, 2 = card (sits inside a
          solid "mystical stone"), 3 = exit card)
        + deco sprites (5 B: x,y words, sprite byte)
        + tail: willy x,y; start frame (0 = facing left, 12 = right);
          scroll x,y; exit x,y; required count
  .DAT  BMP (some with patched magic), 16-color, Windows palette order
        remapped to EGA attributes on load (see DAT_TO_EGA)
The 24 hub doors are hard-coded in LW5.EXE (function at file offset
0x77d4); door n leads to level n, door 1 is the final level.
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

# sprite slot ranges per level: [start, end, atlasKey] (load_spr calls in LW5.EXE)
SPR_RANGES = {
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
}

# hub doors, hard-coded in LW5.EXE: door n -> level n
DOORS = [
    (16, 100), (400, 100), (112, 100), (16, 196), (496, 100), (400, 148),
    (496, 148), (400, 244), (592, 148), (448, 340), (64, 244), (544, 244),
    (304, 244), (16, 292), (400, 340), (208, 340), (544, 340), (304, 340),
    (544, 196), (544, 292), (352, 292), (352, 340), (256, 340), (112, 244),
]

# Willy frame -> WILLY.SPR sprite (table at DS:0x67 in LW5.EXE)
WILLY_FRAMES = [0, 2, 3, 4, 3, 2, 0, 5, 6, 7, 6, 5,
                8, 10, 11, 12, 11, 10, 8, 13, 14, 15, 14, 13,
                1, 9, 16, 17, 18, 19, 19, 20, 21]

# jump height table (DS:0x21), 18 rising phases; descent mirrors it
JUMP_TABLE = [4, 8, 12, 16, 20, 24, 27, 30, 32, 35, 37, 39, 40, 41, 42, 43, 43, 44]

# PC speaker effects: (frequency Hz, duration in frames) pairs, 1 Hz = rest
SOUNDS = {
    'shoot':     [(80, 1), (100, 1), (300, 1), (500, 1), (200, 1), (100, 2), (80, 3), (20, 4)],
    'explosion': [(20, 4), (40, 4), (30, 4), (20, 4)],
    'hurt':      [(40, 2), (100, 2), (40, 2), (100, 2), (40, 2), (100, 1), (40, 1), (100, 1), (40, 1)],
    'enemyhit':  [(40, 8), (1, 8), (40, 8)],
    'death':     [(2000, 2), (1800, 3), (1500, 2), (1100, 1), (600, 1), (500, 1), (400, 1)],
    'rise':      [(100, 2), (200, 2), (350, 2), (750, 2), (1000, 2), (1300, 2)],
    'fall':      [(70, 2), (50, 3), (40, 4), (30, 5), (20, 8)],
    'pickup':    [(2000, 1), (2020, 1), (2040, 1), (2060, 1), (2040, 1), (2020, 1), (2000, 1)],
    'card':      [(2100, 2), (2080, 2), (2060, 2), (2040, 2), (2020, 2), (2000, 2), (1800, 2)],
}


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
        speed = d[pos + 8]
        minx, maxx, miny, maxy = struct.unpack('<4H', d[pos + 9:pos + 17])
        direction, kind, hp, reset = d[pos + 17:pos + 21]
        prog = list(d[pos + 21:pos + 91])
        enemies.append(dict(x=x, y=y, speed=speed,
                            minx=minx, maxx=maxx, miny=miny, maxy=maxy,
                            dir=direction, kind=kind, hp=hp, reset=reset,
                            prog=prog))
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


# The .DAT pictures carry the standard Windows 16-colour palette; the EXE
# remaps every pixel index to the EGA attribute it is displayed with
# (function at file offset 0x7330: 1->4, 3->6, 4->1, 6->3, 7->8, 8->7,
# 9->12, 11->14, 12->9, 14->11).  Applying the same table here gives the
# screens exactly the colours of the sprites and tiles.
DAT_TO_EGA = [0, 4, 2, 6, 1, 5, 3, 8, 7, 12, 10, 14, 9, 13, 11, 15]


def load_dat(fn):
    d = bytearray(open(rp(fn), 'rb').read())
    d[0:2] = b'BM'
    img = Image.open(io.BytesIO(bytes(d)))
    assert img.mode == 'P', fn
    pal = []
    for i in range(16):
        pal.extend(EGA[DAT_TO_EGA[i]])
    img.putpalette(pal + [0] * (768 - len(pal)))
    return img.convert('RGBA')


# --------------------------------------------------------------- atlases

def pack_sheet(images, pad=1):
    cols = min(16, max(1, len(images)))
    cw = max(i.width for i in images) + pad
    ch = max(i.height for i in images) + pad
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cw, rows * ch), (0, 0, 0, 0))
    frames = []
    for i, im in enumerate(images):
        x = (i % cols) * cw
        y = (i // cols) * ch
        sheet.paste(im, (x, y))
        frames.append([x, y, im.width, im.height])
    return sheet, frames


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(OUT, 'screens'), exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.png'):
            os.remove(os.path.join(OUT, f))

    atlas = {}

    # ---- sprites: every SPR file once
    spr_files = sorted({cfg[k] for cfg in LEVELS.values()
                        for k in ('spr', 'spr2') if cfg.get(k)})
    spr_files += ['SPEZ.SPR', 'WILLY.SPR', 'LEND.SPR']
    for fn in spr_files:
        sprites = parse_spr(fn)
        imgs = [spr_img(w, h, p) for w, h, p in sprites]
        sheet, frames = pack_sheet(imgs)
        key = fn.replace('.SPR', '').lower()
        sheet.save(os.path.join(OUT, f'spr_{key}.png'))
        atlas[key] = dict(file=f'spr_{key}.png', frames=frames)
        print(f'{fn}: {len(sprites)} sprites')

    # ---- tiles
    bst_files = sorted({cfg['bst'] for cfg in LEVELS.values() if cfg['bst']})
    for fn in bst_files:
        tiles = parse_bst(fn)
        sheet, frames = pack_sheet(tiles, pad=0)
        key = fn.replace('.BST', '').lower()
        sheet.save(os.path.join(OUT, f'bst_{key}.png'))
        atlas['bst_' + key] = dict(file=f'bst_{key}.png', frames=frames)
        print(f'{fn}: {len(tiles)} tiles')

    # ---- level 1 background + full-screen art
    load_dat('LEVEL1.DAT').save(os.path.join(OUT, 'level1_bg.png'))
    # TITLE2.DAT is 320x400: the title on top, the credits below; the
    # original scrolls between the two halves.  TEXT0/TEXT1 hold the story
    # text in 50- and 39-row paragraphs that are shown one after another.
    for fn, key in [('TITLE2.DAT', 'title'), ('DIM.DAT', 'dim'),
                    ('END.DAT', 'end'), ('STORY2.DAT', 'story2'),
                    ('STORY6.DAT', 'story6'), ('STORY11.DAT', 'story11'),
                    ('STORY13.DAT', 'story13'), ('TEXT0.DAT', 'text0'),
                    ('TEXT1.DAT', 'text1')]:
        img = load_dat(fn)
        img.save(os.path.join(OUT, f'screens/{key}.png'))
        print(f'{fn} -> screens/{key}.png {img.size}')

    # ---- levels
    levels = {}
    for n, cfg in LEVELS.items():
        m, enemies, items, deco, tail = parse_lev(cfg['lev'])
        levels[n] = dict(
            map=m, enemies=enemies, items=items, deco=deco, **tail,
            ranges=SPR_RANGES[n],
            bst=(cfg['bst'] or '').replace('.BST', '').lower() or None,
            bg='level1_bg.png' if cfg['bg'] else None,
        )
    levels[0]['doors'] = [dict(x=x, y=y, level=i + 1) for i, (x, y) in enumerate(DOORS)]

    game = dict(levels=levels, atlas=atlas, willyFrames=WILLY_FRAMES,
                jumpTable=JUMP_TABLE, sounds=SOUNDS)
    with open(os.path.join(OUT, 'gamedata.json'), 'w') as f:
        json.dump(game, f, separators=(',', ':'))
    size = os.path.getsize(os.path.join(OUT, 'gamedata.json'))
    print(f'gamedata.json: {size/1024:.0f} KB')


if __name__ == '__main__':
    main()
