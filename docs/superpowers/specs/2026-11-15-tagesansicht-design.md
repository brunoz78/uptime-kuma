# Tagesansicht auf der Statusseite – Design

## Absicht

Die Statusseite soll pro Monitor eine Leiste mit einem Balken pro Kalendertag
zeigen, über 90, 180 oder 365 Tage. So ist auf einen Blick sichtbar, an welchen
Tagen ein Dienst gestört war. Das Original zeigt nur die letzten 100 Checks.

## Ziele

- Pro Statusseite eine Einstellung «Tagesansicht»: 0 (aus), 90, 180 oder 365 Tage.
- Bei 0 verhält sich alles wie im Original.
- Läuft mit SQLite und MariaDB.
- Auslieferung als Docker-Image `ghcr.io/brunoz78/uptime-kuma`, das auf dem
  offiziellen Image derselben Version aufsetzt.

## Nicht-Ziele

- Übersetzung der restlichen Oberfläche.
- Automatischer Abgleich mit neuen Upstream-Versionen.
- Änderungen am Dashboard.

## Farben

| Status | Farbe | Bedingung |
|---|---|---|
| up | Grün | kein fehlgeschlagener Check an dem Tag |
| partial | Orange | Fehlschläge, Verfügbarkeit mindestens 95 % |
| down | Rot | Verfügbarkeit unter 95 % |
| maintenance | Blau | Wartung an dem Tag und kein fehlgeschlagener Check |
| missing | Grau | keine Daten |

Der heutige Tag wird wie alle anderen nach Verfügbarkeit gefärbt.
Ein Tag ist ein UTC-Tag, weil die Tageswerte so gespeichert sind.

## Ansätze

1. **Tageswerte aus dem `UptimeCalculator` (gewählt).** Er hält pro Monitor die
   letzten 365 Tageswerte im Speicher. Datenbankneutral, keine eigenen Abfragen.
2. **Eigene SQL-Abfragen auf `stat_daily`.** Mehr Code und abhängig vom
   SQL-Dialekt.
3. **Bestehende Heartbeat-Leiste erweitern.** Sie zeichnet auf Canvas und fasst
   nach Bildschirmbreite zusammen, nicht nach Kalendertagen; die Änderung würde
   bei jedem Upstream-Update kollidieren.

Auslieferung: ein dünnes Image auf `louislam/uptime-kuma:<version>`, gebaut von
GitHub Actions. Ein vollständiger Build wie im Original wäre langsam und bringt
nichts; ein Build auf dem Docker-Host bräuchte dort viel Zeit und Speicher.

## Aufbau

- **Datenbank:** Spalte `status_page.daily_view_days` (Ganzzahl, Standard 0).
- **Server:** `server/daily-view.js` enthält die reine Logik (Wert prüfen, Tag
  einfärben, Liste aufbauen). Endpunkt
  `GET /api/status-page/heartbeat-daily/:slug` liefert pro Monitor die Tagesliste
  und die Verfügbarkeit über den Zeitraum.
- **Oberfläche:** `src/components/DailyHeartbeatBar.vue` zeichnet die Leiste mit
  Tooltip (Datum, Verfügbarkeit, durchschnittlicher Ping). Die Prozentzahl neben
  der Leiste zeigt die Verfügbarkeit über den gewählten Zeitraum. Auf schmalen
  Bildschirmen werden die ältesten Tage ausgeblendet.
- **Texte:** Deutsch (`de-DE`, `de-CH`) und Englisch.

## Dem Umsetzer überlassen

- Genaue Balkenbreiten und Abstände.
- Aufbau des Tooltips.
