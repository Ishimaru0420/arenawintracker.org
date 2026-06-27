# Paket 3: Frontend Quick Wins + QoL

## Was das macht

| QoL-Feature | Umsetzung |
|---|---|
| **Secret-System (Übergang bis RSO)** | `authFetch()` hängt `x-cron-secret`-Header automatisch an |
| **Manueller Sync-Button** | 🔄 oben rechts → `POST /account/me/sync` mit Rate-Limit |
| **Toast-Notifications** | statt `alert()` für Erfolg/Fehler-Meldungen |
| **Dark/Light-Theme-Toggle** | ☀️/🌙 oben rechts, CSS-Variablen, persistiert in localStorage |
| **Tastatur-Shortcuts** | `/` (Suche), `Esc` (Schließen), `S` (Settings), `F` (Freunde), `?` (Hilfe) |
| **Lade-Indikator** | Fullscreen-Loader bei Server-Kaltstart (8s Timeout → Hinweis) |
| **Auto-Refresh** | Alle 5 Min prüfen, ob `lastSync` > 6h alt ist, dann silent Re-fetch |
| **Filter persistieren** | Filter-Text, Sort-Modus, onlyMissing in localStorage |
| **Mobile Long-Press** | 500ms gedrückt halten → Tooltip erscheint (mit Vibration) |
| **Saison-Fortschrittsbalken** | "47/168 Champions gewonnen · 28%" mit visuellem Balken |
| **Mobile-Optimierung** | Breakpoints für Tablet ≤1024, Phone ≤640, Klein ≤400 |
| **Print-Styles** | Sauberer Ausdruck der Stats |
| **Reduced Motion** | Respektiert `prefers-reduced-motion` |

## Dateien in diesem Paket

| Datei | Zweck | Aktion |
|---|---|---|
| `app.js` | Komplette neue Version mit allen QoL-Features | Ersetzt bestehende app/app.js |
| `index.html` | Komplette neue Version mit Sync-Button + Theme-Toggle + Progress-Bar | Ersetzt bestehende app/index.html |
| `theme.css` | NEU: Dark/Light-Variablen + Button-Styles | Neue Datei in app/ |
| `mobile.css` | NEU: Responsive Breakpoints | Neue Datei in app/ |

## Setup-Schritte (ca. 2–3 Stunden)

### 1. Dateien ins Frontend-Repo kopieren

```bash
cd /pfad/zu/arenawintracker.org-main/app

# Neue CSS-Dateien
cp /pfad/zum/download/INSTALL/03-frontend-qol/theme.css .
cp /pfad/zum/download/INSTALL/03-frontend-qol/mobile.css .

# Bestehende Dateien ersetzen
cp /pfad/zum/download/INSTALL/03-frontend-qol/app.js .
cp /pfad/zum/download/INSTALL/03-frontend-qol/index.html .
```

### 2. app.css bleibt unverändert

Die bestehende `app.css` brauchst du **nicht** zu ändern. Die neuen Theme-
Variablen aus `theme.css` überschreiben die hardcodierten Farben aus `app.css`
via `!important` (siehe `theme.css`-Kommentare).

### 3. Sicherstellen, dass Paket 2 (Backend) deployed ist

Das Frontend mit `authFetch()` funktioniert nur, wenn das Backend die
`x-cron-secret`-Header-Prüfung macht. Stelle sicher, dass Paket 2
(Backend Quick Wins) deployed ist **bevor** du dieses Frontend live nimmst.

Sonst: Frontend schickt Secret-Header, Backend ignoriert es (alte Version
ohne `requireCronSecret`) → funktioniert zufällig, aber Privacy ist nicht
durchgesetzt.

### 4. Secret im Browser setzen

Beim ersten Öffnen der neuen App erscheint ein Banner oben:

> 🔐 Um die Web-App zu nutzen, bitte das Sync-Passwort eingeben
> (Übergang bis Riot-Login steht)

Nutzer trägt das `CRON_SECRET` ein (dasselbe wie in Render-Umgebungsvariablen),
wird in `localStorage` gespeichert, Banner verschwindet.

**Hinweis:** Das ist bewusst eine Übergangslösung. Das Secret ist im Browser
sichtbar (DevTools → Application → Local Storage). Echter Schutz kommt erst
mit RSO (Paket 1 aus der Erklärung).

### 5. Lokal testen

Einfach `index.html` im Browser öffnen (oder lokalen Webserver starten):

```bash
cd /pfad/zu/arenawintracker.org-main/app
python3 -m http.server 8080
# dann http://localhost:8080/ im Browser öffnen
```

