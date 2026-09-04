# Little Willy — "Where is mama?" (Browser-Remake)

Browser-Remake des DOS-Spiels **Little Willy v1.1** (© 1993/1994
I. Mustun / Dimension 16 & M.B. Soft) mit den originalen Levels und der
originalen Spielmechanik. Die komplette Logik (Laufen, Springen, Fallen,
Gegner, Items, Schuss, Energie) wurde aus der `LW5.EXE` rekonstruiert
und läuft wie im Original mit 35 Logikbildern pro Sekunde auf einer
Welt aus 16x16-Kacheln. Die Grafik wird in der nativen Auflösung
320x200 gezeichnet und ganzzahlig, pixelgenau skaliert.

## Spielen

Einen statischen Webserver im Projektordner starten, z. B.:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

(Direktes Öffnen von `index.html` per Doppelklick funktioniert nicht,
weil das Spiel seine Daten per `fetch` lädt.)

## Steuerung (wie im Original)

| Taste                  | Aktion                        |
|------------------------|-------------------------------|
| `A` / `Space` / `↑`    | Springen (gehalten: Dauersprung) |
| `S` / `Ctrl` / `X`     | Schiessen                     |
| `,` / `←`              | Nach links                    |
| `.` / `→`              | Nach rechts                   |
| `Esc`                  | Menü / Pause                  |
| `M` / `O` / `F`        | Musik, Effekte, Vollbild      |
| `G`                    | God-Modus (Cheat) ein und aus |

Gamepads werden unterstützt, auf Touch-Geräten erscheinen
Bildschirmtasten.

## Das Spiel

Willys Mutter wurde entführt. Vom **Galactic Train**, einem Labyrinth
aus Mondsteinen, führen 24 Türen in 24 Welten. Eine Tür betritt man,
indem man hineinläuft. In jedem Level:

- Finde die **EXIT-CARD**, sonst bleibt der Ausgang zu.
- Sammle alle **Drink-Boxes** bzw. **Lollypops** (Zähler oben rechts).
- Die farbigen **Karten** stecken in unsichtbaren Steinen und lassen
  sich nur mit dem passenden **Schlüssel** nehmen; danach ist der Stein
  weg.
- Willy hat pro Level **vier Energiepunkte** (Herzen). Sind sie weg oder
  berührt er ein tödliches Feld, beginnt das Level von vorn.
- Gegner lassen sich abschiessen; manche brauchen mehrere Treffer,
  manche sind unverwundbar. Auf Plattformen und Aufzügen kann Willy
  mitfahren.

Erst wenn alle anderen Türen geschafft sind, öffnet sich Tür 1: das
Gefängnis, in dem Mama festgehalten wird.

Der Spielfortschritt (geschaffte Türen) wird automatisch im Browser
gespeichert (`localStorage`).

## God-Modus (Cheat)

Das Original ist bockschwer, darum gibt es einen Unsterblichkeits-Modus.
Mit `G` lässt er sich jederzeit ein und ausschalten, im Menü ebenso wie
mitten im Level. Ist er aktiv, werden die Herzen golden und oben links
steht `GOD`.

Was der Modus abschaltet:

- Schaden durch Gegner und durch die verletzenden Plattformen
- tödliche Kacheln (Stacheln, Lava, Dornen)
- damit auch jeden Levelneustart durch Sterben

Was der Modus dazugibt, jeweils beim Levelstart und beim Einschalten
mitten im Level:

- die **Exit-Card**, der Ausgang ist also sofort offen
- alle drei **Schlüssel**
- alle **Karten** samt ihren mystischen Steinen, die sich auflösen
- den Zähler für Drink-Boxes und Lollypops auf null

Zu tun bleibt der Weg zum Ausgang. Die Sammelobjekte liegen weiterhin
herum und dürfen eingesammelt werden, sie zählen nur nicht mehr. Auch
die Falle von Level 20, wo das Nehmen der Drink-Boxes den Ausgang
verriegelt, greift im God-Modus nicht mehr.

Unverändert bleibt Tür 1: das Finale öffnet sich weiterhin erst, wenn
die übrigen 24 Türen geschafft sind.

Die Einstellung wird mitgespeichert. Auf Touch-Geräten ohne Tastatur
lässt sie sich per URL setzen: `?god=1` schaltet ein, `?god=0` aus.

## Projektstruktur

```
original/     Original-DOS-Dateien (LEV/SPR/BST/DAT + LW5.EXE)
tools/        extract.py: dekodiert die Originalformate und erzeugt die
              Assets (JSON + PNG in Originalauflösung)
              font.py: erzeugt die 5x7-Bitmap-Schrift (js/font.js)
assets/       generierte Spieldaten und Grafiken
js/           Engine: game.js (Simulation), render.js, audio.js,
              input.js, assets.js, font.js, main.js (Ablauf)
index.html    Einstieg
```

## Rekonstruierte Mechanik (Auszug aus LW5.EXE)

- **Zeitbasis**: ein Seitenwechsel je 25 ms BIOS-Timer plus
  Bildsynchronisation, also 35 Logikbilder pro Sekunde.
- **Laufen**: 2 px pro Bild. Kollisionsproben bei `x+14`/`x+12`
  (rechts) und `x-4`/`x-2` (links) in den Kachelzeilen `y>>4` und
  `(y+15)>>4`. Nur Attribut 1 (solide) blockiert seitlich.
- **Springen**: feste Tabelle `4 8 12 16 20 24 27 30 32 35 37 39 40 41
  42 43 43 44`, 18 Bilder aufwärts, gespiegelt abwärts, 37 Bilder
  insgesamt. Kopfstoss an Decken, Landung rastet aufs Kachelraster ein.
  Gehaltene Sprungtaste springt erneut.
- **Fallen**: 6, 4 oder 2 px pro Bild, je nachdem, wie nah der Boden ist.
- **Kachelattribute**: 0 frei, 1 solide, 2 Plattform (von unten
  durchspringbar, seitlich passierbar, als Boden tragend), 3 tödlich.
- **Gegner**: Geschwindigkeit, Patrouillengrenzen, Richtungstyp (0
  rechts, 1 links, 2 auf, 3 ab, 4 Bogen, 5 Hüpfen, 6 Zufallslauf, 7
  verfolgend), Art (0 Gegner, 1 Plattform, 2 verletzende Plattform),
  Trefferpunkte (255 = unverwundbar), Animationsprogramm aus
  Dauer/Sprite-Paaren. Geschwindigkeiten ab 100 sind Schleicher
  (1 px alle `speed-100` Schritte).
- **Schuss**: 4 px pro Bild, nach 8 Bildern 6 px, endet an Wänden oder
  am Bildrand, Explosion mit den Willy-Sprites 22 bis 26.
- **Türen**: die 24 Türpositionen des Hubs sind in der EXE fest
  kodiert (Tür n führt zu Level n).
- **Soundeffekte**: die PC-Speaker-Sequenzen der EXE (Frequenz/Dauer),
  als weiche Rechteckwelle wiedergegeben.

### Assets neu generieren

```bash
pip install pillow
python3 tools/extract.py
python3 tools/font.py
```

## Debug

`?level=N` in der URL startet direkt in Level N (0 = Hub),
optional mit `&x=..&y=..` für die Startposition und `&god=1` für den
God-Modus.
