# Little Willy — "Where is mama?" (Browser Remake)

Browser-Remake des DOS-Spiels **Little Willy v1.1** (© 1993/1994
I. Mustun / Dimension 16 & M.B. Soft) — mit den originalen Levels und
identischem Gameplay, aber zeitgemässer Grafik (4×-Upscaling, Parallax,
Partikel, Glow, sanftes Scrolling) und neuem Sound (WebAudio-Synthesizer,
Musik + Effekte).

## Spielen

Einfach einen statischen Webserver im Projektordner starten, z. B.:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

(Direktes Öffnen von `index.html` per Doppelklick funktioniert nicht,
weil das Spiel seine Daten per `fetch` lädt.)

## Steuerung (wie im Original)

| Taste                  | Aktion                  |
|------------------------|-------------------------|
| `A` / `Space` / `↑`    | Springen / Tür betreten |
| `S` / `Ctrl` / `X`     | Schiessen               |
| `,` / `←`              | Nach links              |
| `.` / `→`              | Nach rechts             |
| `Esc`                  | Menü                    |

Auf Touch-Geräten werden Bildschirm-Buttons eingeblendet.

## Das Spiel

Willys Mutter wurde entführt! Vom **Galactic Train** aus — einem
Labyrinth aus Mondsteinen — führen 24 Türen in 24 Welten. In jedem Level:

- Finde die **EXIT-CARD**, um den Ausgang zu öffnen
- Sammle alle **Drink-Boxes** bzw. **Lollypops**
- Respektiere die **mystischen Steine** (unsichtbare Wände — manche
  Karten-Items entfernen sie!)
- Weiche Gegnern aus oder schiesse sie ab

Erst wenn alle 24 Level geschafft sind, öffnet sich Tür 1: das
Gefängnis, in dem Mama festgehalten wird.

Der Spielfortschritt (geschaffte Türen) wird automatisch im Browser
gespeichert (`localStorage`).

## Projektstruktur

```
original/     Original-DOS-Dateien (LEV/SPR/BST/DAT + LW5.EXE)
tools/        extract.py — dekodiert die Originalformate und erzeugt
              die Assets (JSON + 4×-hochskalierte PNGs)
assets/       generierte Spieldaten und Grafiken
js/           Engine (Physik, Gegner, Items, Rendering, Audio, Input)
index.html    Einstieg
```

### Reverse-engineerte Formate (Kurzfassung)

- **.LEV** — 40×24-Tilemap (1 Byte je Zelle: Bits 6–7 = Attribut:
  0 passierbar, 1 solide, 3 tödlich; Bits 0–5 = Tile-Index), danach
  Gegnerliste (Patrouillen-Grenzen + Animationsprogramm), Items
  (x, y, Sprite, Art), Deko-Sprites und Startwerte (Willy-Position,
  Scroll, Exit-Position, Anzahl Pflicht-Items).
- **.BST** — 16×16-Tiles, 4 EGA-Bitplanes, 128 Bytes pro Tile.
- **.SPR** — je Sprite `[Breite in Bytes][Höhe]`, dann 4 vorverschobene
  Kopien × 5 Bitplanes (B, G, R, I + Transparenz-Maske).
- **.DAT** — 16-Farben-BMPs (teils mit gepatchter Magic).
- Die 24 Türen im Hub ergeben sich aus dem zeilenweisen Scan der
  LMAIN-Karte nach Tür-Tiles; Tür *n* → Level *n*. Tür 1 ist das Finale.

### Assets neu generieren

```bash
pip install pillow
python3 tools/extract.py
```

## Debug

`?level=N` in der URL startet direkt in Level N (0 = Hub),
optional mit `&x=..&y=..` für die Startposition.
