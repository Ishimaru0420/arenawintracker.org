// ============================================================
// Arena Win Tracker - overlay.js
//
// WICHTIGE AENDERUNG: Die App spricht NICHT MEHR direkt mit der
// Riot-API. Stattdessen laeuft der gesamte Riot-API-Zugriff auf
// einem zentralen Server (siehe "Arena Win Tracker Server"-Projekt).
// Diese App ist jetzt nur noch ein duenner Client, der:
//   1. die eigene Riot-ID beim Server registriert
//   2. die bereits gesyncten Stats vom Server abruft
//   3. optional einen sofortigen Sync anstoesst (statt auf den
//      naechsten taeglichen Cron-Lauf zu warten)
//
// Vorteil: kein eigener Riot API-Key mehr in der App noetig, kein
// 24h-Ablauf-Problem mehr fuer einzelne Nutzer.
// ============================================================

const STORAGE_KEY = "arenaWinTracker";
const LANG_STORAGE_KEY = "arenaWinTrackerLang";
const DEFAULT_SERVER_URL = "https://arena-win-tracker-server.onrender.com";

// ---------- Uebersetzungen (DE/EN) ----------

const I18N = {
  de: {
    rankingToggleTitle: "Ranking anzeigen",
    tabGlobal: "Global",
    tabFriends: "Freunde",
    rankingUpdateNote: "🕕 Update alle 6 Std.",
    friendsToggleTitle: "Freunde verwalten",
    settingsToggleTitle: "Einstellungen",
    webNotice: "Browser-Testversion. Funktioniert identisch zur Overwolf-App, läuft aber als normale Webseite - kein Overwolf nötig.",
    friendIdLabel: "Riot-ID des Freundes",
    friendIdPlaceholder: "z.B. Buddy#EUW",
    addFriendBtn: "+ Freund hinzufügen",
    registeredUsersHint: "Bereits registrierte Nutzer (anklicken zum Hinzufügen):",
    yourFriendsHint: "Deine Freunde:",
    riotIdLabel: "Riot ID (Name#Tag)",
    riotIdPlaceholder: "z.B. Glitch#EUW",
    regionLabel: "Region",
    seasonStartLabel: "Season-Start (Arena-Reset Datum)",
    resetSeasonStartBtn: "↺ Standard",
    resetSeasonStartTitle: "Auf Standard zurücksetzen (29.04.2026)",
    saveSettingsBtn: "Speichern",
    resetDataBtn: "Lokale Anzeige zurücksetzen",
    settingsHint: "Server synct deine Daten automatisch alle 6 Stunden - kein eigener Riot API-Key nötig.",
    statusNotConnected: "Noch nicht verbunden",
    champSearchPlaceholder: "Champion suchen...",
    sortName: "Name (A-Z)",
    sortWins: "Meiste Wins",
    onlyMissingLabel: "nur offene zeigen",
    metaTitle: "📊 Tages-Meta",
    metaTrioHeading: "Beste Trio-Combos",
    metaSynergyHeading: "Augment/Item-Synergien",
    addFriendBtnShort: "+ Freund",
    closeTitle: "Schließen",

    statusEnterRiotIdServer: "Bitte Riot-ID und Server-URL eintragen.",
    statusConnecting: "Verbinde mit Server (kann beim ersten Mal bis zu 60s dauern)...",
    statusLoadingStats: "Lade Stats vom Server...",
    statusConnected: "Verbunden. Letzter Server-Sync: {time}",
    errorPrefix: "Fehler: ",
    statusSeasonUpdateError: "Fehler beim Aktualisieren des Season-Start: {msg}",
    statusResetDone: "Lokale Anzeige zurückgesetzt. Lädt automatisch beim nächsten Server-Sync neu.",
    statusAddFriendNeedRiotId: "Bitte zuerst deine eigene Riot-ID in den Einstellungen eintragen.",
    statusLoadingChampList: "Champion-Liste wird geladen...",
    statusReadyFillSettings: "Bereit. Einstellungen ausfüllen (Riot-ID, Region).",
    neverSynced: "noch nie",
    summaryWon: "{won} / {total} Champions gewonnen",
    overallStats: "{games} Spiel(e) insgesamt ({wins} Siege / {losses} Niederlagen)",
    tooltipNoGames: "Keine Arena-Spiele seit Season-Start.",
    tooltipGamesCount: "{count} Spiel(e) seit {date}",
    tooltipWin: "Sieg",
    tooltipLose: "Niederlage",
    placementSuffix: "(Platz {n})",
    withLabel: "mit",
    metaUpdatedAt: "Stand: {time}",
    friendEmpty: "Noch keine Freunde hinzugefügt.",
    removeFriendTitle: "Entfernen",
    friendAddFailed: "Freund konnte nicht hinzugefügt werden.",
    friendRemoveFailed: "Entfernen fehlgeschlagen.",
    rankNotRegistered404: "Noch nicht registriert. Erst Einstellungen speichern.",
    rankLoading: "Lade...",
    rankNeedOwnId: "Erst eigene Riot-ID in den Einstellungen eintragen.",
    rankLoadFailed: "Ranking konnte nicht geladen werden.",
    rankEmptyData: "Noch keine Daten.",
    opggOpenTitle: "op.gg öffnen",
    progressTitle: "Fortschritt anzeigen",
    statsLoadFailed: "Stats konnten nicht geladen werden.",
    friendAlready: "✓ Freund",
    seasonUpdateFailed: "Season-Start-Update fehlgeschlagen ({status})",
    registrationFailed: "Registrierung fehlgeschlagen ({status})",
    statsFetchFailed: "Stats-Abruf fehlgeschlagen ({status})",
    resetConfirm: "Lokal angezeigte Daten wirklich zurücksetzen? (Auf dem Server bleiben sie erhalten)",
    playerViewSummary: "{won} / {total} Champions gewonnen · {games} Spiel(e) ({wins} Siege)",
    playerViewLastSync: " · letzter Sync: {time}"
  },
  en: {
    rankingToggleTitle: "Show ranking",
    tabGlobal: "Global",
    tabFriends: "Friends",
    rankingUpdateNote: "🕕 Updates every 6h",
    friendsToggleTitle: "Manage friends",
    settingsToggleTitle: "Settings",
    webNotice: "Browser test version. Works identically to the Overwolf app, but runs as a normal website - no Overwolf needed.",
    friendIdLabel: "Friend's Riot ID",
    friendIdPlaceholder: "e.g. Buddy#EUW",
    addFriendBtn: "+ Add friend",
    registeredUsersHint: "Already registered users (click to add):",
    yourFriendsHint: "Your friends:",
    riotIdLabel: "Riot ID (Name#Tag)",
    riotIdPlaceholder: "e.g. Glitch#EUW",
    regionLabel: "Region",
    seasonStartLabel: "Season start (Arena reset date)",
    resetSeasonStartBtn: "↺ Default",
    resetSeasonStartTitle: "Reset to default (Apr 29, 2026)",
    saveSettingsBtn: "Save",
    resetDataBtn: "Reset local display",
    settingsHint: "Server automatically syncs your data every 6 hours - no own Riot API key needed.",
    statusNotConnected: "Not connected yet",
    champSearchPlaceholder: "Search champion...",
    sortName: "Name (A-Z)",
    sortWins: "Most wins",
    onlyMissingLabel: "show only missing",
    metaTitle: "📊 Daily meta",
    metaTrioHeading: "Best trio combos",
    metaSynergyHeading: "Augment/item synergies",
    addFriendBtnShort: "+ Friend",
    closeTitle: "Close",

    statusEnterRiotIdServer: "Please enter Riot ID and server URL.",
    statusConnecting: "Connecting to server (can take up to 60s the first time)...",
    statusLoadingStats: "Loading stats from server...",
    statusConnected: "Connected. Last server sync: {time}",
    errorPrefix: "Error: ",
    statusSeasonUpdateError: "Error updating season start: {msg}",
    statusResetDone: "Local display reset. Will reload automatically on the next server sync.",
    statusAddFriendNeedRiotId: "Please enter your own Riot ID in the settings first.",
    statusLoadingChampList: "Loading champion list...",
    statusReadyFillSettings: "Ready. Fill in settings (Riot ID, region).",
    neverSynced: "never",
    summaryWon: "{won} / {total} champions won",
    overallStats: "{games} game(s) total ({wins} wins / {losses} losses)",
    tooltipNoGames: "No Arena games since season start.",
    tooltipGamesCount: "{count} game(s) since {date}",
    tooltipWin: "Win",
    tooltipLose: "Loss",
    placementSuffix: "(rank {n})",
    withLabel: "with",
    metaUpdatedAt: "Updated: {time}",
    friendEmpty: "No friends added yet.",
    removeFriendTitle: "Remove",
    friendAddFailed: "Could not add friend.",
    friendRemoveFailed: "Removal failed.",
    rankNotRegistered404: "Not registered yet. Save settings first.",
    rankLoading: "Loading...",
    rankNeedOwnId: "Enter your own Riot ID in settings first.",
    rankLoadFailed: "Could not load ranking.",
    rankEmptyData: "No data yet.",
    opggOpenTitle: "Open op.gg",
    progressTitle: "Show progress",
    statsLoadFailed: "Could not load stats.",
    friendAlready: "✓ Friend",
    seasonUpdateFailed: "Season start update failed ({status})",
    registrationFailed: "Registration failed ({status})",
    statsFetchFailed: "Stats fetch failed ({status})",
    resetConfirm: "Really reset locally displayed data? (Stays intact on the server)",
    playerViewSummary: "{won} / {total} champions won · {games} game(s) ({wins} wins)",
    playerViewLastSync: " · last sync: {time}"
  }
};