Test-Checkliste:
- [ ] Theme-Toggle (☀️/🌙) klickt, Farben wechseln flüssig, Auswahl bleibt nach Reload
- [ ] Sync-Button (🔄) klickt, Spinner, Toast „Sync fertig"
- [ ] Tastatur: `/` fokussiert Suche, `Esc` schließt nacheinander alles, `S` toggle Settings
- [ ] Mobile (Chrome DevTools → Toggle Device Toolbar → iPhone 12):
  - Grid 4 Spalten statt 8
  - Settings öffnen als Bottom-Sheet
  - Long-Press auf Champion → Tooltip
- [ ] Filter/Sort/onlyMissing bleiben nach Reload erhalten
- [ ] Saison-Fortschrittsbalken zeigt richtige Werte
- [ ] Toast-Notifications erscheinen oben rechts, verschwinden nach 4s

### 6. Push & Deploy

```bash
git add app/app.js app/index.html app/theme.css app/mobile.css
git commit -m "feat: frontend QoL - theme toggle + mobile + shortcuts + loader + auto-refresh"
git push
```

GitHub Pages / Cloudflare Pages deployed automatisch. Cache-Busting durch
`v=18` in `index.html` (statt `v=17` vorher) stellt sicher, dass Browser
den neuen Code laden.

## Wichtige Hinweise

### authFetch() statt fetch()

Alle Server-Calls wurden von `fetch(serverUrl(...))` auf
`authFetch(serverUrl(...))` umgestellt. `authFetch` hängt automatisch den
`x-cron-secret`-Header an, falls ein Secret in localStorage liegt.

**Ausnahmen** (bleiben `fetch`):
- Data Dragon Calls (`https://ddragon.leagueoflegends.com/...`) – öffentlich, kein Secret nötig

Betroffene Funktionen (alle nutzen jetzt authFetch):
- `registerWithServer()`
- `fetchStatsFromServer()`
- `updateSeasonOnServer()`
- `loadMetaData()`
- `loadCommunityTierMap()`
- `loadFriends()` / `addFriend()` / `removeFriend()`
- `loadRanking()`
- `openPlayerView()` (Stats-Abruf für其他 Spieler)
- `updatePlayerViewFriendButton()`
- `loadCommunityDbSection()` / `loadCommunityAiSection()` / `loadAiMetaSection()`
- `loadRegisteredUsers()` (für Freundes-Autocomplete)

### Theme-Toggle: wie es funktioniert

- `<html data-theme="dark">` (default) oder `<html data-theme="light">`
- `theme.css` definiert CSS-Variablen (`--awt-bg`, `--awt-text`, etc.) für beide Themes
- Alle wichtigen Elemente nutzen `var(--awt-...)` statt hardcoded Farben
- Auswahl in `localStorage["arenaWinTrackerTheme"]` gespeichert
- Bei Reload: `applyTheme(getCurrentTheme())` setzt Attribut sofort

**Hinweis:** Die bestehende `app.css` hat noch viele hardcoded Farben.
`theme.css` überschreibt diese mit `!important`. Das ist nicht elegant,
funktioniert aber zuverlässig. Langfristig (Next.js-Migration) sollten
die hardcodierten Farben direkt durch Variablen ersetzt werden.

### Mobile-Layout: was sich ändert

| Breakpoint | Änderung |
|---|---|
| ≤1024px (Tablet) | 6er-Grid statt 8er, Ranking unterhalb statt nebenan |
| ≤640px (Phone) | 4er-Grid, Settings als Bottom-Sheet, Touch-Long-Press |
| ≤400px (Klein) | 3er-Grid, kleinere Icons |
| Touch-Geräte | Hover-Effekte deaktiviert |

### Cache-Busting nicht vergessen

In `index.html` sind die Versionsnummern hochgezählt:
- `app.css?v=17` → `v=18`
- `app.js?v=17` → `v=18`
- Neue Dateien: `theme.css?v=1`, `mobile.css?v=1`

Sonst laden Browser den alten Code aus dem Cache.

### Was noch aussteht (nicht in diesem Paket)

- **Onboarding-Tutorial** für erste Nutzer – UI-Design-Frage
- **Win-Animation** (Pulse, wenn Champion von rot → grün wechselt)
- **PWA / Offline-Modus** (Service-Worker) – größerer Umbau
- **Next.js-Migration** – grundsätzliche Architektur-Entscheidung
- **RSO-Login** – siehe `01-auth-erklaerung/` (Paket 1 aus der Erklärung)

## Kombination mit anderen Paketen

Dieses Paket funktioniert zusammen mit:
- **Paket 1 (Trio-Automation)** – kein Frontend-Change nötig, nur Backend
- **Paket 2 (Backend Quick Wins)** – MUSS deployt sein, sonst funktionieren
  die `authFetch()`-Calls nicht (Backend prüft Secret-Header)

**Empfohlene Reihenfolge:**
1. Paket 1 (Trio-Automation) – in sich geschlossen
2. Paket 2 (Backend Quick Wins) – Voraussetzung für Paket 3
3. Paket 3 (Frontend QoL) – dieses Paket
