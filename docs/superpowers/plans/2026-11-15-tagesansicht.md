# Tagesansicht Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Statusseite zeigt pro Monitor einen Balken pro Tag über 90, 180 oder 365 Tage.

**Architecture:** Eine neue Spalte an der Statusseite schaltet die Ansicht ein. Ein neuer Endpunkt liefert Tageswerte aus dem `UptimeCalculator`; eine neue Vue-Komponente zeichnet sie. Ein dünnes Docker-Image legt die Änderungen über das offizielle Image.

**Tech Stack:** Node.js, Express, Knex, Vue 3, node:test, Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-15-tagesansicht-design.md`

## Global Constraints

- Basis ist der Tag `2.5.11`; bei `dailyViewDays = 0` bleibt das Verhalten des Originals.
- Erlaubte Werte für `dailyViewDays`: 0 bis 365, ganzzahlig.
- Schwelle Orange/Rot: Verfügbarkeit 0.95.
- Sichtbare deutsche Texte mit ä/ö/ü.
- Keine SQL-Dialekt-abhängigen Abfragen.

## Review Focus

- Monitor ohne jede Statistik: Leiste zeigt nur graue Balken, Prozentzahl «N/A».
- `dailyViewDays` als Text, negativ, über 365 oder `null`: wird auf 0 bis 365 begrenzt.
- Tag mit nur Wartung: blau, zählt nicht in die Verfügbarkeit.
- Schmaler Bildschirm mit 365 Tagen: älteste Tage ausgeblendet, kein Überlauf.
- Statusseite im Bearbeitungsmodus: Leiste erscheint auch dort.

---

### Task 1: Tageslogik

**Files:**
- Create: `server/daily-view.js`
- Test: `test/backend-test/test-daily-view.js`

**Interfaces:**
- Produces: `normalizeDailyViewDays(value): number`,
  `classifyDay(data): "up"|"partial"|"down"|"maintenance"|"missing"`,
  `buildDailyList(dataArray, days, todayKey): Array<{date, status, uptime, ping, up, down, maintenance}>` (älteste zuerst, Länge `days`),
  `periodUptime(list): number|null`.

- [ ] Tests schreiben (Grenzwerte 0.95, Wartung, fehlende Tage, Begrenzung), fehlschlagen lassen
- [ ] Modul implementieren, Tests grün
- [ ] Commit

### Task 2: Datenbank, Modell, Endpunkt

**Files:**
- Create: `db/knex_migrations/2026-11-15-0000-status-page-daily-view.js`
- Modify: `server/model/status_page.js` (toJSON, toPublicJSON: `dailyViewDays`)
- Modify: `server/socket-handlers/status-page-socket-handler.js` (speichern)
- Modify: `server/routers/status-page-router.js` (`GET /api/status-page/heartbeat-daily/:slug`)

**Interfaces:**
- Consumes: Task 1.
- Produces: Antwort `{ days, dailyList: { [monitorID]: [...] }, uptimeList: { [monitorID + "_daily"]: number|null } }`.

- [ ] Migration, Modell, Speichern, Endpunkt
- [ ] Commit

### Task 3: Oberfläche

**Files:**
- Create: `src/components/DailyHeartbeatBar.vue`
- Modify: `src/components/PublicGroupList.vue`, `src/pages/StatusPage.vue`, `src/mixins/socket.js`
- Modify: `src/lang/en.json`, `src/lang/de-DE.json`, `src/lang/de-CH.json`

**Interfaces:**
- Consumes: Antwort aus Task 2; `$root.dailyHeartbeatList`.

- [ ] Komponente, Einbindung, Einstellung, Texte
- [ ] `npm run build` und Lint ohne Fehler
- [ ] Commit

### Task 4: Image

**Files:**
- Create: `docker/tagesansicht.dockerfile`, `.github/workflows/tagesansicht-image.yml`
- Delete: Workflows des Originals
- Modify: `README.md` (Hinweis auf den Fork)

- [ ] Dockerfile und Workflow
- [ ] Commit, Push, Workflow läuft durch

### Task 5: Prüfung

- [ ] Lokal aus dem Quellcode starten, Testdaten anlegen, Statusseite mit 90/180/365 Tagen prüfen
- [ ] Hell, dunkel und schmale Breite prüfen