let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || "de";

// Setzt einen Event-Handler nur, wenn das Element wirklich existiert.
// Verhindert, dass EIN fehlendes/falsch benanntes Element (z.B. durch
// eine veraltete index.html) das GESAMTE restliche Skript zum Absturz
// bringt - ohne diese Absicherung wuerde ein einzelner Tippfehler oder
// ein Versions-Mismatch dazu fuehren, dass die komplette App leer bleibt.
function safeBind(id, prop, handler) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`safeBind: Element #${id} nicht gefunden - "${prop}" wurde NICHT gesetzt.`);
    return;
  }
  if (prop === "addEventListener") {
    el.addEventListener(handler.event, handler.fn);
  } else {
    el[prop] = handler;
  }
}

function safeSetValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
  else console.warn(`safeSetValue: Element #${id} nicht gefunden.`);
}

// Holt einen uebersetzten String und ersetzt {platzhalter} mit Werten aus vars.
function t(key, vars) {
  const str = (I18N[currentLang] && I18N[currentLang][key]) || I18N.de[key] || key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

// Wendet die Uebersetzung auf alle statisch markierten Elemente an
// (data-i18n fuer Textinhalt, data-i18n-placeholder, data-i18n-title).
function applyStaticTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.getAttribute("data-i18n-title"));
  });
  document.getElementById("langToggle").textContent = currentLang === "de" ? "EN" : "DE";
  document.documentElement.lang = currentLang;
}

