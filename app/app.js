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
    rankingUpdateNote: "🕕 Update um 02:00 / 08:00 / 14:00 / 20:00 Uhr",
    rankCatChampions: "Champions",
    rankCatTotalWins: "Gesamt-Wins",
    rankCatBestChamp: "Bester Champ",
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
    tooltipGamesCount: "{count} Spiel(e)",
    tooltipWin: "Sieg",
    tooltipLose: "Niederlage",
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
    playerViewLastSync: " · letzter Sync: {time}",

    champDetailBack: "← Zurück zum Grid",
    champDetailBestPartners: "Beste Partner (Trio)",
    champDetailBestItems: "Beste Items",
    champDetailBestAugments: "Beste Augments",
    champDetailNoPartners: "Noch keine Trio-Daten für diesen Champion.",
    champDetailNoBuild: "Noch keine Item-/Augment-Daten für diesen Champion.",
    champDetailStatCheck: "💡 Lohnt sich auf Stats zu spielen",
    backArrow: "←",
    backToGridTitle: "Zurück zum Grid",
    backToChampTitle: "Zurück zur Champion-Ansicht",
    itemDetailHeading: "Item-Synergien",
    augmentDetailHeading: "Augment-Synergien",
    detailSynergyHeading: "Funktioniert gut mit",
    detailNoSynergyData: "Noch keine Synergie-Daten dafür.",
    top30TrioHeading: "Top 30 Trio-Winrates",
    champDetailSkillOrder: "Skill-Reihenfolge",
    champDetailNoSkillOrder: "Noch keine Skill-Reihenfolge für diesen Champion.",
    champDetailTactics: "Taktiken",
    champDetailNoTactics: "Noch keine Taktik-Tipps für diesen Champion.",
    topTrioHeading: "Top 30 Trios (Winrate)",
    champDetailAiHeading: "KI-Empfehlung (experimentell)",
    champDetailAiCore: "Core-Items",
    champDetailAiSituational: "Situativ",
    champDetailAiAugments: "Augments",
    champDetailAiSpells: "Summoner Spells",
    champDetailAiNone: "Noch keine KI-Empfehlung für diesen Champion.",
    champDetailAiConfidenceLow: "Wenig Datenbasis - vorsichtig interpretieren",
    champDetailAiConfidenceMedium: "Solide Datenbasis",
    champDetailAiConfidenceHigh: "Starke Datenbasis"
  },
  en: {
    rankingToggleTitle: "Show ranking",
    tabGlobal: "Global",
    tabFriends: "Friends",
    rankingUpdateNote: "🕕 Updates at 02:00 / 08:00 / 14:00 / 20:00",
    rankCatChampions: "Champions",
    rankCatTotalWins: "Total wins",
    rankCatBestChamp: "Best champ",
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
    tooltipGamesCount: "{count} game(s)",
    tooltipWin: "Win",
    tooltipLose: "Loss",
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
    playerViewLastSync: " · last sync: {time}",

    champDetailBack: "← Back to grid",
    champDetailBestPartners: "Best partners (trio)",
    champDetailBestItems: "Best items",
    champDetailBestAugments: "Best augments",
    champDetailNoPartners: "No trio data for this champion yet.",
    champDetailNoBuild: "No item/augment data for this champion yet.",
    champDetailStatCheck: "💡 Worth playing on stats",
    backArrow: "←",
    backToGridTitle: "Back to grid",
    backToChampTitle: "Back to champion view",
    itemDetailHeading: "Item synergies",
    augmentDetailHeading: "Augment synergies",
    detailSynergyHeading: "Works well with",
    detailNoSynergyData: "No synergy data for this yet.",
    top30TrioHeading: "Top 30 trio win rates",
    champDetailSkillOrder: "Skill order",
    champDetailNoSkillOrder: "No skill order for this champion yet.",
    champDetailTactics: "Tactics",
    champDetailNoTactics: "No tactic tips for this champion yet.",
    topTrioHeading: "Top 30 trios (win rate)",
    champDetailAiHeading: "AI recommendation (experimental)",
    champDetailAiCore: "Core items",
    champDetailAiSituational: "Situational",
    champDetailAiAugments: "Augments",
    champDetailAiSpells: "Summoner spells",
    champDetailAiNone: "No AI recommendation for this champion yet.",
    champDetailAiConfidenceLow: "Low sample size - interpret with caution",
    champDetailAiConfidenceMedium: "Solid sample size",
    champDetailAiConfidenceHigh: "Strong sample size"
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
let championByKey = {}; // { "112": {icon, name}, ... } - numerischer Riot-Key, wie winCounts/wins indiziert sind
let championByNormName = {}; // wie championByApiName, aber Key normalisiert (kein Apostroph/Leerzeichen, lowercase)
let lastFriendsList = null; // zuletzt geladene Freundesliste, fuer Re-Render bei Sprachwechsel
let metaData = null; // zuletzt vom Server geladene /meta-Antwort, fuer die Champion-Detailansicht

// Normalisiert einen Champion-Namen fuer Vergleiche, unabhaengig von
// Apostroph/Punkt/Leerzeichen-Schreibweise ("Cho'Gath" / "ChoGath" -> "chogath").
function normName(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

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
  if (metaData) renderMeta(metaData);
  renderTop30TrioSection();
  if (currentDetailChamp && !document.getElementById("champDetail").classList.contains("hidden")) {
    openChampDetail(currentDetailChamp);
  }
  if (lastFriendsList) renderFriendsList(lastFriendsList);
  if (rankingLoadedOnce) {
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

  // Lookup nach dem NUMERISCHEN Riot-Key (z.B. "112" fuer Viktor) - so
  // sind winCounts/wins/matchHistory indiziert (siehe champ.key in
  // renderGrid). Wird fuer die "Bester Champion"-Ranking-Kategorie
  // gebraucht, um aus dem gespeicherten Key wieder Icon/Name aufzuloesen.
  championByKey = {};
  for (const c of championList) {
    championByKey[c.key] = c;
  }

  // Normalisierter Index (z.B. "Cho'Gath" / "ChoGath" / "cho gath" -> "chogath"),
  // damit Meta-Daten (Anzeigename mit Apostroph/Leerzeichen) zuverlaessig auf
  // den richtigen Champion aus championList matchen, unabhaengig von Schreibweise.
  championByNormName = {};
  for (const c of championList) {
    championByNormName[normName(c.id)] = c;
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
    div.addEventListener("click", () => openChampDetail(champ));
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
    html += `<div class="tooltipCount">${t("tooltipGamesCount", { count: history.length })}</div>`;
    html += `<ul class="tooltipList">`;
    const dateLocale = currentLang === "de" ? "de-DE" : "en-US";
    for (const g of history) {
      const isWin = g.placement === 1;
      const dateStr = new Date(g.date).toLocaleDateString(dateLocale, { day: "2-digit", month: "2-digit" });
      const placementText = currentLang === "de" ? `${g.placement}. Platz` : `${ordinal(g.placement)} place`;
      const placementBadge = `<span class="placementBadge ${isWin ? "placementWin" : "placementLose"}">${placementText}</span>`;
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

// Englische Ordinalzahl fuer die Platzierungsanzeige im Tooltip
// (1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4/5/6/... -> "4th" usw.).
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------- Tages-Meta: Trio-Combos & Augment/Item-Synergien ----------
// Tagesaktuelle Community-Daten (taeglich vom Server via metasrc.com
// aktualisiert) - rein informativ, KEINE Live-Erkennung im Spiel.

async function loadMetaData() {
  try {
    const res = await fetch(serverUrl("/meta"));
    if (!res.ok) return; // noch keine Daten vorhanden, einfach ausblenden
    const data = await res.json();
    metaData = data;
    renderMeta(data);
    renderTop30TrioSection();
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

// ---------- Champion-Detailansicht (Klick auf eine Kachel im Grid) ----------
// Zeigt zu einem einzelnen Champion: beste Trio-Partner (aus den bereits
// geladenen /meta-Daten, gleiche Quelle wie die Tages-Meta-Box), sowie
// beste Items/Augments, falls der Server dafuer Daten liefert
// (data.championBuilds, siehe Server-Doku). Reine Arena-Daten - ARAM
// wird hier bewusst nicht beruecksichtigt.

// Findet alle Trio-Kombinationen aus den Meta-Daten, in denen der
// uebergebene Champion vorkommt (egal ob als "champion" oder "partner"),
// und gibt jeweils die beiden anderen Champions + Tier/Winrate zurueck.
function getBestPartners(champ) {
  if (!metaData || !metaData.trioCombos) return [];
  const target = normName(champ.id);
  const results = [];
  for (const combo of metaData.trioCombos) {
    const allNames = [combo.champion, ...(combo.partners || [])];
    if (!allNames.some((n) => normName(n) === target)) continue;
    const others = allNames.filter((n) => normName(n) !== target);
    results.push({ partners: others, tier: combo.tier, winRate: combo.winRate });
  }
  // Beste zuerst: hoehere Winrate vor niedrigerer.
  results.sort((a, b) => (b.winRate || 0) - (a.winRate || 0));
  return results;
}

// Loest einen Anzeigenamen (z.B. "Cho'Gath") ueber den normalisierten
// Index wieder auf ein echtes Champion-Objekt (mit Icon) auf, damit die
// Partnerliste mit Bild statt nur Text dargestellt werden kann.
function resolveChampByName(displayName) {
  return championByNormName[normName(displayName)] || null;
}

function getChampBuild(champ) {
  if (!metaData || !metaData.championBuilds) return null;
  return metaData.championBuilds[normName(champ.id)] || null;
}

let currentDetailChamp = null; // zuletzt geoeffneter Champion, fuer den Rueckweg von der Item-/Augment-Ansicht

// ---- Linke Spalte: beste Trio-Partner fuer den aktuellen Champion ----
function renderBestPartnersColumn(champ) {
  const partners = getBestPartners(champ);
  let html = `<div class="detailSection"><h3>${t("champDetailBestPartners")}</h3>`;
  if (partners.length === 0) {
    html += `<p class="detailEmpty">${t("champDetailNoPartners")}</p>`;
  } else {
    html += `<ul class="detailPartnerList">`;
    for (const p of partners) {
      const partnerHtml = p.partners.map((name) => {
        const c = resolveChampByName(name);
        const icon = c ? `<img src="${c.icon}" alt="${c.name}" />` : "";
        return `<span class="detailPartner">${icon}${c ? c.name : name}</span>`;
      }).join("");
      const winRateText = typeof p.winRate === "number" ? `${p.winRate.toFixed(1)}%` : "";
      html += `
        <li>
          <span class="metaTier">${p.tier || ""}</span>
          <span class="detailPartnerGroup">${partnerHtml}</span>
          <span class="detailWinRate">${winRateText}</span>
        </li>
      `;
    }
    html += `</ul>`;
  }
  html += `</div>`;
  return html;
}

// ---- Eigene, IMMER sichtbare Section: globale Top-30-Trio-Compositions
// nach Winrate (oberhalb des Grids, NICHT Teil der Champion-Detailansicht).
// Wird einmal nach jedem /meta-Laden sowie bei Sprachwechsel neu gerendert.
function renderTop30TrioSection() {
  const section = document.getElementById("top30Trio");
  if (!section) return;
  const combos = (metaData && metaData.trioCombos) ? metaData.trioCombos.slice() : [];

  let html = `<h3>${t("topTrioHeading")}</h3>`;
  if (combos.length === 0) {
    html += `<p class="detailEmpty">${t("champDetailNoPartners")}</p>`;
  } else {
    combos.sort((a, b) => (b.winRate || 0) - (a.winRate || 0));
    html += `<ul class="detailTrioList">`;
    combos.slice(0, 30).forEach((c, i) => {
      const names = [c.champion, ...(c.partners || [])].join(" + ");
      const winRateText = typeof c.winRate === "number" ? `${c.winRate.toFixed(1)}%` : "";
      html += `
        <li>
          <span class="detailTrioRank">${i + 1}.</span>
          <span class="metaTier">${c.tier || ""}</span>
          <span class="detailTrioNames">${names}</span>
          <span class="detailWinRate">${winRateText}</span>
        </li>
      `;
    });
    html += `</ul>`;
  }
  section.innerHTML = html;
}

// ---- Mittlere Spalte: beste Items fuer den Champion (klickbar) ----
// Liefert die Icon-URL fuer einen Item-Namen, falls der Server eine
// itemIconMap mitliefert (normalisierter Name -> URL). Kein Icon
// vorhanden -> null, dann faellt die Darstellung auf reinen Text zurueck.
function getItemIcon(name) {
  if (!metaData || !metaData.itemIconMap) return null;
  return metaData.itemIconMap[normName(name)] || null;
}

// Rendert ein einzelnes Item/Augment-Tag - mit Icon, falls vorhanden
// (kompakt), sonst als Text-Pille wie bisher.
function renderItemTag(name, clickable, type) {
  const icon = getItemIcon(name);
  const cls = clickable ? "detailTagList-item clickableTag" : "detailTagList-item";
  const dataAttrs = clickable ? ` data-name="${name}" data-type="${type}"` : "";
  if (icon) {
    return `<li class="${cls}"${dataAttrs} title="${name}"><img src="${icon}" alt="${name}" /></li>`;
  }
  return `<li class="${cls}"${dataAttrs}>${name}</li>`;
}

function renderBestItemsColumn(champ) {
  const build = getChampBuild(champ);
  let html = `<div class="detailSection"><h3>${t("champDetailBestItems")}</h3>`;
  if (build && build.bestItems && build.bestItems.length) {
    html += `<ul class="detailTagList">` +
      build.bestItems.map((i) => renderItemTag(i, true, "item")).join("") +
      `</ul>`;
  } else {
    html += `<p class="detailEmpty">${t("champDetailNoBuild")}</p>`;
  }
  html += `</div>`;
  return html;
}

// ---- Rechte Spalte: beste Augments fuer den Champion (klickbar) ----
function renderBestAugmentsColumn(champ) {
  const build = getChampBuild(champ);
  let html = `<div class="detailSection"><h3>${t("champDetailBestAugments")}</h3>`;
  if (build && build.bestAugments && build.bestAugments.length) {
    html += `<ul class="detailTagList">` +
      build.bestAugments.map((a) => `<li class="clickableTag" data-name="${a}" data-type="augment">${a}</li>`).join("") +
      `</ul>`;
  } else {
    html += `<p class="detailEmpty">${t("champDetailNoBuild")}</p>`;
  }
  if (build && build.statCheckNote) {
    html += `<div class="detailStatCheck">${t("champDetailStatCheck")}: ${build.statCheckNote}</div>`;
  }
  return html;
}

// ---- Skill-Reihenfolge: direkt unter Champion-Icon/Name, volle Breite ----
function renderSkillOrderBlock(champ) {
  const build = getChampBuild(champ);
  if (build && build.skillOrder && build.skillOrder.length) {
    return `<div class="detailSkillOrder"><span class="detailSkillOrderLabel">${t("champDetailSkillOrder")}</span> ${build.skillOrder.join(" → ")}</div>`;
  }
  return `<div class="detailSkillOrder"><span class="detailSkillOrderLabel">${t("champDetailSkillOrder")}</span> <span class="detailEmptyInline">${t("champDetailNoSkillOrder")}</span></div>`;
}

// ---- Taktiken: ein paar Spieltipps fuer den Champion in Arena, volle Breite ----
function renderTacticsBlock(champ) {
  const build = getChampBuild(champ);
  let html = `<div class="detailSection detailTactics"><h3>${t("champDetailTactics")}</h3>`;
  if (build && build.tacticsNotes && build.tacticsNotes.length) {
    html += `<ul class="detailTacticsList">` + build.tacticsNotes.map((tip) => `<li>${tip}</li>`).join("") + `</ul>`;
  } else {
    html += `<p class="detailEmpty">${t("champDetailNoTactics")}</p>`;
  }
  html += `</div>`;
  return html;
}

// ---- KI-Empfehlung (Standalone-Agent, "itemMeta"-Collection) ----
// REIN LESEND: zeigt nur an, was der Agent lokal schon generiert hat.
// Kein Eingabefeld, kein Button, der eine neue Generierung ausloest -
// App-Nutzer koennen hierueber NICHTS anfragen oder Kosten verursachen.
function renderAiMetaPlaceholder() {
  return `<div class="detailSection" id="aiMetaSection"><h3>${t("champDetailAiHeading")}</h3><p class="detailEmpty">...</p></div>`;
}

function confidenceLabel(confidence) {
  if (confidence === "high") return t("champDetailAiConfidenceHigh");
  if (confidence === "medium") return t("champDetailAiConfidenceMedium");
  return t("champDetailAiConfidenceLow");
}

// Rendert ein einzelnes Tag der KI-Empfehlung: NUR Icon, kein Text -
// Hover-Tooltip zeigt die offizielle Spielbeschreibung in der gerade
// aktiven Sprache (currentLang). Laedt das Icon nicht (kaputter Pfad o.ä.),
// faellt automatisch auf den Namen als Text zurueck statt leer zu bleiben.
function renderAiTag(entry) {
  const tooltipText = entry.tooltip ? (entry.tooltip[currentLang] || entry.tooltip.en || "") : "";
  const title = tooltipText ? `${entry.name}: ${tooltipText}` : entry.name;
  if (entry.icon) {
    return `<li class="detailTagList-item" title="${title.replace(/"/g, "&quot;")}">` +
      `<img src="${entry.icon}" alt="${entry.name}" onerror="this.parentElement.textContent='${entry.name}';" />` +
      `</li>`;
  }
  return `<li class="detailTagList-item" title="${title.replace(/"/g, "&quot;")}">${entry.name}</li>`;
}

function renderAiMetaContent(aiMeta) {
  if (!aiMeta) {
    return `<h3>${t("champDetailAiHeading")}</h3><p class="detailEmpty">${t("champDetailAiNone")}</p>`;
  }

  let html = `<h3>${t("champDetailAiHeading")}</h3>`;
  html += `<p class="detailEmpty" style="margin-bottom:8px;">${confidenceLabel(aiMeta.confidence)} (${aiMeta.sampleSize || 0} Spiele)</p>`;

  if (aiMeta.coreItems && aiMeta.coreItems.length) {
    html += `<p class="detailSkillOrderLabel">${t("champDetailAiCore")}</p><ul class="detailTagList">` +
      aiMeta.coreItems.map(renderAiTag).join("") + `</ul>`;
  }
  if (aiMeta.situationalItems && aiMeta.situationalItems.length) {
    html += `<p class="detailSkillOrderLabel">${t("champDetailAiSituational")}</p><ul class="detailTagList">` +
      aiMeta.situationalItems.map(renderAiTag).join("") + `</ul>`;
  }
  if (aiMeta.recommendedAugments && aiMeta.recommendedAugments.length) {
    html += `<p class="detailSkillOrderLabel">${t("champDetailAiAugments")}</p><ul class="detailTagList">` +
      aiMeta.recommendedAugments.map(renderAiTag).join("") + `</ul>`;
  }
  if (aiMeta.recommendedSummonerSpells && aiMeta.recommendedSummonerSpells.length) {
    html += `<p class="detailSkillOrderLabel">${t("champDetailAiSpells")}</p><ul class="detailTagList">` +
      aiMeta.recommendedSummonerSpells.map(renderAiTag).join("") + `</ul>`;
  }
  if (aiMeta.buildPathSummary) {
    html += `<p class="detailEmpty" style="margin-top:8px;">${aiMeta.buildPathSummary}</p>`;
  }
  return html;
}

// Laedt die KI-Empfehlung asynchron NACH dem ersten Rendern der
// Detailansicht (champ.key = numerische Champion-ID, passend zur
// itemMeta-Collection). Schlaegt der Request fehl (z.B. Server down),
// wird einfach "keine Daten" angezeigt statt eines Fehlers.
async function loadAiMetaSection(champ) {
  const section = document.getElementById("aiMetaSection");
  if (!section) return;
  try {
    const res = await fetch(serverUrl(`/meta-ai/${champ.key}`));
    if (!res.ok) {
      section.innerHTML = renderAiMetaContent(null);
      return;
    }
    const aiMeta = await res.json();
    section.innerHTML = renderAiMetaContent(aiMeta);
  } catch {
    section.innerHTML = renderAiMetaContent(null);
  }
}

function openChampDetail(champ) {
  currentDetailChamp = champ;
  hideChampTooltip();
  document.getElementById("grid").classList.add("hidden");
  document.getElementById("top30Trio").classList.add("hidden");
  document.getElementById("rankingPanel").classList.add("hidden");
  const detail = document.getElementById("champDetail");
  detail.classList.remove("hidden");

  detail.innerHTML = `
    <div class="detailHeader">
      <button class="backArrowBtn" id="champDetailBackBtn" title="${t("backToGridTitle")}">${t("backArrow")}</button>
      <img src="${champ.icon}" alt="${champ.name}" />
      <h2>${champ.name}</h2>
    </div>
    ${renderSkillOrderBlock(champ)}
    ${renderTacticsBlock(champ)}
    <div class="detailGrid3">
      ${renderBestPartnersColumn(champ)}
      ${renderBestItemsColumn(champ)}
      ${renderBestAugmentsColumn(champ)}
    </div>
    ${renderAiMetaPlaceholder()}
  `;

  document.getElementById("champDetailBackBtn").addEventListener("click", closeChampDetail);
  detail.querySelectorAll(".clickableTag").forEach((li) => {
    li.addEventListener("click", () => openItemOrAugmentDetail(li.dataset.name, li.dataset.type));
  });
  loadAiMetaSection(champ);
}

// ---------- Item-/Augment-Detailansicht (Klick auf ein Item- oder Augment-Tag) ----------
// Vierte Ebene: ersetzt die komplette Detailansicht durch eine einzelne,
// volle Breite nutzende Synergie-Ansicht. Rueckweg fuehrt zurueck zur
// zuletzt geoeffneten Champion-Ansicht (nicht zum Grid).

function getSynergyMap(type) {
  if (!metaData) return {};
  return type === "item" ? (metaData.itemSynergyMap || {}) : (metaData.augmentSynergyMap || {});
}

function getSynergiesFor(name, type) {
  const map = getSynergyMap(type);
  const key = normName(name);
  for (const k in map) {
    if (normName(k) === key) return map[k];
  }
  return null;
}

function openItemOrAugmentDetail(name, type) {
  const synergy = getSynergiesFor(name, type);
  const heading = type === "item" ? t("itemDetailHeading") : t("augmentDetailHeading");
  const detail = document.getElementById("champDetail");

  let html = `
    <div class="detailHeader">
      <button class="backArrowBtn" id="itemDetailBackBtn" title="${t("backToChampTitle")}">${t("backArrow")}</button>
      <h2>${name}</h2>
    </div>
    <div class="detailSection"><h3>${heading} · ${t("detailSynergyHeading")}</h3>`;

  if (synergy && synergy.with && synergy.with.length) {
    html += `<ul class="detailTagList">` +
      synergy.with.map((n) => renderItemTag(n, false)).join("") +
      `</ul>`;
    if (synergy.note) {
      html += `<p class="detailEmpty" style="margin-top:6px;">${synergy.note}</p>`;
    }
  } else {
    html += `<p class="detailEmpty">${t("detailNoSynergyData")}</p>`;
  }
  html += `</div>`;

  detail.innerHTML = html;
  document.getElementById("itemDetailBackBtn").addEventListener("click", () => openChampDetail(currentDetailChamp));
}

function closeChampDetail() {
  document.getElementById("champDetail").classList.add("hidden");
  document.getElementById("grid").classList.remove("hidden");
  document.getElementById("top30Trio").classList.remove("hidden");
  document.getElementById("rankingPanel").classList.remove("hidden");
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
let currentRankingCategory = "champions"; // "champions" | "totalWins" | "bestChampion"
let rankingLoadedOnce = false;

function ensureRankingLoaded() {
  if (rankingLoadedOnce) return;
  rankingLoadedOnce = true;
  loadRanking("global");
}

safeBind("rankingTabGlobal", "onclick", () => loadRanking("global"));
safeBind("rankingTabFriends", "onclick", () => loadRanking("friends"));

function bindRankCategoryTab(id, category) {
  safeBind(id, "onclick", () => {
    currentRankingCategory = category;
    document.getElementById("rankCatChampions").classList.toggle("active", category === "champions");
    document.getElementById("rankCatTotalWins").classList.toggle("active", category === "totalWins");
    document.getElementById("rankCatBestChamp").classList.toggle("active", category === "bestChampion");
    loadRanking(currentRankingMode);
  });
}
bindRankCategoryTab("rankCatChampions", "champions");
bindRankCategoryTab("rankCatTotalWins", "totalWins");
bindRankCategoryTab("rankCatBestChamp", "bestChampion");

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
    const basePath = mode === "global"
      ? "/ranking/global"
      : `/ranking/friends/${encodeURIComponent(state.riotId)}`;
    const path = `${basePath}?sort=${currentRankingCategory}`;
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

// Eigenes kleines Balkendiagramm-Icon fuer den op.gg-Link statt eines
// externen Hotlinks auf op.gg's favicon (das zuverlaessig 404'te). Kann
// dadurch nie "kaputt" aussehen, da nichts nachgeladen werden muss.
const OPGG_ICON_SVG = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="9" width="3" height="6" rx="0.5" fill="#ff7a3c"/>
  <rect x="6.5" y="5" width="3" height="10" rx="0.5" fill="#ffb37a"/>
  <rect x="12" y="1" width="3" height="14" rx="0.5" fill="#ff7a3c"/>
</svg>`;

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
      ? `<a class="opggLink" href="${opggUrl}" target="_blank" rel="noopener noreferrer" title="${t("opggOpenTitle")}"><img src="https://meta-static.op.gg/logo/image/fe6c3da400b7249ea97b06699f48f133.png?image=q_auto:good,f_png,w_64,h_64" alt="op.gg" /></a>`
      : "";

    // Je nach gewaehlter Kategorie wird ein anderer Wert angezeigt:
    // Anzahl verschiedener Champions, Gesamt-Wins, oder bei "bestChampion"
    // zusaetzlich der Champion-Name selbst (sonst waere die Zahl ohne
    // Kontext, mit welchem Champion sie erzielt wurde).
    let valueHtml;
    if (currentRankingCategory === "totalWins") {
      valueHtml = `<span class="rankWins">${entry.totalWins}</span>`;
    } else if (currentRankingCategory === "bestChampion") {
      const champ = entry.bestChampionKey ? championByKey[entry.bestChampionKey] : null;
      const champIcon = champ
        ? `<img src="${champ.icon}" alt="${champ.name}" title="${champ.name}" class="rankBestChampIcon" />`
        : "";
      valueHtml = `${champIcon}<span class="rankWins">${entry.bestChampionWins}</span>`;
    } else {
      valueHtml = `<span class="rankWins">${entry.championsWon}</span>`;
    }

    li.innerHTML = `
      <span class="rankNum">${i + 1}.</span>
      ${opggLink}
      <span class="rankName">${entry.riotId}</span>
      ${valueHtml}
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
  ensureRankingLoaded();

  if (state.riotId && state.serverUrl) {
    await registerAndLoad();
    loadFriends();
  } else {
    setStatus(t("statusReadyFillSettings"));
    document.getElementById("settingsPanel").classList.remove("hidden");
  }
})();
