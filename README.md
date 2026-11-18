<div align="center" width="100%">
    <img src="./public/icon.svg" width="128" alt="Uptime Kuma Logo" />
</div>

# Uptime Kuma mit Tagesansicht

Dieser Fork von [Uptime Kuma](https://github.com/louislam/uptime-kuma) ergänzt die Statusseiten um eine
**Tagesansicht**: einen Balken pro Tag über 90, 180 oder 365 Tage, und per Klick die Details eines einzelnen Tages.
Alles andere ist das unveränderte Uptime Kuma derselben Version.

Der Fork wird automatisch mit neuen Releases des Originals abgeglichen und als Docker-Image
`ghcr.io/brunoz78/uptime-kuma` veröffentlicht.

- [Änderungen gegenüber dem Original](#änderungen-gegenüber-dem-original)
- [Installation](#installation)
- [Vom Original wechseln](#vom-original-wechseln)
- [Aktualisieren](#aktualisieren)
- [Abgleich mit dem Original](#abgleich-mit-dem-original)
- [Entwicklung](#entwicklung)
- [Herkunft und Lizenz](#herkunft-und-lizenz)

## Änderungen gegenüber dem Original

### Tagesansicht auf Statusseiten

Im Original zeigt eine Statusseite pro Monitor nur die letzten 100 Checks. Hier lässt sich pro Statusseite eine
Tagesansicht einschalten: Jeder Monitor zeigt dann einen Balken pro Kalendertag.

- **Einstellung:** Statusseite bearbeiten → «Tagesansicht» → Aus, 90, 180 oder 365 Tage.
- **Farben:**

  | Farbe  | Bedeutung                                  |
  | ------ | ------------------------------------------ |
  | Grün   | kein fehlgeschlagener Check an dem Tag     |
  | Orange | Fehlschläge, Verfügbarkeit mindestens 95 % |
  | Rot    | Verfügbarkeit unter 95 %                   |
  | Blau   | Wartung, ohne fehlgeschlagenen Check       |
  | Grau   | keine Daten                                |

- **Tooltip** beim Darüberfahren: Datum, Status, Verfügbarkeit und durchschnittliche Antwortzeit.
- **Prozentzahl** neben dem Monitor: Verfügbarkeit über den gewählten Zeitraum statt über 24 Stunden.
- **Vergangenheit:** Die Werte stammen aus der vorhandenen Tagesstatistik. Nach dem Einschalten sind die bisherigen
  Tage sofort sichtbar, soweit Statistik vorhanden ist.
- **Schmale Bildschirme:** Die ältesten Tage werden ausgeblendet, wenn der Platz nicht reicht.

### Details eines Tages

Ein Klick (oder Tippen) auf einen Tag öffnet ein Fenster mit den Details:

| Angabe                                             | Verfügbar für                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| Checks, Verfügbarkeit, Antwortzeit (Ø, min., max.) | alle angezeigten Tage                                                      |
| Verlauf über 24 Stunden                            | die letzten 30 Tage                                                        |
| Ausfälle und Wartung mit Beginn, Ende und Dauer    | solange die Heartbeats aufbewahrt werden (Einstellungen → Monitor-Verlauf) |

Fehlermeldungen der Checks werden wie überall auf öffentlichen Statusseiten nicht angezeigt.

### Gut zu wissen

- **Tagesgrenze:** Ein Tag ist ein UTC-Tag, weil Uptime Kuma die Tagesstatistik so speichert. Uhrzeiten im
  Detailfenster werden in Ortszeit angezeigt.
- **Datenbank:** Funktioniert mit SQLite und MariaDB. Eine Migration ergänzt die Spalte `status_page.daily_view_days`.
- **Ausgeschaltet** («Tagesansicht: Aus») verhält sich alles wie im Original.
- **Sprachen:** Deutsch und Englisch.

### Fehlerbehebung

Kurz nach einem Neustart konnten gleichzeitige Anfragen eine noch nicht geladene Uptime-Statistik erhalten, sodass ein
Monitor bis zu fünf Minuten ohne Daten erschien. Die Statistik wird jetzt einmal geladen, und alle Anfragen warten
darauf.

## Installation

Docker ist der vorgesehene Weg. Das Image gibt es für `linux/amd64` und `linux/arm64`.

> [!WARNING]
> SQLite funktioniert nicht auf NFS. Verwende für `/app/data` ein lokales Verzeichnis oder ein Docker-Volume.

### Docker Compose

```yaml
services:
  uptime-kuma:
    image: ghcr.io/brunoz78/uptime-kuma:latest
    container_name: uptime-kuma
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
```

```bash
docker compose up -d
```

Uptime Kuma läuft danach auf Port 3001 (z. B. `http://localhost:3001`).

### Docker

```bash
docker run -d --restart=unless-stopped -p 3001:3001 -v uptime-kuma:/app/data --name uptime-kuma ghcr.io/brunoz78/uptime-kuma:latest
```

### Portainer

Unter **Stacks → Add stack** den Compose-Text von oben einfügen und bereitstellen. Für einen bestehenden Container
genügt es, das Image wie unter [Vom Original wechseln](#vom-original-wechseln) zu ersetzen.

### Image-Tags

| Tag                      | Inhalt                                     |
| ------------------------ | ------------------------------------------ |
| `latest`                 | neueste gebaute Version                    |
| `<version>-tagesansicht` | feste Version, z. B. `2.5.12-tagesansicht` |

Mit `latest` kommt jede neue Version des Originals ohne weiteres Zutun ins Image, sobald du es neu ziehst. Mit einem
festen Tag bestimmst du selbst, wann du wechselst.

## Vom Original wechseln

Das Image ist das offizielle Image derselben Version mit den Änderungen dieses Forks darüber. Die Daten bleiben
erhalten.

1. Daten-Volume sichern (der Ordner oder das Volume, das auf `/app/data` zeigt).
2. Im Container oder Stack `louislam/uptime-kuma:…` durch `ghcr.io/brunoz78/uptime-kuma:<version>-tagesansicht`
   ersetzen. Volumes, Ports und Umgebungsvariablen bleiben gleich.
3. Container neu erstellen. Beim ersten Start ergänzt eine Migration die neue Spalte.
4. Statusseite bearbeiten und die Tagesansicht einschalten.

Zurück zum Original geht jederzeit: wieder das offizielle Image derselben oder einer neueren Version eintragen. Die
zusätzliche Spalte stört dort nicht.

## Aktualisieren

```bash
docker compose pull
docker compose up -d
```

In Portainer: Stack öffnen → **Update the stack** mit **Re-pull image**. Vorher das Daten-Volume sichern, denn neue
Versionen können die Datenbank migrieren.

## Abgleich mit dem Original

Der Workflow «Sync upstream» prüft täglich, ob es ein neues stabiles Release derselben Hauptversion gibt. Wenn ja,
übernimmt er es, führt die Tests aus, baut die Oberfläche und veröffentlicht ein neues Image. Er wartet, bis das
offizielle Image dieser Version erschienen ist. Bei Konflikten bricht er ab, ohne etwas zu ändern.

Eine neue Hauptversion (z. B. 3.x) wird nicht automatisch übernommen. Dafür den Workflow unter **Actions → Sync upstream
→ Run workflow** mit der gewünschten Version starten.

## Entwicklung

Voraussetzungen: Node.js 20.4 oder neuer, npm, Git.

```bash
git clone https://github.com/brunoz78/uptime-kuma.git
cd uptime-kuma
npm ci
npm run build
node server/server.js
```

| Datei                                  | Inhalt                                                     |
| -------------------------------------- | ---------------------------------------------------------- |
| `server/daily-view.js`                 | Logik der Tagesansicht und der Tagesdetails                |
| `server/routers/status-page-router.js` | Endpunkte `/api/status-page/heartbeat-daily/…`             |
| `src/components/DailyHeartbeatBar.vue` | Tagesleiste                                                |
| `src/components/DailyDetailDialog.vue` | Detailfenster eines Tages                                  |
| `test/backend-test/test-daily-view.js` | Tests (`node --test test/backend-test/test-daily-view.js`) |
| `docker/tagesansicht.dockerfile`       | Image auf Basis des offiziellen Images                     |
| `.github/workflows/`                   | Image-Build und Abgleich mit dem Original                  |

Für alles, was nicht die Tagesansicht betrifft, gilt die Dokumentation des Originals:
[Wiki](https://github.com/louislam/uptime-kuma/wiki) und [README](https://github.com/louislam/uptime-kuma#readme).

## Herkunft und Lizenz

Uptime Kuma stammt von [Louis Lam](https://github.com/louislam) und den Mitwirkenden des Projekts. Dieser Fork ergänzt
nur die oben beschriebenen Teile. Fehler, die auch mit dem offiziellen Image auftreten, gehören in das
[Original-Repository](https://github.com/louislam/uptime-kuma/issues).

Lizenz: [MIT](LICENSE), wie das Original.