// Rahmen-Stufen je nach Anzahl Erster-Plaetze mit einem Champion.
const WIN_TIERS = [
  { min: 50, class: "tier-gold" },
  { min: 25, class: "tier-silver" },
  { min: 10, class: "tier-bronze" }
];

function getTierClass(winCount) {
  for (const tier of WIN_TIERS) {
    if (winCount >= tier.min) return tier.class;
  }
  return "";
}

// Win-Count kommt jetzt direkt vom Server (dort beim Sync mitgezaehlt),
// kein erneutes Durchsuchen der matchHistory im Client mehr noetig.
function getWinCount(champKey) {
  return state.winCounts[champKey] || 0;
}

let state = loadState();
let championList = []; // [{id, name, key}] aus Data Dragon
let championByApiName = {}; // { "Ahri": {icon, name}, "MonkeyKing": {...}, ... } - id ist Riots interner Name
let lastFriendsList = null; // zuletzt geladene Freundesliste, fuer Re-Render bei Sprachwechsel

// ---------- Persistenz ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch (e) {
    return defaultState();
  }
}

function defaultState() {
  return {
    riotId: "",
    region: "europe",
    serverUrl: DEFAULT_SERVER_URL,
    seasonStart: "2026-04-29",
    wins: {},          // { championKey: true } - kommt vom Server
    winCounts: {},     // { championKey: Anzahl Erster-Plaetze } - kommt vom Server
    matchHistory: {},  // { championKey: [...] } - kommt vom Server
    lastSync: null
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- UI Init ----------

safeSetValue("riotId", state.riotId);
safeSetValue("region", state.region);
safeSetValue("seasonStart", state.seasonStart);

applyStaticTranslations();

safeBind("langToggle", "onclick", () => {
  currentLang = currentLang === "de" ? "en" : "de";
  localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  applyStaticTranslations();
  // Dynamisch erzeugte Inhalte muessen separat neu gerendert werden,
  // da sie nicht ueber data-i18n-Attribute laufen.
  renderGrid();
  if (lastFriendsList) renderFriendsList(lastFriendsList);
  if (rankingLoadedOnce && !document.getElementById("rankingBox").classList.contains("hidden")) {
    loadRanking(currentRankingMode);
  }
  if (viewedPlayerStats) renderPlayerViewGrid();
});

const DEFAULT_SEASON_START = "2026-04-29";
safeBind("resetSeasonStart", "onclick", () => {
  safeSetValue("seasonStart", DEFAULT_SEASON_START);
});

safeBind("settingsToggle", "onclick", () => {
  document.getElementById("settingsPanel").classList.toggle("hidden");
});

safeBind("friendsToggle", "onclick", () => {
  document.getElementById("friendsPanel").classList.toggle("hidden");
});

safeBind("saveSettings", "onclick", async () => {
  state.riotId = document.getElementById("riotId").value.trim();
  state.region = document.getElementById("region").value;
  const newSeasonStart = document.getElementById("seasonStart").value;
  const seasonStartChanged = newSeasonStart !== state.seasonStart;
  state.seasonStart = newSeasonStart;
  saveState();
  document.getElementById("settingsPanel").classList.add("hidden");
  await registerAndLoad();
  if (seasonStartChanged) await updateSeasonOnServer();
  loadMetaData();
  loadFriends();
});

safeBind("resetData", "onclick", () => {
  if (!confirm(t("resetConfirm"))) return;
  state.wins = {};
  state.winCounts = {};
  state.matchHistory = {};
  state.lastSync = null;
  saveState();
  renderGrid();
  setStatus(t("statusResetDone"));
});

safeBind("filterInput", "oninput", renderGrid);
safeBind("onlyMissing", "onchange", renderGrid);
safeBind("sortMode", "onchange", renderGrid);

function setStatus(text) {
  document.getElementById("statusText").textContent = text;
}

// ---------- Data Dragon: Champion-Liste ----------
// (unveraendert - das ist oeffentliches Spiel-Datenmaterial, kein
// Riot-API-Key noetig, bleibt deshalb client-seitig)

async function loadChampionList() {
  const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  const versions = await versionsRes.json();
  const latest = versions[0];

  const champRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${latest}/data/de_DE/champion.json`
  );
  const champData = await champRes.json();

  championList = Object.values(champData.data)
    .map((c) => ({
      key: c.key,
      id: c.id,
      name: c.name,
      icon: `https://ddragon.leagueoflegends.com/cdn/${latest}/img/champion/${c.image.full}`
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Lookup nach Riots internem API-Namen (z.B. "MonkeyKing" fuer Wukong) -
  // genau das liefert match.info.participants[].championName, mit dem
  // die Teammates in der matchHistory gespeichert sind.
  championByApiName = {};
  for (const c of championList) {
    championByApiName[c.id] = c;
  }
}

// ---------- Server-Kommunikation ----------

function serverUrl(path) {
  return `${state.serverUrl}${path}`;
}

// Registriert die Riot-ID beim Server (idempotent - schadet nicht,
// wenn der Nutzer schon existiert).
async function registerWithServer() {
  const res = await fetch(serverUrl("/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      riotId: state.riotId,
      region: state.region,
      seasonStart: state.seasonStart
    })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || t("registrationFailed", { status: res.status }));
  }
  return res.json();
}

// Holt die zuletzt gesyncten Stats vom Server (kein Riot-Aufruf hier,
// nur ein Datenbank-Abruf - entsprechend schnell).
async function fetchStatsFromServer() {
  const encodedId = encodeURIComponent(state.riotId);
  const res = await fetch(serverUrl(`/stats/${encodedId}`));
  if (res.status === 404) {
    throw new Error(t("rankNotRegistered404"));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || t("statsFetchFailed", { status: res.status }));
  }
  return res.json();
}

// Aktualisiert NUR das Season-Start-Datum auf dem Server. Eigener
// Endpunkt, weil POST /register idempotent ist und das Datum bei
// einem bereits registrierten Nutzer sonst nie aktualisieren wuerde.
async function updateSeasonOnServer() {
  try {
    const encodedId = encodeURIComponent(state.riotId);
    const res = await fetch(serverUrl(`/season/${encodedId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seasonStart: state.seasonStart })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || t("seasonUpdateFailed", { status: res.status }));
    }
  } catch (err) {
    console.error(err);
    setStatus(t("statusSeasonUpdateError", { msg: err.message }));
  }
}

// ---------- Ablauf: Registrieren + Laden ----------

async function registerAndLoad() {
  if (!state.riotId || !state.serverUrl) {
    setStatus(t("statusEnterRiotIdServer"));
    document.getElementById("settingsPanel").classList.remove("hidden");
    return;
  }
  try {
    setStatus(t("statusConnecting"));
    await registerWithServer();
    setStatus(t("statusLoadingStats"));
    const stats = await fetchStatsFromServer();
    applyStats(stats);
    setStatus(t("statusConnected", { time: formatLastSync(stats.lastSync) }));
  } catch (err) {
    console.error(err);
    setStatus(t("errorPrefix") + err.message);
  }
}

function applyStats(stats) {
  state.wins = stats.wins || {};
  state.winCounts = stats.winCounts || {};
  state.matchHistory = stats.matchHistory || {};
  state.lastSync = stats.lastSync || null;
  saveState();
  renderGrid();
}

function formatLastSync(lastSync) {
  return lastSync ? new Date(lastSync).toLocaleString(currentLang === "de" ? "de-DE" : "en-US") : t("neverSynced");
}

// ---------- Rendering ----------

function renderGrid() {
  const grid = document.getElementById("grid");
  const filterText = document.getElementById("filterInput").value.toLowerCase();
  const onlyMissing = document.getElementById("onlyMissing").checked;
  const sortMode = document.getElementById("sortMode").value;

  grid.innerHTML = "";
  let wonCount = 0;

  let visible = championList.filter((c) => c.name.toLowerCase().includes(filterText));

  if (sortMode === "wins") {
    // Meiste Wins zuerst, bei Gleichstand alphabetisch (stabil/vorhersehbar).
    visible = visible.slice().sort((a, b) => {
      const diff = getWinCount(b.key) - getWinCount(a.key);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
  }

  for (const champ of visible) {
    const winCount = getWinCount(champ.key);
    const hasWin = winCount > 0;
    const hasGames = !!(state.matchHistory[champ.key] && state.matchHistory[champ.key].length > 0);
    if (hasWin) wonCount++;
    if (onlyMissing && hasWin) continue;

    // Drei Status: "won" (gruen, mind. 1 Sieg), "lost" (rot, gespielt
    // aber noch kein Sieg), "missing" (grau, noch nie gespielt).
    let status;
    if (hasWin) status = "won";
    else if (hasGames) status = "lost";
    else status = "missing";

    const tierClass = getTierClass(winCount);

    const div = document.createElement("div");
    div.className = "champ " + status + (tierClass ? " " + tierClass : "");
    div.innerHTML = `
      <img src="${champ.icon}" alt="${champ.name}" />
      ${hasWin ? `<span class="winBadge">${winCount}</span>` : ""}
      <span>${champ.name}</span>
    `;
    div.addEventListener("mouseenter", (e) => showChampTooltip(e, champ));
    div.addEventListener("mousemove", positionTooltip);
    div.addEventListener("mouseleave", hideChampTooltip);
    grid.appendChild(div);
  }

  document.getElementById("summaryText").textContent =
    t("summaryWon", { won: wonCount, total: championList.length });

  updateOverallStats();
}

// Zaehlt ALLE Arena-Spiele ueber alle Champions hinweg (unabhaengig
// vom aktuellen Filter), inkl. Aufschluesselung Sieg/Niederlage.
function updateOverallStats() {
  let totalGames = 0;
  let totalWins = 0;

  for (const champKey in state.matchHistory) {
    const games = state.matchHistory[champKey] || [];
    totalGames += games.length;
    totalWins += games.filter((g) => g.placement === 1).length;
  }

  const totalLosses = totalGames - totalWins;

  document.getElementById("overallStatsText").textContent =
    t("overallStats", { games: totalGames, wins: totalWins, losses: totalLosses });
}

// ---------- Hover-Tooltip: Match-History pro Champion ----------

function showChampTooltip(e, champ) {
  const tooltip = document.getElementById("champTooltip");
  const history = (state.matchHistory[champ.key] || [])
    .slice()
    .sort((a, b) => b.date - a.date);

  let html = `<div class="tooltipTitle">${champ.name}</div>`;

  if (history.length === 0) {
    html += `<div class="tooltipEmpty">${t("tooltipNoGames")}</div>`;
  } else {
    html += `<div class="tooltipCount">${t("tooltipGamesCount", { count: history.length, date: formatSeasonStart() })}</div>`;
    html += `<ul class="tooltipList">`;
    const dateLocale = currentLang === "de" ? "de-DE" : "en-US";
    for (const g of history) {
      const isWin = g.placement === 1;
      const dateStr = new Date(g.date).toLocaleDateString(dateLocale, { day: "2-digit", month: "2-digit" });
      const placementBadge = `<span class="placementBadge ${isWin ? "placementWin" : "placementLose"}">${g.placement}</span>`;
      const mates = g.teammates && g.teammates.length
        ? g.teammates.map((m) => {
            const champData = championByApiName[m.champion];
            const icon = champData
              ? `<img src="${champData.icon}" alt="${champData.name}" />`
              : "";
            return `<span class="tooltipMate">${icon}${m.summoner}</span>`;
          }).join("")
        : "?";
      html += `<li class="${isWin ? "tooltipWin" : "tooltipLose"}">
        <div class="tooltipDate">${dateStr} ${placementBadge}</div>
        <div class="tooltipMates">${mates}</div>
      </li>`;
    }
    html += `</ul>`;
  }

  tooltip.innerHTML = html;
  tooltip.classList.remove("hidden");
  positionTooltip(e);
}

function positionTooltip(e) {
  const tooltip = document.getElementById("champTooltip");
  const offset = 14;
  let x = e.clientX + offset;
  let y = e.clientY + offset;

  const rect = tooltip.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - offset;
  if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - offset;

  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

function hideChampTooltip() {
  document.getElementById("champTooltip").classList.add("hidden");
}

function formatSeasonStart() {
  return state.seasonStart
    ? new Date(state.seasonStart).toLocaleDateString("de-DE")
    : "Season-Start";
}

// ---------- Tages-Meta: Trio-Combos & Augment/Item-Synergien ----------
// Tagesaktuelle Community-Daten (taeglich vom Server via metasrc.com
// aktualisiert) - rein informativ, KEINE Live-Erkennung im Spiel.

async function loadMetaData() {
  try {
    const res = await fetch(serverUrl("/meta"));
    if (!res.ok) return; // noch keine Daten vorhanden, einfach ausblenden
    const data = await res.json();
    renderMeta(data);
  } catch (err) {
    console.error("Meta-Daten konnten nicht geladen werden:", err);
  }
}

function renderMeta(data) {
  const section = document.getElementById("metaSection");
  const comboList = document.getElementById("comboList");
  const synergyList = document.getElementById("synergyList");

  comboList.innerHTML = "";
  for (const combo of data.trioCombos || []) {
    const div = document.createElement("div");
    div.className = "metaItem";
    const partners = combo.partners && combo.partners.length
      ? combo.partners.join(" + ")
      : "-";
    div.innerHTML = `
      <span class="metaTier">${combo.tier}</span>
      <span class="metaName">${combo.champion}</span>
      <span class="metaPartners">${t("withLabel")} ${partners}</span>
    `;
    comboList.appendChild(div);
  }

  synergyList.innerHTML = "";
  for (const champName in (data.augmentSynergies || {})) {
    const augments = data.augmentSynergies[champName];
    const div = document.createElement("div");
    div.className = "metaItem";
    const augText = augments.map((a) => `${a.name} (${a.rarity})`).join(", ");
    div.innerHTML = `
      <span class="metaName">${champName}</span>
      <span class="metaPartners">${augText}</span>
    `;
    synergyList.appendChild(div);
  }

  if ((data.trioCombos && data.trioCombos.length) || Object.keys(data.augmentSynergies || {}).length) {
    section.classList.remove("hidden");
  }

  document.getElementById("metaUpdatedText").textContent = data.updatedAt
    ? t("metaUpdatedAt", { time: new Date(data.updatedAt).toLocaleString(currentLang === "de" ? "de-DE" : "en-US") })
    : "";
}

// ---------- Freunde ----------

async function loadFriends() {
  if (!state.riotId || !state.serverUrl) return;
  try {
    const res = await fetch(serverUrl(`/friends/${encodeURIComponent(state.riotId)}`));
    if (!res.ok) return;
    const data = await res.json();
    lastFriendsList = data.friends || [];
    renderFriendsList(lastFriendsList);
  } catch (err) {
    console.error("Freunde konnten nicht geladen werden:", err);
  }
}

function renderFriendsList(friends) {
  lastFriendsList = friends;
  const list = document.getElementById("friendsList");
  list.innerHTML = "";
  if (friends.length === 0) {
    list.innerHTML = `<li class="friendEmpty">${t("friendEmpty")}</li>`;
    return;
  }
  for (const friendId of friends) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${friendId}</span><button class="removeFriendBtn" title="${t("removeFriendTitle")}">✕</button>`;
    li.querySelector(".removeFriendBtn").onclick = () => removeFriend(friendId);
    list.appendChild(li);
  }
}

async function addFriend(friendRiotIdParam) {
  const input = document.getElementById("friendIdInput");
  const friendRiotId = friendRiotIdParam || input.value.trim();
  if (!friendRiotId) return;
  if (!state.riotId) {
    setStatus(t("statusAddFriendNeedRiotId"));
    return;
  }
  try {
    const res = await fetch(serverUrl(`/friends/${encodeURIComponent(state.riotId)}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendRiotId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t("friendAddFailed"));
    if (!friendRiotIdParam) input.value = "";
    renderFriendsList(data.friends || []);
    if (currentRankingMode === "friends") loadRanking("friends");
    return data.friends || [];
  } catch (err) {
    console.error(err);
    setStatus(t("errorPrefix") + err.message);
    return null;
  }
}

async function removeFriend(friendRiotId) {
  try {
    const res = await fetch(
      serverUrl(`/friends/${encodeURIComponent(state.riotId)}/${encodeURIComponent(friendRiotId)}`),
      { method: "DELETE" }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t("friendRemoveFailed"));
    renderFriendsList(data.friends || []);
    if (currentRankingMode === "friends") loadRanking("friends");
  } catch (err) {
    console.error(err);
    setStatus(t("errorPrefix") + err.message);
  }
}

safeBind("addFriendBtn", "onclick", addFriend);
safeBind("friendIdInput", "addEventListener", { event: "keydown", fn: (e) => {
  if (e.key === "Enter") addFriend();
} });

// ---------- Ranking ----------

let currentRankingMode = "global";
let rankingLoadedOnce = false;

safeBind("rankingToggle", "onclick", () => {
  const box = document.getElementById("rankingBox");
  box.classList.toggle("hidden");
  if (!box.classList.contains("hidden") && !rankingLoadedOnce) {
    rankingLoadedOnce = true;
    loadRanking("global");
  }
});

safeBind("rankingTabGlobal", "onclick", () => loadRanking("global"));
safeBind("rankingTabFriends", "onclick", () => loadRanking("friends"));

async function loadRanking(mode) {
  currentRankingMode = mode;
  document.getElementById("rankingTabGlobal").classList.toggle("active", mode === "global");
  document.getElementById("rankingTabFriends").classList.toggle("active", mode === "friends");

  const list = document.getElementById("rankingList");
  list.innerHTML = `<li class="rankEmpty">${t("rankLoading")}</li>`;

  if (mode === "friends" && !state.riotId) {
    list.innerHTML = `<li class="rankEmpty">${t("rankNeedOwnId")}</li>`;
    return;
  }

  try {
    const path = mode === "global"
      ? "/ranking/global"
      : `/ranking/friends/${encodeURIComponent(state.riotId)}`;
    const res = await fetch(serverUrl(path));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t("rankLoadFailed"));
    renderRanking(data.ranking || []);
  } catch (err) {
    console.error(err);
    list.innerHTML = `<li class="rankEmpty">${t("errorPrefix")}${err.message}</li>`;
  }
}

// Riot speichert nur die grobe Routing-Region (europe/americas/asia/sea),
// op.gg braucht aber den genauen Plattform-Code. Bestmögliche Annahme
// pro Kontinent - bei Nutzern auf einem anderen Server innerhalb dieser
// Gruppe (z.B. EUNE statt EUW) zeigt der Link auf den naheliegendsten.
const OPGG_REGION_MAP = { europe: "euw", americas: "na", asia: "kr", sea: "oce" };

function buildOpggUrl(riotId, region) {
  const platform = OPGG_REGION_MAP[region] || "euw";
  const [name, tag] = riotId.split("#");
  if (!name || !tag) return null;
  return `https://www.op.gg/summoners/${platform}/${encodeURIComponent(name)}-${encodeURIComponent(tag)}`;
}

// Spezieller Spass-Fall: dieser Account bekommt eine "schlechte" Holz-/
// Braun-Farbe, ausser er schafft es selbst auf einen Podiumsplatz - dann
// gilt fuer ihn ganz normal die Gold/Silber/Bronze-Farbe wie fuer alle.
const RUNNING_GAG_RIOTID = "xlizardx#4747";

function renderRanking(ranking) {
  const list = document.getElementById("rankingList");
  list.innerHTML = "";
  if (ranking.length === 0) {
    list.innerHTML = `<li class="rankEmpty">${t("rankEmptyData")}</li>`;
    return;
  }
  ranking.forEach((entry, i) => {
    const li = document.createElement("li");
    li.classList.add("clickable");
    if (entry.riotId === state.riotId) li.classList.add("me");

    // Podium-Farbe nach Platzierung (0-indiziert: 0=Gold, 1=Silber, 2=Bronze).
    const podiumClass = i === 0 ? "rank-gold" : i === 1 ? "rank-silver" : i === 2 ? "rank-bronze" : "";
    const isLizard = entry.riotId.toLowerCase() === RUNNING_GAG_RIOTID;
    if (podiumClass) {
      li.classList.add(podiumClass);
    } else if (isLizard) {
      // Nicht in den Top 3 UND der running gag - schlechte Holzfarbe.
      li.classList.add("rank-lizard");
    }

    const opggUrl = buildOpggUrl(entry.riotId, entry.region);
    const opggLink = opggUrl
      ? `<a class="opggLink" href="${opggUrl}" target="_blank" rel="noopener noreferrer" title="${t("opggOpenTitle")}">op.gg</a>`
      : "";

    li.innerHTML = `
      <span class="rankNum">${i + 1}.</span>
      <span class="rankName">${entry.riotId}</span>
      ${opggLink}
      <span class="rankWins">${entry.championsWon}</span>
    `;
    li.title = t("progressTitle");
    li.addEventListener("click", () => openPlayerView(entry.riotId));
    const linkEl = li.querySelector(".opggLink");
    if (linkEl) linkEl.addEventListener("click", (e) => e.stopPropagation());
    list.appendChild(li);
  });
}

// ---------- Spieler-Fortschrittsansicht (Klick auf Ranking-Eintrag) ----------
// Holt die OEFFENTLICHEN Stats eines beliebigen registrierten Nutzers
// ueber denselben /stats/:riotId-Endpunkt, den die App auch fuer den
// eigenen Account nutzt - kein Login noetig, identisch zur bestehenden
// Datenschutz-Logik (jeder kann gezielt eine Riot-ID abrufen).
let viewedPlayerStats = null;

async function openPlayerView(riotId) {
  const overlay = document.getElementById("playerViewOverlay");
  const nameEl = document.getElementById("playerViewName");
  const summaryEl = document.getElementById("playerViewSummary");
  const gridEl = document.getElementById("playerViewGrid");
  const addFriendBtnEl = document.getElementById("playerViewAddFriend");

  nameEl.textContent = riotId;
  summaryEl.textContent = t("rankLoading");
  gridEl.innerHTML = "";
  overlay.classList.remove("hidden");

  // Bei sich selbst macht ein Freund-Button keinen Sinn - ausblenden.
  if (riotId === state.riotId) {
    addFriendBtnEl.classList.add("hidden");
  } else {
    addFriendBtnEl.classList.remove("hidden");
    await updatePlayerViewFriendButton(riotId);
  }

  try {
    const res = await fetch(serverUrl(`/stats/${encodeURIComponent(riotId)}`));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t("statsLoadFailed"));
    viewedPlayerStats = data;
    renderPlayerViewGrid();
  } catch (err) {
    console.error(err);
    summaryEl.textContent = t("errorPrefix") + err.message;
  }
}

async function updatePlayerViewFriendButton(riotId) {
  const btn = document.getElementById("playerViewAddFriend");
  btn.classList.remove("already");
  btn.textContent = t("addFriendBtnShort");
  btn.disabled = false;
  try {
    const res = await fetch(serverUrl(`/friends/${encodeURIComponent(state.riotId)}`));
    if (!res.ok) return;
    const data = await res.json();
    const alreadyFriend = (data.friends || []).some(
      (f) => f.toLowerCase() === riotId.toLowerCase()
    );
    if (alreadyFriend) {
      btn.classList.add("already");
      btn.textContent = t("friendAlready");
      btn.disabled = true;
    }
  } catch (err) {
    console.error("Freund-Status konnte nicht geprüft werden:", err);
  }
}

safeBind("playerViewAddFriend", "onclick", async () => {
  const riotId = document.getElementById("playerViewName").textContent;
  const btn = document.getElementById("playerViewAddFriend");
  btn.disabled = true;
  btn.textContent = "...";
  const friends = await addFriend(riotId);
  if (friends) {
    btn.classList.add("already");
    btn.textContent = t("friendAlready");
  } else {
    btn.disabled = false;
    btn.textContent = t("addFriendBtnShort");
  }
});

function renderPlayerViewGrid() {
  if (!viewedPlayerStats) return;
  const gridEl = document.getElementById("playerViewGrid");
  const summaryEl = document.getElementById("playerViewSummary");
  const filterText = document.getElementById("playerViewFilter").value.toLowerCase();

  const winCounts = viewedPlayerStats.winCounts || {};
  const matchHistory = viewedPlayerStats.matchHistory || {};

  gridEl.innerHTML = "";
  let wonCount = 0;

  const visible = championList.filter((c) => c.name.toLowerCase().includes(filterText));

  for (const champ of visible) {
    const winCount = winCounts[champ.key] || 0;
    const hasWin = winCount > 0;
    const hasGames = !!(matchHistory[champ.key] && matchHistory[champ.key].length > 0);
    if (hasWin) wonCount++;

    let status;
    if (hasWin) status = "won";
    else if (hasGames) status = "lost";
    else status = "missing";

    const tierClass = getTierClass(winCount);

    const div = document.createElement("div");
    div.className = "champ " + status + (tierClass ? " " + tierClass : "");
    div.innerHTML = `
      <img src="${champ.icon}" alt="${champ.name}" />
      ${hasWin ? `<span class="winBadge">${winCount}</span>` : ""}
      <span>${champ.name}</span>
    `;
    gridEl.appendChild(div);
  }

  let totalGames = 0;
  let totalWins = 0;
  for (const champKey in matchHistory) {
    const games = matchHistory[champKey] || [];
    totalGames += games.length;
    totalWins += games.filter((g) => g.placement === 1).length;
  }

  summaryEl.textContent =
    t("playerViewSummary", { won: wonCount, total: championList.length, games: totalGames, wins: totalWins }) +
    (viewedPlayerStats.lastSync ? t("playerViewLastSync", { time: formatLastSync(viewedPlayerStats.lastSync) }) : "");
}

safeBind("playerViewClose", "onclick", () => {
  document.getElementById("playerViewOverlay").classList.add("hidden");
  viewedPlayerStats = null;
});

safeBind("playerViewFilter", "oninput", renderPlayerViewGrid);

// ---------- Start ----------

(async function init() {
  setStatus(t("statusLoadingChampList"));
  await loadChampionList();
  renderGrid();
  loadMetaData();

  if (state.riotId && state.serverUrl) {
    await registerAndLoad();
    loadFriends();
  } else {
    setStatus(t("statusReadyFillSettings"));
    document.getElementById("settingsPanel").classList.remove("hidden");
  }
})();
