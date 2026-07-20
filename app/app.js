// ============================================================
// Arena Win Tracker - app.js  (QoL-Version)
//
// BASIEREND AUF: arenawintracker.org-main/app/app.js (v17)
// NEU ggü. Vorgängerversion:
//   1. Secret-System wieder ENTFERNT (siehe authFetch unten - nur noch
//      simpler fetch()-Alias, kein x-cron-secret-Header mehr)
//   2. Manueller Sync-Button (POST /account/me/sync)
//   4. Toast-Notification-System statt alert()
//   5. Dark/Light-Theme-Toggle mit Persistenz
//   6. Tastatur-Shortcuts (/, Esc, S, F, ?)
//   7. Lade-Indikator für Server-Kaltstart
//   8. Auto-Refresh der Stats nach 6h
//   9. Filter-Einstellungen persistieren (localStorage)
//  10. Long-Press auf Mobile für Tooltips
//  11. Saison-Fortschrittsbalken
//
// Alle bestehenden Funktionen (Champion-Detailansicht, KI-Empfehlung,
// Community-DB, Trios, Freunde, Ranking, etc.) sind unverändert
// übernommen, nur die fetch()-Aufrufe wurden auf authFetch() umgestellt.
// ============================================================

const STORAGE_KEY = "arenaWinTracker";
const LANG_STORAGE_KEY = "arenaWinTrackerLang";
const DEFAULT_SERVER_URL = "https://arena-win-tracker-server.onrender.com";

// ---------- Secret-System entfernt ----------
// Frueher hier: x-cron-secret-Header-Logik. Entfernt, weil die App nur
// fuer dich + Freunde gedacht ist und das Secret im Browser ohnehin
// sichtbar war - kein echter Schutz, nur Reibung. authFetch bleibt als
// Name erhalten (an allen Call-Sites im Code).
//
// NEU: Schickt automatisch das Edit-Token mit (falls vorhanden), damit
// der Server schreibende Synergie-/Preset-Endpunkte serverseitig
// pruefen kann (siehe editAuth.js im Backend). Bei 401 wird das lokale
// Token verworfen, damit beim naechsten Versuch neu nach dem Code
// gefragt wird.
const IA_EDIT_TOKEN_KEY = "iaEditToken";

function getIaEditToken() {
  return sessionStorage.getItem(IA_EDIT_TOKEN_KEY) || "";
}

function setIaEditToken(token) {
  if (token) sessionStorage.setItem(IA_EDIT_TOKEN_KEY, token);
  else sessionStorage.removeItem(IA_EDIT_TOKEN_KEY);
}

async function authFetch(url, options = {}) {
  const token = getIaEditToken();
  if (token) {
    options = { ...options, headers: { ...(options.headers || {}), "x-edit-token": token } };
  }
  const res = await fetch(url, options);
  if (res.status === 401 && token) {
    setIaEditToken(""); // Code/Token war falsch oder abgelaufen - neu anfragen lassen
  }
  return res;
}

// ---------- NEU: UI-Prefs persistieren ----------
const UI_PREFS_KEY = "arenaWinTrackerUIPrefs";

// Muessen HIER (vor applyUIPrefs) deklariert sein, nicht erst weiter unten
// bei ihrer eigentlichen Verwendungsstelle - sonst wirft der Zugriff in
// applyUIPrefs() beim Skriptstart einen ReferenceError (temporal dead
// zone), weil "let" anders als "var" nicht vorab initialisiert wird.
// Das legt dann das GESAMTE restliche Skript lahm (keine Champs, keine
// Klicks), sobald einmal ein "iaItemsGrouped"/"iaAugmentsGrouped"-Wert
// in den localStorage-UI-Prefs gespeichert wurde.
let iaItemsStatsGroupMode = true;
let iaAugmentsStatsGroupMode = true;

function loadUIPrefs() {
  try {
    return JSON.parse(localStorage.getItem(UI_PREFS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveUIPrefs(prefs) {
  localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
}

function applyUIPrefs() {
  const prefs = loadUIPrefs();
  const filterInput = document.getElementById("filterInput");
  const sortMode = document.getElementById("sortMode");
  const onlyMissing = document.getElementById("onlyMissing");
  const iaItemsGroupToggle = document.getElementById("iaItemsStatsGroupToggle");
  const iaAugmentsGroupToggle = document.getElementById("iaAugmentsStatsGroupToggle");
  if (prefs.filterText && filterInput) filterInput.value = prefs.filterText;
  if (prefs.sortMode && sortMode) sortMode.value = prefs.sortMode;
  if (typeof prefs.onlyMissing === "boolean" && onlyMissing) {
    onlyMissing.checked = prefs.onlyMissing;
  }
  if (typeof prefs.iaItemsGrouped === "boolean" && iaItemsGroupToggle) {
    iaItemsGroupToggle.checked = prefs.iaItemsGrouped;
    iaItemsStatsGroupMode = prefs.iaItemsGrouped;
  }
  if (typeof prefs.iaAugmentsGrouped === "boolean" && iaAugmentsGroupToggle) {
    iaAugmentsGroupToggle.checked = prefs.iaAugmentsGrouped;
    iaAugmentsStatsGroupMode = prefs.iaAugmentsGrouped;
  }
}

function persistUIPrefs() {
  const filterInput = document.getElementById("filterInput");
  const sortMode = document.getElementById("sortMode");
  const onlyMissing = document.getElementById("onlyMissing");
  const iaItemsGroupToggle = document.getElementById("iaItemsStatsGroupToggle");
  const iaAugmentsGroupToggle = document.getElementById("iaAugmentsStatsGroupToggle");
  saveUIPrefs({
    filterText: filterInput?.value || "",
    sortMode: sortMode?.value || "name",
    onlyMissing: !!onlyMissing?.checked,
    iaItemsGrouped: iaItemsGroupToggle ? !!iaItemsGroupToggle.checked : true,
    iaAugmentsGrouped: iaAugmentsGroupToggle ? !!iaAugmentsGroupToggle.checked : true
  });
}

// ---------- NEU: Theme-Toggle ----------
const THEME_KEY = "arenaWinTrackerTheme";

function getCurrentTheme() {
  // Theme-Toggle entfernt - nur noch Dark Mode, unabhängig von
  // eventuell alten localStorage-Werten aus früheren Sessions.
  return "dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

function toggleTheme() {
  const next = getCurrentTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// ---------- NEU: Toast-Notification-System ----------
function ensureToastContainer() {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.style.cssText = `
      position: fixed; top: 16px; right: 16px; z-index: 99999;
      display: flex; flex-direction: column; gap: 8px;
      pointer-events: none; max-width: 360px;
    `;
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = "info", durationMs = 4000) {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  const colors = {
    info:    { bg: "#1f6feb", border: "#4493f8" },
    success: { bg: "#238636", border: "#2ea043" },
    warning: { bg: "#9e6a03", border: "#bb8009" },
    error:   { bg: "#da3633", border: "#f85149" }
  };
  const c = colors[type] || colors.info;
  toast.style.cssText = `
    background: ${c.bg}; border: 1px solid ${c.border};
    color: white; padding: 10px 14px; border-radius: 6px;
    font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    pointer-events: auto; cursor: pointer;
    transition: opacity 0.2s, transform 0.2s;
    opacity: 0; transform: translateX(20px);
  `;
  toast.textContent = message;
  toast.title = "Klicken zum Schließen";
  let dismissTimer = null;
  function dismissNow() {
    if (dismissTimer) clearTimeout(dismissTimer);
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    setTimeout(() => toast.remove(), 200);
  }
  toast.addEventListener("click", dismissNow);
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateX(0)";
  });

  dismissTimer = setTimeout(dismissNow, durationMs);

  // Rueckgabe, damit Aufrufer (z.B. der manuelle Sync-Button) diesen
  // Toast vorzeitig schliessen koennen, sobald der eigentliche
  // Vorgang (z.B. wegen Rate-Limit) sofort fehlschlaegt - statt dass
  // er noch 8 Sekunden neben der Fehlermeldung stehen bleibt.
  return { dismiss: dismissNow };
}

// ---------- NEU: Lade-Indikator für Server-Kaltstart ----------
function showLoadingIndicator(message) {
  let loader = document.getElementById("kaltstartLoader");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "kaltstartLoader";
    loader.style.cssText = `
      position: fixed; inset: 0; z-index: 99997;
      background: rgba(13, 17, 23, 0.85);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 16px; color: #c9d1d9; font-size: 14px;
      backdrop-filter: blur(2px);
    `;
    loader.innerHTML = `
      <div style="font-size: 36px; animation: awt-spin 1s linear infinite;">⚙️</div>
      <div id="kaltstartMessage">${message || "Lade..."}</div>
      <div style="font-size: 11px; color: #8b949e;">Erster Start kann bis zu 60s dauern (Server-Kaltstart)</div>
    `;
    document.body.appendChild(loader);

    const style = document.createElement("style");
    style.textContent = "@keyframes awt-spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(style);
  }
  const msg = loader.querySelector("#kaltstartMessage");
  if (msg && message) msg.textContent = message;
  loader.style.display = "flex";
}

function hideLoadingIndicator() {
  const loader = document.getElementById("kaltstartLoader");
  if (loader) loader.style.display = "none";
}

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
    rankCatWinRate: "Winrate",
    friendsToggleTitle: "Freunde verwalten",
    settingsToggleTitle: "Einstellungen",
    webNotice: "Browser-Testversion. Funktioniert identisch zur Overwolf-App, läuft aber als normale Webseite - kein Overwolf nötig.",
    friendIdLabel: "Riot-ID des Freundes",
    friendIdPlaceholder: "z.B. Buddy#EUW",
    addFriendBtn: "+ Freund hinzufügen",
    registeredUsersHint: "Bereits registrierte Nutzer (anklicken zum Hinzufügen):",
    yourFriendsHint: "Deine Freunde:",
    riotIdLabel: "Riot ID (Name#Tag)",
    languageLabel: "Sprache",
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
    sortTier: "Tier-Liste",
    tierUnknown: "Ohne Tier-Daten",
    tierSectionStufe: "Stufe",
    tierSectionAnd: "und",
    tierSectionIntro: "Zu den aktuellen Champions in {tier}-Stufe gehören ",
    onlyMissingLabel: "nur offene zeigen",
    metaTitle: "📊 Tages-Meta",
    metaTrioHeading: "Beste Trio-Combos",
    metaSynergyHeading: "Augment/Item-Synergien",
    addFriendBtnShort: "+ Freund",
    closeTitle: "Schließen",
    manualSyncTitle: "Jetzt synchronisieren",
    themeToggleTitle: "Theme umschalten",
    openItemsAugmentsBtn: "📦 Items & Augments",
    itemsAugmentsHeading: "Arena Items & Augments",
    itemsAugmentsHint: "Auf ein Augment oder Item klicken, um nur dazu passende Treffer zu sehen.",
    itemsAugmentsClearFilter: "← Zurück zur Übersicht",
    iaAugmentsHeading: "Augments",
    iaItemsHeading: "Items",
    iaTierSilver: "Silber",
    iaTierGold: "Gold",
    iaTierPrismatic: "Prismatic",
    iaTierBoots: "Stiefel",
    iaTierLegendary: "Legendary",
    iaTierQuest: "Quest",
    iaTierAnvil: "Anvil",
    iaTierJuice: "Juice",
    iaNoSynergyYet: "Für dieses Augment gibt es noch keine Synergie-Daten.",
    iaLoadError: "Items/Augments konnten nicht geladen werden.",
    iaSearchPlaceholder: "Augment oder Item suchen...",
    iaCategoryAll: "Alle Kategorien",
    iaTierListBtn: "📊 Tier-Liste",
    iaTierListHint: "Winrate + Spielanzahl über alle Spieler. Sortiert die Kacheln je Kategorie nach Winrate; Klick auf ein Item/Augment zeigt die 5 besten Partner-Kombinationen.",
    iaTierListNoData: "Ohne Daten",
    iaTierSuffix: "Tier",
    iaShowAllBtn: "Alle",
    iaShowAugmentsBtn: "Augments",
    iaShowItemsBtn: "Items",
    iaTierListNoPartners: "Für dieses Augment/Item gibt es noch keine ausreichenden Partner-Daten.",
    iaTierListPartnersHeading: "Top 5 Partner (gemeinsame Winrate)",
    iaEditModeBtn: "✏️ Synergien bearbeiten",
    iaEditModeBtnActive: "✓ Bearbeitungsmodus aktiv",
    iaCodePrompt: "Code eingeben, um Synergien/Presets zu bearbeiten:",
    iaCodeWrong: "Falscher Code.",
    iaPresetModeBtn: "🔍 Schnellsuche",
    iaPresetExistingHeading: "Bestehende Schnellsuchen",
    iaPresetNoneYet: "Noch keine Schnellsuche angelegt.",
    iaPresetDelete: "Schnellsuche löschen",
    iaPresetEdit: "Schnellsuche bearbeiten",
    iaPresetUpdate: "Aktualisieren",
    iaPresetUpdated: "Schnellsuche aktualisiert.",
    iaPresetHint: "Name vergeben, dann Augments/Items unten anklicken zum Hinzufügen/Entfernen. \"Speichern\" legt die Schnellsuche an.",
    iaPresetNamePlaceholder: "Name (z.B. Tank, Full Autocast, Onhit Atkspeed)...",
    iaPresetSave: "Speichern",
    iaPresetNameRequired: "Bitte einen Namen eingeben.",
    iaPresetEntriesRequired: "Bitte mindestens ein Augment oder Item auswählen.",
    iaPresetSaved: "Schnellsuche gespeichert.",
    iaPresetCreatorPlaceholder: "Dein Name...",
    iaPresetByLabel: "von",
    iaPresetConvertBtn: "🎯 Als Champion-Build",
    iaPresetConvertTitle: "Als Champion-Build übernehmen",
    buildConvertPickerTitle: "Champion wählen",
    buildConvertPickerHint: "Der Champion-Build erscheint danach nur noch auf der Seite dieses Champions.",
    buildConvertConfirm: "\"{name}\" als Champion-Build für {champ} anlegen? Die Schnellsuche bleibt zusätzlich in der globalen Liste erhalten.",
    buildConvertNeedRiotId: "Bitte zuerst deine Riot-ID in den Einstellungen eintragen.",
    buildConvertSuccess: "In Champion-Build für {champ} umgewandelt.",
    buildConvertFailed: "Umwandlung fehlgeschlagen.",
    champBuildHeading: "Champion-Build",
    champBuildNone: "Noch kein Champion-Build für diesen Champion.",
    champBuildEditTitle: "Champion-Build bearbeiten",
    champBuildBackBtn: "← Zurück zur Schnellsuche",
    champBuildSidebarHeading: "Champion-Builds",
    buildSelectedNotesHeading: "Ausgewählt (optional: Notiz hinzufügen)",
    buildSkillPathHeading: "Skill Path",
    buildSkillPathReset: "Zurücksetzen",
    champAddPresetBtn: "🔍 Schnellsuche",
    champPresetsHeading: "Schnellsuchen",
    champPresetsNone: "Noch keine Schnellsuche für diesen Champion zugewiesen.",
    champPresetsNoneGlobal: "Noch keine globalen Schnellsuchen vorhanden - erst im \"🔍 Schnellsuche\"-Editor eins anlegen.",
    champPresetRemove: "Schnellsuche von diesem Champion entfernen",
    champPresetPickPrompt: "Welche Schnellsuche zuweisen? Zahl eingeben:",
    iaEditHint: "Augment oder Item auswählen, dann unten anklicken, um Synergien hinzuzufügen (+) oder zu entfernen (✕). Wirkt automatisch in beide Richtungen.",
    iaEditHintChooseAugment: "Zuerst links ein Augment oder Item anklicken, um seine Synergien zu bearbeiten.",
    iaEditClearAll: "Alle entfernen",
    iaEditCancel: "Fertig",
    iaEditAdded: "Hinzugefügt ✓",
    iaEditRemoved: "Entfernt ✓",
    iaEditAllRemoved: "Alle entfernt ✓",
    iaEditSaveError: "Speichern fehlgeschlagen.",

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
    externalTrioHeading: "Meta-Trios",
    champDetailAiHeading: "KI-Empfehlung (experimentell)",
    champDetailAiCore: "Core-Items",
    champDetailAiSituational: "Situativ",
    champDetailAiAugments: "Augments",
    champDetailAiSpells: "Summoner Spells",
    champDetailAiNone: "Noch keine KI-Empfehlung für diesen Champion.",
    champDetailAiConfidenceLow: "Wenig Datenbasis - vorsichtig interpretieren",
    champDetailAiConfidenceMedium: "Solide Datenbasis",
    champDetailAiConfidenceHigh: "Starke Datenbasis",
    communityDbHeading: "Standard-Datenbank",
    communityDbNone: "Noch keine Datenbank-Einträge für diesen Champion.",
    communityDbTier: "Tier",
    communityDbWinrate: "Winrate",
    communityDbTop3: "Top-3",
    communityDbPickRate: "Pickrate",
    communityDbBanRate: "Banrate",
    communityDbKda: "KDA",
    communityDbAvgPlace: "Ø Platzierung",
    communityDbGames: "Spiele",
    communityDbAugmentsOverall: "Gesamt",
    communityDbAugmentsSilver: "Silber",
    communityDbAugmentsGold: "Gold",
    communityDbAugmentsPrismatic: "Prismatic",
    communityDbAugmentsHeading: "Augments",
    communityDbItems: "Empfohlene Items",
    communityDbSynergies: "Synergien",
    communityDbStrongAgainst: "Stark gegen",
    communityDbDiff: "Differenz",
    communityDbSkillOrder: "Skill-Reihenfolge",
    communityDbNoBuildDetails: "Nur Tier-Liste-Daten vorhanden, noch keine Build-Details.",
    communityAiHeading: "KI-Analyse · Testphase",
    communityAiNone: "Noch keine KI-Analyse für diesen Champion.",
    communityAiStrengths: "Stärken",
    communityAiAugments: "Augment-Empfehlung",
    communityAiSynergy: "Synergie-Hinweis",
    communityAiWeakness: "Schwäche-Hinweis",

    placementStatsBtnTitle: "Meine Platzierungsstatistik",
    placementStatsBtn: "📊 Meine Statistik",
    placementStatsHeading: "📊 Meine Statistiken",
    placementOverallHeading: "Platzierungsverteilung (gesamt · {games} Spiele)",
    placementOverallNone: "Noch keine Arena-Spiele erfasst.",
    placementPlaceLabel: "{n}. Platz",
    placementPerChampHeading: "Platzierungen pro Champion",
    placementPerChampNone: "Keine Champions gefunden.",
    placementGamesShort: "{count} Spiel(e)",
    placementStatFirst: "1. Plätze",
    placementStatSecond: "2. Plätze",
    placementStatGames: "Spiele gesamt",
    placementTabPlacements: "Champions",
    placementTabMates: "Mitspieler",
    placementTabHistory: "Verlauf",
    placementTabItems: "Items",
    placementTabAugments: "Augments",
    iaStatsItemsHeading: "Meine Item-Statistik",
    iaStatsAugmentsHeading: "Meine Augment-Statistik",
    iaStatsSortWinrate: "Beste Winrate",
    iaStatsSortGames: "Meiste Spiele",
    iaStatsGroupToggleLabel: "Gruppieren",
    iaStatsNone: "Noch keine Daten - spiel ein paar Runden Arena.",
    placementHistoryHeading: "Spielverlauf (alle Arena-Runden)",
    placementHistoryNone: "Noch keine Arena-Spiele gefunden.",
    matchDetailTeammatesHeading: "Mitspieler",
    matchDetailItemsHeading: "Items",
    matchDetailAugmentsHeading: "Augments",
    matchDetailPerksHeading: "Runen",
    matchDetailSpellsHeading: "Beschwörerzauber",
    matchDetailMatchIdLabel: "Match-ID",
    matchDetailNoItems: "Keine Items erfasst.",
    matchDetailNoAugments: "Keine Augments erfasst.",
    matchDetailNoPerks: "Keine Runen erfasst.",
    matchDetailNoSpells: "Keine Beschwörerzauber erfasst.",
    matchDetailNoTeammates: "Kein Mitspieler erfasst.",
    matchDetailLoading: "Lade Match-Details...",
    matchDetailStatsHeading: "Statistiken",
    matchDetailKda: "K/D/A",
    matchDetailLevel: "Level",
    matchDetailGold: "Gold",
    matchDetailDamageDealt: "Schaden an Champions",
    matchDetailDamageTaken: "Schaden erhalten",
    matchDetailHealing: "Heilung",
    matchDetailShielding: "Schilde (Team)",
    matchDetailNoStats: "Für dieses Match sind noch keine Statistiken erfasst (älteres Match).",
    placementMatesHeading: "Mitspieler (nach gemeinsamen Spielen)",
    placementMateFilterPlaceholder: "Mitspieler suchen...",
    placementMatesNone: "Noch keine Mitspieler-Daten vorhanden.",
    placementMateSortGames: "Meiste Spiele",
    placementMateSortWins: "Meiste Siege",
    placementMateSortWinrate: "Beste Winrate (1. Platz)",
    mateTrioTooltipTitle: "Gemeinsame Mitspieler mit {name}",
    mateTrioTooltipEmpty: "Keine gemeinsamen Trio-Spiele (min. 3 Spiele zusammen nötig).",
    mateTrioTooltipGames: "{count} Spiel(e) zusammen",
    placementMateChampHeading: "Champions dieses Mitspielers (mit dir zusammen)"
  },
  en: {
    rankingToggleTitle: "Show ranking",
    tabGlobal: "Global",
    tabFriends: "Friends",
    rankingUpdateNote: "🕕 Updates at 02:00 / 08:00 / 14:00 / 20:00",
    rankCatChampions: "Champions",
    rankCatTotalWins: "Total wins",
    rankCatBestChamp: "Best champ",
    rankCatWinRate: "Win rate",
    friendsToggleTitle: "Manage friends",
    settingsToggleTitle: "Settings",
    webNotice: "Browser test version. Works identically to the Overwolf app, but runs as a normal website - no Overwolf needed.",
    friendIdLabel: "Friend's Riot ID",
    friendIdPlaceholder: "e.g. Buddy#EUW",
    addFriendBtn: "+ Add friend",
    registeredUsersHint: "Already registered users (click to add):",
    yourFriendsHint: "Your friends:",
    riotIdLabel: "Riot ID (Name#Tag)",
    languageLabel: "Language",
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
    sortTier: "Tier list",
    tierUnknown: "No tier data",
    tierSectionStufe: "tier",
    tierSectionAnd: "and",
    tierSectionIntro: "Current {tier}-tier champions include ",
    onlyMissingLabel: "show only missing",
    metaTitle: "📊 Daily meta",
    metaTrioHeading: "Best trio combos",
    metaSynergyHeading: "Augment/item synergies",
    addFriendBtnShort: "+ Friend",
    closeTitle: "Close",
    manualSyncTitle: "Sync now",
    themeToggleTitle: "Toggle theme",
    openItemsAugmentsBtn: "📦 Items & Augments",
    itemsAugmentsHeading: "Arena Items & Augments",
    itemsAugmentsHint: "Click an augment or item to only show matching results.",
    itemsAugmentsClearFilter: "← Back to overview",
    iaAugmentsHeading: "Augments",
    iaItemsHeading: "Items",
    iaTierSilver: "Silver",
    iaTierGold: "Gold",
    iaTierPrismatic: "Prismatic",
    iaTierBoots: "Boots",
    iaTierLegendary: "Legendary",
    iaTierQuest: "Quest",
    iaTierAnvil: "Anvil",
    iaTierJuice: "Juice",
    iaNoSynergyYet: "No synergy data for this augment yet.",
    iaLoadError: "Could not load items/augments.",
    iaSearchPlaceholder: "Search augment or item...",
    iaCategoryAll: "All categories",
    iaTierListBtn: "📊 Tier list",
    iaTierListHint: "Win rate + game count across all players. Sorts tiles within each category by win rate; click an item/augment to see its 5 best partner combinations.",
    iaTierListNoData: "No data",
    iaTierSuffix: "Tier",
    iaShowAllBtn: "All",
    iaShowAugmentsBtn: "Augments",
    iaShowItemsBtn: "Items",
    iaTierListNoPartners: "Not enough partner data for this augment/item yet.",
    iaTierListPartnersHeading: "Top 5 partners (combined win rate)",
    iaEditModeBtn: "✏️ Edit synergies",
    iaEditModeBtnActive: "✓ Edit mode active",
    iaCodePrompt: "Enter code to edit synergies/presets:",
    iaCodeWrong: "Wrong code.",
    iaPresetModeBtn: "🔍 Quick Search",
    iaPresetExistingHeading: "Existing quick searches",
    iaPresetNoneYet: "No quick searches created yet.",
    iaPresetDelete: "Delete quick search",
    iaPresetEdit: "Edit quick search",
    iaPresetUpdate: "Update",
    iaPresetUpdated: "Quick search updated.",
    iaPresetHint: "Give it a name, then click augments/items below to add/remove. \"Save\" creates the quick search.",
    iaPresetNamePlaceholder: "Name (e.g. Tank, Full Autocast, Onhit Atkspeed)...",
    iaPresetSave: "Save",
    iaPresetNameRequired: "Please enter a name.",
    iaPresetEntriesRequired: "Please select at least one augment or item.",
    iaPresetSaved: "Quick search saved.",
    iaPresetCreatorPlaceholder: "Your name...",
    iaPresetByLabel: "by",
    iaPresetConvertBtn: "🎯 As champion build",
    iaPresetConvertTitle: "Save as champion build",
    buildConvertPickerTitle: "Choose champion",
    buildConvertPickerHint: "The champion build will then only appear on that champion's page.",
    buildConvertConfirm: "Create \"{name}\" as a champion build for {champ}? The quick search stays in the global list too.",
    buildConvertNeedRiotId: "Please enter your Riot ID in settings first.",
    buildConvertSuccess: "Converted into a champion build for {champ}.",
    buildConvertFailed: "Conversion failed.",
    champBuildHeading: "Champion build",
    champBuildNone: "No champion build for this champion yet.",
    champBuildEditTitle: "Edit champion build",
    champBuildBackBtn: "← Back to quick search",
    champBuildSidebarHeading: "Champion builds",
    buildSelectedNotesHeading: "Selected (optional: add a note)",
    buildSkillPathHeading: "Skill Path",
    buildSkillPathReset: "Reset",
    champAddPresetBtn: "🔍 Quick Search",
    champPresetsHeading: "Quick Searches",
    champPresetsNone: "No quick search assigned to this champion yet.",
    champPresetsNoneGlobal: "No global quick searches yet - create one first in the \"🔍 Quick Search\" editor.",
    champPresetRemove: "Remove quick search from this champion",
    champPresetPickPrompt: "Which quick search to assign? Enter the number:",
    iaEditHint: "Pick an augment or item, then click below to add (+) or remove (✕) synergies. Works both ways automatically.",
    iaEditHintChooseAugment: "First click an augment or item on the left to edit its synergies.",
    iaEditClearAll: "Remove all",
    iaEditCancel: "Done",
    iaEditAdded: "Added ✓",
    iaEditRemoved: "Removed ✓",
    iaEditAllRemoved: "All removed ✓",
    iaEditSaveError: "Saving failed.",

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
    externalTrioHeading: "Meta trios",
    champDetailAiHeading: "AI recommendation (experimental)",
    champDetailAiCore: "Core items",
    champDetailAiSituational: "Situational",
    champDetailAiAugments: "Augments",
    champDetailAiSpells: "Summoner spells",
    champDetailAiNone: "No AI recommendation for this champion yet.",
    champDetailAiConfidenceLow: "Low sample size - interpret with caution",
    champDetailAiConfidenceMedium: "Solid sample size",
    champDetailAiConfidenceHigh: "Strong sample size",
    communityDbHeading: "Standard database",
    communityDbNone: "No database entry for this champion yet.",
    communityDbTier: "Tier",
    communityDbWinrate: "Win rate",
    communityDbTop3: "Top 3",
    communityDbPickRate: "Pick rate",
    communityDbBanRate: "Ban rate",
    communityDbKda: "KDA",
    communityDbAvgPlace: "Avg. placement",
    communityDbGames: "Games",
    communityDbAugmentsOverall: "Overall",
    communityDbAugmentsSilver: "Silver",
    communityDbAugmentsGold: "Gold",
    communityDbAugmentsPrismatic: "Prismatic",
    communityDbAugmentsHeading: "Augments",
    communityDbItems: "Recommended items",
    communityDbSynergies: "Synergies",
    communityDbStrongAgainst: "Strong against",
    communityDbDiff: "Difference",
    communityDbSkillOrder: "Skill order",
    communityDbNoBuildDetails: "Only tier-list data available, no build details yet.",
    communityAiHeading: "AI analysis · Beta test",
    communityAiNone: "No AI analysis for this champion yet.",
    communityAiStrengths: "Strengths",
    communityAiAugments: "Augment recommendation",
    communityAiSynergy: "Synergy note",
    communityAiWeakness: "Weakness note",

    placementStatsBtnTitle: "My placement stats",
    placementStatsBtn: "📊 My Stats",
    placementStatsHeading: "📊 My stats",
    placementOverallHeading: "Placement distribution (total · {games} games)",
    placementOverallNone: "No Arena games recorded yet.",
    placementPlaceLabel: "{n}th place",
    placementPerChampHeading: "Placements per champion",
    placementPerChampNone: "No champions found.",
    placementGamesShort: "{count} game(s)",
    placementStatFirst: "1st places",
    placementStatSecond: "2nd places",
    placementStatGames: "Total games",
    placementTabPlacements: "Champions",
    placementTabMates: "Teammates",
    placementTabHistory: "History",
    placementTabItems: "Items",
    placementTabAugments: "Augments",
    iaStatsItemsHeading: "My item stats",
    iaStatsAugmentsHeading: "My augment stats",
    iaStatsSortWinrate: "Best win rate",
    iaStatsSortGames: "Most played",
    iaStatsGroupToggleLabel: "Group",
    iaStatsNone: "No data yet - play a few Arena rounds.",
    placementHistoryHeading: "Match history (all Arena rounds)",
    placementHistoryNone: "No Arena games found yet.",
    matchDetailTeammatesHeading: "Teammates",
    matchDetailItemsHeading: "Items",
    matchDetailAugmentsHeading: "Augments",
    matchDetailPerksHeading: "Runes",
    matchDetailSpellsHeading: "Summoner Spells",
    matchDetailMatchIdLabel: "Match ID",
    matchDetailNoItems: "No items recorded.",
    matchDetailNoAugments: "No augments recorded.",
    matchDetailNoPerks: "No runes recorded.",
    matchDetailNoSpells: "No summoner spells recorded.",
    matchDetailNoTeammates: "No teammate recorded.",
    matchDetailLoading: "Loading match details...",
    matchDetailStatsHeading: "Stats",
    matchDetailKda: "K/D/A",
    matchDetailLevel: "Level",
    matchDetailGold: "Gold",
    matchDetailDamageDealt: "Damage to champions",
    matchDetailDamageTaken: "Damage taken",
    matchDetailHealing: "Healing",
    matchDetailShielding: "Shielding (team)",
    matchDetailNoStats: "No stats recorded for this match yet (older match).",
    placementMatesHeading: "Teammates (by games together)",
    placementMateFilterPlaceholder: "Search teammate...",
    placementMatesNone: "No teammate data yet.",
    placementMateSortGames: "Most games",
    placementMateSortWins: "Most wins",
    placementMateSortWinrate: "Best win rate (1st place)",
    mateTrioTooltipTitle: "Shared teammates with {name}",
    mateTrioTooltipEmpty: "No shared trio games (min. 3 games together needed).",
    mateTrioTooltipGames: "{count} game(s) together",
    placementMateChampHeading: "This teammate's champions (with you)"
  }
};

let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || "de";

// Setzt einen Event-Handler nur, wenn das Element wirklich existiert.
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

function t(key, vars) {
  const str = (I18N[currentLang] && I18N[currentLang][key]) || I18N.de[key] || key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

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
  const langSelect = document.getElementById("languageSelect");
  if (langSelect) langSelect.value = currentLang;
  document.documentElement.lang = currentLang;
}

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

function getWinCount(champKey) {
  return state.winCounts[champKey] || 0;
}

let state = loadState();
let championList = [];
let championByApiName = {};
let championByKey = {};
let championByNormName = {};
let lastFriendsList = null;
let metaData = null;
let ddragonVersion = null;
let communityTierMap = {};

async function loadCommunityTierMap() {
  try {
    const res = await authFetch(serverUrl("/community-meta-tiers"));
    if (!res.ok) return;
    const list = await res.json();
    communityTierMap = {};
    for (const entry of list) {
      communityTierMap[String(entry.championId)] = { tier: entry.tier || null, score: entry.score };
    }
  } catch {
    communityTierMap = {};
  }
}

function normName(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

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
    wins: {},
    winCounts: {},
    matchHistory: {},
    lastSync: null,
    // Merkt sich, fuer welche Riot-ID zuletzt erfolgreich /register
    // aufgerufen wurde. Ist sie identisch mit der aktuellen riotId,
    // wird /register beim naechsten Speichern/Start NICHT erneut
    // aufgerufen (das Backend wuerde fuer existierende Nutzer ohnehin
    // nichts tun, siehe db.registerUser) - schont das Rate-Limit.
    registeredRiotId: null
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- UI Init ----------

safeSetValue("riotId", state.riotId);
safeSetValue("region", state.region);
safeSetValue("seasonStart", state.seasonStart);
applyUIPrefs();
applyTheme(getCurrentTheme());
applyStaticTranslations();

function applyLanguageChange() {
  applyStaticTranslations();
  renderGrid();
  if (metaData) renderMeta(metaData);
  renderTop30TrioSection();
  // Meta-Trios-Section (extern) wurde entfernt - stattdessen lebt hier
  // jetzt der Spielverlauf, der bei Sprachwechsel neu gerendert werden muss
  // (Platzierungs-Label, Datumsformat etc. sind sprachabhaengig).
  const historyFilterInput = document.getElementById("placementHistoryFilter");
  renderPlacementHistoryList(historyFilterInput ? historyFilterInput.value : "");
  if (currentDetailChamp && !document.getElementById("champDetail").classList.contains("hidden")) {
    openChampDetail(currentDetailChamp);
  }
  if (lastFriendsList) renderFriendsList(lastFriendsList);
  if (rankingLoadedOnce) {
    loadRanking(currentRankingMode);
  }
  if (viewedPlayerStats) renderPlayerViewGrid();
  if (!document.getElementById("placementStatsOverlay")?.classList.contains("hidden")) {
    renderPlacementStatsModal();
  }
}

safeBind("languageSelect", "onchange", (e) => {
  currentLang = e.target.value === "en" ? "en" : "de";
  localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  applyLanguageChange();
});

safeBind("themeToggle", "onclick", toggleTheme);

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
  showToast("Einstellungen gespeichert, lade Daten...", "info");
  await registerAndLoad();
  if (seasonStartChanged) {
    showToast("Season-Start aktualisiert, Sync läuft im Hintergrund...", "info");
    await updateSeasonOnServer();
  }
  loadMetaData();
  loadFriends();
  showToast("Daten aktualisiert ✅", "success", 2500);
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

safeBind("filterInput", "oninput", () => { persistUIPrefs(); renderGrid(); });
safeBind("onlyMissing", "onchange", () => { persistUIPrefs(); renderGrid(); });
safeBind("sortMode", "onchange", () => { persistUIPrefs(); renderGrid(); });

// ---------- NEU: Manueller Sync-Button ----------
safeBind("manualSyncBtn", "onclick", async () => {
  if (!state.riotId) {
    showToast("Bitte zuerst Riot-ID in den Einstellungen eintragen.", "warning");
    return;
  }
  const btn = document.getElementById("manualSyncBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳";
  }
  const runningToast = showToast("Sync läuft... kann bis zu 60s dauern.", "info", 8000);

  try {
    const res = await authFetch(serverUrl("/account/me/sync"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riotId: state.riotId })
    });
    const data = await res.json();
    if (!res.ok) {
      // Bei Rate-Limit (429) liefert der Server retryAt mit - zeigt dem
      // Nutzer eine konkrete Uhrzeit, ab wann der naechste manuelle
      // Sync wieder moeglich ist.
      const retryTime = data.retryAt ? formatRetryTime(data.retryAt) : null;
      const msg = retryTime ? `${data.error} (wieder möglich um ${retryTime} Uhr)` : (data.error || "Sync fehlgeschlagen");
      throw new Error(msg);
    }

    runningToast.dismiss();
    showToast(`Sync fertig: ${data.newMatchesProcessed} neue(s) Match(es) ✅`, "success");
    const stats = await fetchStatsFromServer();
    applyStats(stats);
  } catch (err) {
    // "Sync laeuft..." sofort weg, statt noch Sekunden parallel zur
    // roten Fehlermeldung stehen zu bleiben (z.B. bei Rate-Limit, das
    // sofort beim ersten Request zurueckkommt).
    runningToast.dismiss();
    showToast("Sync-Fehler: " + err.message, "error", 8000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔄";
    }
  }
});

// ---------- NEU: Tastatur-Shortcuts ----------
document.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  switch (e.key) {
    case "/":
      e.preventDefault();
      document.getElementById("filterInput")?.focus();
      break;
    case "Escape": {
      const tooltip = document.getElementById("champTooltip");
      if (tooltip && !tooltip.classList.contains("hidden")) {
        tooltip.classList.add("hidden");
        break;
      }
      const detail = document.getElementById("champDetail");
      if (detail && !detail.classList.contains("hidden")) {
        detail.classList.add("hidden");
        const grid = document.getElementById("grid");
        if (grid) grid.classList.remove("hidden");
        const t30 = document.getElementById("top30Trio");
        if (t30) t30.classList.remove("hidden");
        const mainHistory = document.getElementById("mainMatchHistorySection");
        if (mainHistory) mainHistory.classList.remove("hidden");
        const rp = document.getElementById("rankingPanel");
        if (rp) rp.classList.remove("hidden");
        break;
      }
      const playerView = document.getElementById("playerViewOverlay");
      if (playerView && !playerView.classList.contains("hidden")) {
        playerView.classList.add("hidden");
        break;
      }
      const placementStats = document.getElementById("placementStatsOverlay");
      if (placementStats && !placementStats.classList.contains("hidden")) {
        placementStats.classList.add("hidden");
        break;
      }
      document.getElementById("settingsPanel")?.classList.add("hidden");
      document.getElementById("friendsPanel")?.classList.add("hidden");
      break;
    }
    case "s":
    case "S":
      document.getElementById("settingsPanel")?.classList.toggle("hidden");
      break;
    case "f":
    case "F":
      document.getElementById("friendsPanel")?.classList.toggle("hidden");
      break;
    case "?":
      showToast("Shortcuts: / = Suche · Esc = Schließen · S = Settings · F = Freunde", "info", 5000);
      break;
  }
});

// ---------- NEU: Mobile Long-Press für Tooltips ----------
let longPressTimer = null;
let longPressTarget = null;

document.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) return;
  const champDiv = e.target.closest?.(".champ");
  if (!champDiv) return;

  longPressTarget = champDiv;
  longPressTimer = setTimeout(() => {
    if (longPressTarget === champDiv) {
      const touch = e.touches[0];
      const champName = champDiv.querySelector("span")?.textContent;
      const champ = championList.find(c => c.name === champName);
      if (champ) {
        showChampTooltip({ clientX: touch.clientX, clientY: touch.clientY }, champ);
        navigator.vibrate?.(30);
      }
    }
  }, 500);
}, { passive: true });

document.addEventListener("touchend", () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  setTimeout(() => {
    if (longPressTarget === null) hideChampTooltip();
  }, 100);
  longPressTarget = null;
});

document.addEventListener("touchmove", () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}, { passive: true });

// ---------- NEU: Auto-Refresh der Stats ----------
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

let autoRefreshTimer = null;
function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(async () => {
    if (!state.riotId || !state.lastSync) return;
    if (document.hidden) return;
    const lastSyncMs = new Date(state.lastSync).getTime();
    if (Date.now() - lastSyncMs < STALE_THRESHOLD_MS) return;

    console.log("[Auto-Refresh] Stats sind älter als 6h, lade neu...");
    try {
      const stats = await fetchStatsFromServer();
      applyStats(stats);
      setStatus(t("statusConnected", { time: formatLastSync(stats.lastSync) }));
    } catch (err) {
      console.warn("[Auto-Refresh] fehlgeschlagen:", err.message);
    }
  }, AUTO_REFRESH_INTERVAL_MS);
}
startAutoRefresh();

function setStatus(text) {
  document.getElementById("statusText").textContent = text;
}

// ---------- Data Dragon: Champion-Liste ----------

async function loadChampionList() {
  const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  const versions = await versionsRes.json();
  const latest = versions[0];
  ddragonVersion = latest;

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

  championByApiName = {};
  for (const c of championList) {
    championByApiName[c.id] = c;
  }
  championByKey = {};
  for (const c of championList) {
    championByKey[c.key] = c;
  }
  championByNormName = {};
  for (const c of championList) {
    championByNormName[normName(c.id)] = c;
  }
}

// ---------- Server-Kommunikation ----------

function serverUrl(path) {
  return `${state.serverUrl}${path}`;
}

// GEÄNDERT: nutzt jetzt authFetch statt fetch (für Secret-Header)
async function registerWithServer() {
  const res = await authFetch(serverUrl("/register"), {
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
    const err = new Error(data.error || t("registrationFailed", { status: res.status }));
    // Bei Rate-Limit (429) liefert der Server retryAfterSeconds/retryAt
    // mit - wird hier am Error mitgegeben, damit registerAndLoad() dem
    // Nutzer anzeigen kann, WANN es wieder geht statt nur "spaeter".
    if (data.retryAt) err.retryAt = data.retryAt;
    if (data.retryAfterSeconds) err.retryAfterSeconds = data.retryAfterSeconds;
    throw err;
  }
  state.registeredRiotId = state.riotId;
  saveState();
  return res.json();
}

// Formatiert einen ISO-Zeitstempel als lokale Uhrzeit (HH:MM:SS), inkl.
// "morgen", falls der Reset erst am naechsten Tag liegt.
function formatRetryTime(retryAt) {
  try {
    const d = new Date(retryAt);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return isToday ? time : `${d.toLocaleDateString("de-DE")} ${time}`;
  } catch {
    return null;
  }
}

async function fetchStatsFromServer() {
  const encodedId = encodeURIComponent(state.riotId);
  const res = await authFetch(serverUrl(`/stats/${encodedId}`));
  if (res.status === 404) {
    throw new Error(t("rankNotRegistered404"));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || t("statsFetchFailed", { status: res.status }));
  }
  return res.json();
}

async function updateSeasonOnServer() {
  try {
    const encodedId = encodeURIComponent(state.riotId);
    const res = await authFetch(serverUrl(`/season/${encodedId}`), {
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

// ---------- NEU: registerAndLoad mit Lade-Indikator ----------
async function registerAndLoad() {
  if (!state.riotId || !state.serverUrl) {
    setStatus(t("statusEnterRiotIdServer"));
    document.getElementById("settingsPanel").classList.remove("hidden");
    return;
  }
  // /register ist rate-limitiert (5x/h pro IP) und macht beim Backend
  // fuer bereits registrierte Riot-IDs ohnehin nichts (siehe db.js
  // registerUser - existierende Nutzer werden unveraendert
  // zurueckgegeben). Daher: nur aufrufen, wenn sich die Riot-ID seit
  // der letzten erfolgreichen Registrierung geaendert hat. Spart das
  // Limit fuer Faelle wie "nur Settings-Panel erneut speichern" oder
  // App-Neustart mit unveraenderter ID.
  const needsRegister = state.riotId !== state.registeredRiotId;
  try {
    setStatus(t("statusConnecting"));
    showLoadingIndicator("Verbinde mit Server...");

    if (needsRegister) {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 8000)
      );

      try {
        await Promise.race([registerWithServer(), timeoutPromise]);
      } catch (err) {
        if (err.message === "timeout") {
          showLoadingIndicator("Server startet (Kaltstart kann 60s dauern)...");
          await registerWithServer();
        } else {
          throw err;
        }
      }
    }

    setStatus(t("statusLoadingStats"));
    showLoadingIndicator("Lade Stats...");
    const stats = await fetchStatsFromServer();
    applyStats(stats);
    setStatus(t("statusConnected", { time: formatLastSync(stats.lastSync) }));
    hideLoadingIndicator();
    showToast("Verbunden ✅", "success", 2000);
  } catch (err) {
    console.error(err);
    hideLoadingIndicator();
    // Bei Rate-Limit (429) liefert der Server retryAt mit - zeigt dem
    // Nutzer eine konkrete Uhrzeit statt nur "spaeter erneut versuchen".
    const retryTime = err.retryAt ? formatRetryTime(err.retryAt) : null;
    const msg = retryTime ? `${err.message} (wieder möglich um ${retryTime} Uhr)` : err.message;
    setStatus(t("errorPrefix") + msg);
    showToast("Verbindung fehlgeschlagen: " + msg, "error", retryTime ? 10000 : 6000);
  }
}

function applyStats(stats) {
  state.wins = stats.wins || {};
  state.winCounts = stats.winCounts || {};
  state.matchHistory = stats.matchHistory || {};
  state.lastSync = stats.lastSync || null;
  saveState();
  renderGrid();
  updateSeasonProgress();
  // Spielverlauf auf der Hauptseite (ersetzt die vorherigen Meta-Trios)
  // nach jedem Laden/Sync neu befuellen.
  const historyFilterInput = document.getElementById("placementHistoryFilter");
  renderPlacementHistoryList(historyFilterInput ? historyFilterInput.value : "");
}

function formatLastSync(lastSync) {
  return lastSync ? new Date(lastSync).toLocaleString(currentLang === "de" ? "de-DE" : "en-US") : t("neverSynced");
}

// ---------- NEU: Saison-Fortschrittsbalken ----------
function updateSeasonProgress() {
  const bar = document.getElementById("seasonProgress");
  const fill = document.getElementById("seasonProgressFill");
  const label = document.getElementById("seasonProgressLabel");
  const count = document.getElementById("seasonProgressCount");
  if (!bar || !fill || !label || !count) return;

  const wonCount = Object.keys(state.wins || {}).length;
  const total = championList.length;
  const pct = total > 0 ? Math.round((wonCount / total) * 100) : 0;

  bar.style.display = total > 0 ? "flex" : "none";
  fill.style.width = pct + "%";
  label.textContent = pct + "%";
  count.textContent = wonCount + " / " + total;
}

// ---------- Rendering ----------

const META_TIER_ORDER = ["S+", "S", "A", "B", "C", "D"];

function metaTierBadgeClass(tier) {
  if (tier === "S+") return "metaTier-splus";
  if (tier === "S") return "metaTier-s";
  if (tier === "A") return "metaTier-a";
  if (tier === "B") return "metaTier-b";
  if (tier === "C") return "metaTier-c";
  if (tier === "D") return "metaTier-d";
  return "metaTier-unknown";
}

function buildChampDiv(champ, options) {
  const showScore = options && options.showScore;
  const winCount = getWinCount(champ.key);
  const hasWin = winCount > 0;
  const hasGames = !!(state.matchHistory[champ.key] && state.matchHistory[champ.key].length > 0);

  let status;
  if (hasWin) status = "won";
  else if (hasGames) status = "lost";
  else status = "missing";

  const tierClass = getTierClass(winCount);
  const tierInfo = communityTierMap[champ.key];
  const scoreText = showScore && tierInfo && tierInfo.score != null ? tierInfo.score.toFixed(2) : null;

  const div = document.createElement("div");
  div.className = "champ " + status + (tierClass ? " " + tierClass : "");
  div.innerHTML = `
    <img src="${champ.icon}" alt="${champ.name}" />
    ${hasWin ? `<span class="winBadge">${winCount}</span>` : ""}
    <span>${champ.name}</span>
    ${scoreText ? `<span class="champScoreLabel">${scoreText}</span>` : ""}
  `;
  div.addEventListener("mouseenter", (e) => showChampTooltip(e, champ));
  div.addEventListener("mousemove", positionTooltip);
  div.addEventListener("mouseleave", hideChampTooltip);
  div.addEventListener("click", () => openChampDetail(champ));
  return { div, hasWin };
}

function renderGrid() {
  const grid = document.getElementById("grid");
  const filterText = document.getElementById("filterInput").value.toLowerCase();
  const onlyMissing = document.getElementById("onlyMissing").checked;
  const sortMode = document.getElementById("sortMode").value;

  grid.innerHTML = "";
  let wonCount = 0;

  let visible = championList.filter((c) => c.name.toLowerCase().includes(filterText));

  if (sortMode === "wins") {
    visible = visible.slice().sort((a, b) => {
      const diff = getWinCount(b.key) - getWinCount(a.key);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
  }

  if (sortMode === "tier") {
    const groups = {};
    for (const tier of META_TIER_ORDER) groups[tier] = [];
    groups.unknown = [];

    for (const champ of visible) {
      const winCount = getWinCount(champ.key);
      const hasWin = winCount > 0;
      if (onlyMissing && hasWin) continue;
      const tierInfo = communityTierMap[champ.key];
      const tier = tierInfo && tierInfo.tier;
      const bucket = tier && groups[tier] ? tier : "unknown";
      groups[bucket].push(champ);
      if (hasWin) wonCount++;
    }
    for (const tier of META_TIER_ORDER) {
      groups[tier].sort((a, b) => {
        const scoreA = (communityTierMap[a.key] && communityTierMap[a.key].score) || 0;
        const scoreB = (communityTierMap[b.key] && communityTierMap[b.key].score) || 0;
        return scoreB - scoreA || a.name.localeCompare(b.name);
      });
    }
    groups.unknown.sort((a, b) => a.name.localeCompare(b.name));

    const orderedTiers = [...META_TIER_ORDER, "unknown"];
    for (const tier of orderedTiers) {
      const champs = groups[tier];
      if (!champs.length) continue;

      const header = document.createElement("div");
      header.className = "tierSectionHeader";
      header.innerHTML = `
        <span class="metaTierBadge ${metaTierBadgeClass(tier)}">${tier === "unknown" ? "?" : tier}</span>
        <span class="tierSectionLabel">${tier === "unknown" ? t("tierUnknown") : t("tierSectionStufe")}</span>
        <span class="tierSectionCount">${champs.length}</span>
      `;
      grid.appendChild(header);

      const subGrid = document.createElement("div");
      subGrid.className = "tierSectionGrid";
      for (const champ of champs) {
        const { div } = buildChampDiv(champ, { showScore: true });
        subGrid.appendChild(div);
      }
      grid.appendChild(subGrid);
    }

    document.getElementById("summaryText").textContent =
      t("summaryWon", { won: wonCount, total: championList.length });
    updateOverallStats();
    updateSeasonProgress();
    return;
  }

  for (const champ of visible) {
    const winCount = getWinCount(champ.key);
    const hasWin = winCount > 0;
    if (hasWin) wonCount++;
    if (onlyMissing && hasWin) continue;

    const { div } = buildChampDiv(champ);
    grid.appendChild(div);
  }

  document.getElementById("summaryText").textContent =
    t("summaryWon", { won: wonCount, total: championList.length });

  updateOverallStats();
  updateSeasonProgress();
}

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
    history.forEach((g, idx) => {
      const isWin = g.placement === 1;
      const dateStr = formatDateDDMM(g.date);
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
      // NEU: Zeile klickbar - oeffnet die volle Match-Detailansicht
      // (Items/Augments/Runen/Spells/Stats), statt nur Datum+Platzierung.
      html += `<li class="clickableRow ${isWin ? "tooltipWin" : "tooltipLose"}" data-history-idx="${idx}">
        <div class="tooltipDate">${dateStr} ${placementBadge}</div>
        <div class="tooltipMates">${mates}</div>
      </li>`;
    });
    html += `</ul>`;
  }

  tooltip.innerHTML = html;
  tooltip.classList.remove("hidden");
  positionTooltip(e);

  tooltip.querySelectorAll(".tooltipList li[data-history-idx]").forEach((li) => {
    li.addEventListener("click", (evt) => {
      evt.stopPropagation();
      const idx = parseInt(li.dataset.historyIdx, 10);
      const g = history[idx];
      if (g) openMatchFromTooltip(champ, g, idx);
    });
  });
}

// NEU: oeffnet ein Match, das ueber den Champion-Tooltip angeklickt wurde,
// direkt in der vollen Match-Detailansicht (dieselbe wie im "Verlauf"-Tab
// der Platzierungsstatistik) - spart einen Umweg ueber die Match-Liste.
function openMatchFromTooltip(champ, g, historyIndex) {
  hideChampTooltip();
  openMatchDetail({ ...g, champKey: champ.key, champ, historyIndex });
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

// Datum immer in fester Tag/Monat(/Jahr)-Reihenfolge anzeigen, unabhaengig
// von der Sprache/Locale - toLocaleDateString() wuerde bei "en-US" sonst
// MM/DD/YYYY liefern, was hier explizit nicht gewuenscht ist.
function formatDateDDMM(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}
function formatDateDDMMYYYY(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
function formatDateTimeDDMMYYYY(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${formatDateDDMMYYYY(ms)} ${hh}:${min}`;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

async function loadMetaData() {
  try {
    const res = await authFetch(serverUrl("/meta"));
    if (!res.ok) return;
    const data = await res.json();
    metaData = data;
    renderTop30TrioSection();
  } catch (err) {
    console.error("Meta-Daten konnten nicht geladen werden:", err);
  }
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
      const names = [c.champion, ...(c.partners || [])];
      const iconsHtml = names.map((n) => {
        const champ = championByNormName[normName(n)];
        return champ
          ? `<img src="${champ.icon}" alt="${n}" class="trioChampIcon" />`
          : `<span class="dbIconFallback trioChampIconFallback">${n.slice(0, 2).toUpperCase()}</span>`;
      }).join("");
      const comboTitle = names.join("+");
      const winRateText = typeof c.winRate === "number" ? `${c.winRate.toFixed(1)}%` : "";
      html += `
        <li>
          <span class="detailTrioRank">${i + 1}.</span>
          <span class="metaTier">${c.tier || ""}</span>
          <span class="detailTrioNames trioIconGroup" title="${comboTitle}">${iconsHtml}</span>
          <span class="detailWinRate">${winRateText}</span>
        </li>
      `;
    });
    html += `</ul>`;
  }
  section.innerHTML = html;
}

// ---- Externe Meta-Trios, getrennt von den eigenen
// gespielten Trios oben. Eigene Collection "externalTrioMeta" im
// Backend, eigener Endpoint /community-meta-trios. Wird einmal beim
// Start geladen (kein automatisches Re-Fetch, da sich diese Daten nur
// per manuellem Re-Import aendern, nicht durch eigene Matches).
let externalTrioData = null;

async function loadExternalTrioMeta() {
  try {
    const res = await authFetch(serverUrl("/community-meta-trios?limit=30"));
    if (!res.ok) return;
    externalTrioData = await res.json();
    renderExternalTrioSection();
  } catch (err) {
    console.error("[ExternalTrioMeta] Laden fehlgeschlagen:", err);
  }
}

function renderExternalTrioSection() {
  const section = document.getElementById("externalTrio");
  if (!section) return;
  const combos = Array.isArray(externalTrioData) ? externalTrioData : [];

  let html = `<h3>${t("externalTrioHeading")}</h3>`;
  if (combos.length === 0) {
    html += `<p class="detailEmpty">${t("champDetailNoPartners")}</p>`;
  } else {
    html += `<ul class="detailTrioList">`;
    combos.slice(0, 30).forEach((c, i) => {
      const names = c.champions || [];
      const iconsHtml = names.map((n) => {
        const champ = championByNormName[normName(n)];
        return champ
          ? `<img src="${champ.icon}" alt="${n}" class="trioChampIcon" />`
          : `<span class="dbIconFallback trioChampIconFallback">${n.slice(0, 2).toUpperCase()}</span>`;
      }).join("");
      // Gemeinsamer Tooltip auf der ganzen Gruppe statt pro Icon einzeln -
      // zeigt beim Hover die komplette Trio-Kombo, z.B. "Master Yi+Taric+Yumi".
      const comboTitle = names.join("+");
      const winRateText = typeof c.winRate === "number" ? `${c.winRate.toFixed(1)}%` : "";
      html += `
        <li>
          <span class="detailTrioRank">${i + 1}.</span>
          <span class="detailTrioNames trioIconGroup" title="${comboTitle}">${iconsHtml}</span>
          <span class="detailWinRate">${winRateText}</span>
        </li>
      `;
    });
    html += `</ul>`;
  }
  section.innerHTML = html;
}

// ============================================================
// Items & Augments Browser (eigenes Vollbild-Modal)
// ============================================================
// Daten kommen einmalig importiert aus /arena-augments + /arena-items
// (kein Live-CDragon-Request). Lazy geladen, erst beim ersten Oeffnen
// des Modals - nicht beim App-Start, um die Erstladezeit nicht zu
// belasten.
let arenaAugmentsData = null;
let arenaItemsData = null;
let iaTooltipEl = null;
let iaSelectedEntry = null; // { entry, kind: "augment"|"item" } oder null
let iaAugmentByApiName = {};
let iaAugmentByName = {};
let iaItemByName = {};
// Numerische Riot-IDs -> Augment/Item-Eintrag, fuer den Spielverlauf (die
// rohen Match-Daten von Riot liefern nur numerische IDs, kein apiName).
// Wird defensiv befuellt: falls die importierten CDragon-Datensaetze kein
// numerisches id-Feld enthalten, bleibt die Map leer und die Anzeige faellt
// auf einen Platzhalter mit der rohen ID zurueck, statt etwas zu erfinden.
let iaAugmentById = {};
let iaItemById = {};

// Beschwoererzauber (Data Dragon) - fuer die Icon-Anzeige im Spielverlauf.
// Numerische spell-ID (aus summoner1Id/summoner2Id) -> {name, icon}.
let summonerSpellByKey = {};
let summonerSpellDataLoaded = false;
async function loadSummonerSpellData() {
  if (summonerSpellDataLoaded) return true;
  try {
    if (!ddragonVersion) await loadChampionList();
    const res = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/${currentLang === "de" ? "de_DE" : "en_US"}/summoner.json`
    );
    const data = await res.json();
    summonerSpellByKey = {};
    for (const spell of Object.values(data.data || {})) {
      summonerSpellByKey[String(spell.key)] = {
        name: spell.name,
        icon: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${spell.image.full}`
      };
    }
    summonerSpellDataLoaded = true;
    return true;
  } catch (err) {
    console.error("[SummonerSpells] Laden fehlgeschlagen:", err);
    return false;
  }
}

// Runen (Data Dragon) - numerische Perk-ID -> {name, icon}. Nur die
// einzelnen Runen selbst (nicht die Baum-Icons), da genau das in
// g.perks pro Match gespeichert wird (siehe syncUser.js: perks =
// styles.flatMap(selections).map(perk)).
let runeById = {};
let runeDataLoaded = false;
async function loadRuneData() {
  if (runeDataLoaded) return true;
  try {
    if (!ddragonVersion) await loadChampionList();
    const res = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/${currentLang === "de" ? "de_DE" : "en_US"}/runesReforged.json`
    );
    const data = await res.json();
    runeById = {};
    for (const tree of data || []) {
      for (const slot of tree.slots || []) {
        for (const rune of slot.runes || []) {
          runeById[rune.id] = {
            name: rune.name,
            icon: `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`
          };
        }
      }
    }
    runeDataLoaded = true;
    return true;
  } catch (err) {
    console.error("[Runes] Laden fehlgeschlagen:", err);
    return false;
  }
}
let iaSearchTerm = "";
let iaEditMode = false;
let iaEditingAnchor = null; // { entry, kind } - die Entitaet, die aktuell bearbeitet wird
let iaEditingPartnerIds = new Set(); // "type:key" der aktuellen Synergie-Partner des Ankers
let iaEditSearchTerm = ""; // Suchbegriff im Synergie-Editor-Grid
let iaCategoryFilter = ""; // "" = alle, sonst Key aus IA_CATEGORIES
let iaColumnFilter = null; // null = beide Spalten, "augment" = nur Augments, "item" = nur Items
let iaTierListMode = false; // true = Kacheln in der normalen Browse-Ansicht werden nach Tierlist-Winrate sortiert + mit Winrate-Badge versehen
let iaTierListData = null; // Array aus /item-augment-tierlist: {kind,id,games,wins,winrate,topPartners,percentileTier}
let iaTierListByKey = null; // Map "kind:id" -> Zeile aus iaTierListData, fuer schnellen Lookup pro Kachel
let iaPresetMode = false;
let iaPresetSearchTerm = "";
let iaPresetSelectedEntries = new Map(); // iaEntityId -> {type, key, name, icon, tier}
let iaEditingPresetId = null; // _id des Presets im Bearbeiten-Modus, null = Neuanlage
let editingBuildId = null;    // _id des Champion-Builds im Bearbeiten-Modus, null = kein Build-Edit
let editingBuildNotes = "";   // Notes des Builds bleiben beim Speichern erhalten
let editingBuildChampKey = null;
let editingSkillOrder = [];   // [{round, key}] - nur im Build-Editor relevant
let iaPresetsCache = null; // alle existierenden Presets vom Server

// Inhaltliche Kategorien per Stichwort-Abgleich (DE+EN) gegen Name +
// Beschreibung eines Augments/Items. Bewusst simple Substring-Suche
// statt echter NLP - reicht fuer "zeig mir alles mit Heilung" o.ae.
// und ist sofort nachvollziehbar/erweiterbar.
const IA_CATEGORIES = {
  healing: {
    labelDe: "Heilung", labelEn: "Healing",
    keywords: ["heal", "lifesteal", "omnivamp", "regenerat", "heilen", "heilung", "lebensraub", "lebensentzug"]
  },
  damage: {
    labelDe: "Schaden", labelEn: "Damage",
    keywords: ["damage", "schaden", "ability power", "attack damage", "fähigkeitsstärke", "angriffsschaden"]
  },
  health: {
    labelDe: "Leben", labelEn: "Health",
    keywords: ["health", "max hp", "leben", "lebenspunkte", "gesundheit"]
  },
  resistance: {
    labelDe: "Resistenzen", labelEn: "Resistances",
    keywords: ["armor", "magic resist", "rüstung", "resistenz", "magieresistenz"]
  },
  movement: {
    labelDe: "Tempo/Bewegung", labelEn: "Movement/Haste",
    keywords: ["move speed", "ability haste", "dash", "slow", "bewegungstempo", "fähigkeitstempo", "verlangsam"]
  },
  shield: {
    labelDe: "Schild", labelEn: "Shield",
    keywords: ["shield", "schild"]
  },
  crit: {
    labelDe: "Crit", labelEn: "Crit",
    keywords: ["critical strike", "crit chance", "kritisch", "krit"]
  },
  attackSpeed: {
    labelDe: "Angriffstempo", labelEn: "Attack Speed",
    keywords: ["attack speed", "angriffstempo"]
  },
  utility: {
    labelDe: "Utility", labelEn: "Utility",
    keywords: ["cooldown", "mana", "abklingzeit"]
  },
  cc: {
    labelDe: "CC", labelEn: "CC",
    keywords: [
      "stun", "betäub", "root", "wurzel", "snare", "fessel", "knock up", "knockup", "hochschleuder",
      "knockback", "zurückstoß", "fear", "furcht", "charm", "bezauber", "taunt", "verspott",
      "silence", "zum schweigen", "suppress", "unterdrück", "polymorph", "verwandl",
      "immobiliz", "festsetz", "bewegungsunfähig", "slow", "verlangsam",
      "crowd control", "kontrollierten gegner", "stunned enemy", "immobilized enemy"
    ]
  }
};

function iaEntryCategories(entry, name, desc) {
  const haystack = normName(`${name} ${desc}`);
  return Object.keys(IA_CATEGORIES).filter((key) =>
    IA_CATEGORIES[key].keywords.some((kw) => haystack.includes(normName(kw)))
  );
}

async function loadArenaItemsAugments() {
  if (arenaAugmentsData && arenaItemsData) return true;
  try {
    const [augRes, itemRes] = await Promise.all([
      authFetch(serverUrl("/arena-augments")),
      authFetch(serverUrl("/arena-items"))
    ]);
    if (!augRes.ok || !itemRes.ok) throw new Error("HTTP " + augRes.status + "/" + itemRes.status);
    arenaAugmentsData = await augRes.json();
    arenaItemsData = await itemRes.json();
    iaAugmentByApiName = {};
    iaAugmentByName = {};
    iaAugmentById = {};
    for (const a of arenaAugmentsData) {
      iaAugmentByApiName[a.apiName] = a;
      if (a.name) {
        if (a.name.de) iaAugmentByName[normName(a.name.de)] = a;
        if (a.name.en) iaAugmentByName[normName(a.name.en)] = a;
      }
      // Defensiv: nur befuellen, falls der importierte CDragon-Datensatz
      // tatsaechlich eine numerische ID mitfuehrt (Feldname je nach
      // Import-Version evtl. "id" oder "augmentId").
      const numId = a.id ?? a.augmentId;
      if (numId !== undefined && numId !== null) iaAugmentById[numId] = a;
    }
    iaItemByName = {};
    iaItemById = {};
    for (const i of arenaItemsData) {
      iaItemByName[normName(i.name.de)] = i;
      iaItemByName[normName(i.name.en)] = i;
      const numId = i.id ?? i.itemId;
      if (numId !== undefined && numId !== null) iaItemById[numId] = i;
    }
    return true;
  } catch (err) {
    console.error("[ItemsAugments] Laden fehlgeschlagen:", err);
    return false;
  }
}

function openItemsAugmentsModal() {
  document.getElementById("itemsAugmentsOverlay").classList.remove("hidden");
  const searchInput = document.getElementById("iaSearchInput");
  if (searchInput) searchInput.value = "";
  iaSearchTerm = "";
  iaColumnFilter = null; // startet immer wieder mit "All" (beide Spalten sichtbar)
  iaBrowseGroupMode = true;
  const groupCb = document.getElementById("iaBrowseGroupToggle");
  if (groupCb) groupCb.checked = true;
  applyIaColumnFilter();
  renderItemsAugmentsModal();
  loadArenaItemsAugments().then((ok) => {
    if (ok) renderItemsAugmentsModal();
    else {
      document.getElementById("iaAugmentsList").innerHTML = `<p class="detailEmpty">${t("iaLoadError")}</p>`;
    }
  });
}

function closeItemsAugmentsModal() {
  document.getElementById("itemsAugmentsOverlay").classList.add("hidden");
  hideIaTooltip();
  backToItemsAugmentsBrowse();
  if (iaTierListMode) {
    iaTierListMode = false;
    setIaTierListToggleUnchecked();
  }
  backToTierListOverview();
  iaColumnFilter = null;
  applyIaColumnFilter();
}

// Zentrierter "All"/"Augments"/"Items"-Umschalter oben im Items&Augments-
// Browser: blendet wahlweise eine der beiden Spalten aus, um sich auf
// eine Liste zu konzentrieren, oder zeigt bei "All" wieder beide.
// Reine Sichtbarkeits-Umschaltung per CSS-Klasse auf den fest im DOM
// stehenden Spalten-Containern - kein Neu-Rendern der Kacheln noetig.
function selectIaColumnFilter(kind) {
  iaColumnFilter = kind === "all" ? null : kind;
  applyIaColumnFilter();
}

function applyIaColumnFilter() {
  const allBtn = document.getElementById("iaShowAllBtn");
  const augBtn = document.getElementById("iaShowAugmentsBtn");
  const itemBtn = document.getElementById("iaShowItemsBtn");
  const augCol = document.getElementById("iaAugmentsCol");
  const itemCol = document.getElementById("iaItemsCol");
  allBtn?.classList.toggle("active", iaColumnFilter === null);
  augBtn?.classList.toggle("active", iaColumnFilter === "augment");
  itemBtn?.classList.toggle("active", iaColumnFilter === "item");
  augCol?.classList.toggle("iaColHidden", iaColumnFilter === "item");
  itemCol?.classList.toggle("iaColHidden", iaColumnFilter === "augment");
}

// "Gruppieren"-Checkbox (genau wie bei My Stats): schaltet zwischen der
// Rarity-Kategorie-Ansicht (Silver/Gold/Prismatic bzw. Quest/Boots/...,
// jeweils mit S/A/B/C/D-Unterabschnitten im Tier-Liste-Modus) und einer
// einzigen flachen, ungruppierten Liste um.
let iaBrowseGroupMode = true;

function toggleIaBrowseGroupMode() {
  const cb = document.getElementById("iaBrowseGroupToggle");
  iaBrowseGroupMode = cb ? cb.checked : true;
  renderItemsAugmentsModal();
}

const IA_AUGMENT_TIERS = ["silver", "gold", "prismatic"];
const IA_ITEM_TIERS = ["quest", "boots", "legendary", "prismatic", "anvil", "juice"];

function iaEntryName(entry) {
  return (entry.name && entry.name[currentLang]) || (entry.name && entry.name.de) || "";
}
function iaEntryDesc(entry) {
  return (entry.desc && entry.desc[currentLang]) || (entry.desc && entry.desc.de) || "";
}

// Baut die kompakte Entitaets-Referenz, die die generische Synergie-API
// erwartet/zurueckgibt. key = apiName bei Augments, EN-Name bei Items
// (stabiler als der jeweils aktuell angezeigte Sprachname).
// Wichtig: apiName kann bei manchen Augments null sein. Ohne Fallback
// wuerden dann mehrere unterschiedliche Augments dieselbe ID
// ("augment:null") teilen und liessen sich nur noch gemeinsam
// an-/abwaehlen (Bug, siehe iaEntityId-Kollision).
function iaAugmentKey(entry) {
  if (entry.apiName) return entry.apiName;
  const nameEn = entry.name && entry.name.en;
  const nameDe = entry.name && entry.name.de;
  return nameEn || nameDe || `noapiname-${entry.icon || Math.random().toString(36).slice(2)}`;
}
function iaEntityRef(entry, kind) {
  return {
    type: kind,
    key: kind === "augment" ? iaAugmentKey(entry) : entry.name.en,
    name: entry.name,
    icon: entry.icon || null,
    tier: entry.tier
  };
}
function iaEntityId(ref) {
  return `${ref.type}:${ref.key}`;
}

// Loest fuer ein Augment-/Item-Objekt (wie es in arenaAugmentsData/
// arenaItemsData vorliegt) die passende Tierlist-Zeile auf (Winrate,
// Spielanzahl, Top-5-Partner) - oder null, falls dafuer noch keine
// Tierlist-Daten vorliegen (z.B. weniger als die Mindestanzahl Spiele).
function iaTierlistRowForEntry(entry, kind) {
  if (!iaTierListByKey || !entry) return null;
  const numId = entry.id ?? entry.augmentId ?? entry.itemId;
  if (numId === undefined || numId === null) return null;
  return iaTierListByKey.get(`${kind}:${numId}`) || null;
}

// Baut das HTML fuer eine einzelne Kachel - mit optionalem Winrate-
// Badge (nur im Tier-Liste-Modus). "allEntries" ist immer die volle,
// ungefilterte Liste (dieselbe Referenz, die auch bindIaTileEvents
// bekommt), damit data-idx zum richtigen Eintrag zurueckfindet.
function renderIaTileHtml(e, kind, allEntries, row) {
  const name = iaEntryName(e);
  const dataAttr = kind === "augment" ? ` data-augment="${e.apiName}"` : ` data-item="${name}"`;
  const idx = allEntries.indexOf(e);
  const wrClass = row && (row.percentileTier === "S" || row.percentileTier === "A" || row.percentileTier === "B") ? "good" : "bad";
  const badgeHtml = row
    ? `<span class="iaStatsTileGames">${row.games}×</span><span class="iaStatsTileWr ${wrClass}">${row.winrate}%</span>`
    : "";
  if (e.icon) {
    return `<div class="iaTile"${dataAttr} data-kind="${kind}" data-idx="${idx}" data-name="${name}">
      <img src="${e.icon}" alt="${name}" loading="lazy" />${badgeHtml}
    </div>`;
  }
  return `<div class="iaTile fallback"${dataAttr} data-kind="${kind}" data-idx="${idx}" data-name="${name}">${name.slice(0, 3)}${badgeHtml}</div>`;
}

const IA_PERCENTILE_TIER_ORDER = ["S", "A", "B", "C", "D"];

// Teilt eine Rarity-Kategorie (z.B. "SILVER") im Tier-Liste-Modus
// zusaetzlich in S/A/B/C/D-Abschnitte auf (Perzentil-Rang aus
// loadItemAugmentTierlist), jeweils intern nach Winrate sortiert.
// Eintraege ohne ausreichende Tierlist-Daten landen in einem eigenen
// "ohne Daten"-Abschnitt am Ende statt einfach zu verschwinden.
function renderIaTierlistSubGroups(tierEntries, kind, allEntries, rowLookupFn) {
  const lookup = rowLookupFn || iaTierlistRowForEntry;
  const buckets = { S: [], A: [], B: [], C: [], D: [] };
  const noData = [];
  for (const e of tierEntries) {
    const row = lookup(e, kind);
    if (row && row.percentileTier) buckets[row.percentileTier].push({ e, row });
    else noData.push({ e, row: null });
  }
  let html = `<div class="iaTierSubGroups">`;
  for (const key of IA_PERCENTILE_TIER_ORDER) {
    const list = buckets[key];
    if (!list.length) continue;
    list.sort((a, b) => b.row.winrate - a.row.winrate || b.row.games - a.row.games);
    html += `<div class="iaTierGroup iaTierSubGroup"><div class="iaTierLabel iaTierSubLabel tier-${key}" data-tier-toggle>${key} ${t("iaTierSuffix")} (${list.length})</div><div class="iaGrid">`;
    for (const { e, row } of list) html += renderIaTileHtml(e, kind, allEntries, row);
    html += `</div></div>`;
  }
  if (noData.length) {
    html += `<div class="iaTierGroup iaTierSubGroup"><div class="iaTierLabel iaTierSubLabel tier-none" data-tier-toggle>${t("iaTierListNoData")} (${noData.length})</div><div class="iaGrid">`;
    for (const { e } of noData) html += renderIaTileHtml(e, kind, allEntries, null);
    html += `</div></div>`;
  }
  html += `</div>`;
  return html;
}

function renderIaTierGroup(entries, tier, kind, showTierlistStats, rowLookupFn) {
  const tierEntries = entries.filter((e) => e.tier === tier);
  if (tierEntries.length === 0) return "";
  const label = t("iaTier" + tier.charAt(0).toUpperCase() + tier.slice(1));
  let html = `<div class="iaTierGroup"><div class="iaTierLabel tier-${tier}" data-tier-toggle>${label} (${tierEntries.length})</div>`;
  if (showTierlistStats) {
    html += renderIaTierlistSubGroups(tierEntries, kind, entries, rowLookupFn);
  } else {
    html += `<div class="iaGrid">`;
    for (const e of tierEntries) html += renderIaTileHtml(e, kind, entries, null);
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

// Ungruppierte Ansicht ("Gruppieren"-Checkbox aus): die Rarity-
// Kategorien (Silver/Gold/Prismatic bzw. Quest/Boots/...) entfallen,
// aber die S/A/B/C/D-Tierliste selbst bleibt sichtbar (ist schliesslich
// der Sinn des Tier-Liste-Knopfs) - nur eben ueber ALLE Eintraege
// hinweg statt pro Kategorie. Ohne aktive Tier-Liste (keine Winrate-
// Daten) gibt es dafuer einfach ein einziges flaches Grid ohne Badges.
function renderIaFlatList(entries, kind, showTierlistStats, rowLookupFn) {
  if (showTierlistStats) {
    return renderIaTierlistSubGroups(entries, kind, entries, rowLookupFn);
  }
  let html = `<div class="iaGrid">`;
  for (const e of entries) html += renderIaTileHtml(e, kind, entries, null);
  html += `</div>`;
  return html;
}

function renderItemsAugmentsModal() {
  const augList = document.getElementById("iaAugmentsList");
  const itemList = document.getElementById("iaItemsList");
  if (!augList || !itemList) return;

  const term = normName(iaSearchTerm);
  const filterByTerm = (e) => {
    const name = iaEntryName(e);
    const desc = iaEntryDesc(e);
    const matchesTerm = !term || normName(name).includes(term) || normName(desc).includes(term);
    const matchesCategory = !iaCategoryFilter || iaEntryCategories(e, name, desc).includes(iaCategoryFilter);
    return matchesTerm && matchesCategory;
  };

  const augments = (arenaAugmentsData || []).filter(filterByTerm);
  const items = (arenaItemsData || []).filter(filterByTerm);

  // Tier-Liste-Modus: die bestehenden Rarity-Kategorien (Silver/Gold/
  // Prismatic bzw. Quest/Boots/Legendary/...) bleiben unveraendert -
  // innerhalb jeder Kategorie kommt zusaetzlich eine S/A/B/C/D-
  // Perzentil-Einteilung dazu (siehe renderIaTierlistSubGroups).
  const tierlistActive = iaTierListMode && !!iaTierListByKey;

  augList.innerHTML = !augments.length
    ? `<p class="detailEmpty">–</p>`
    : iaBrowseGroupMode
      ? IA_AUGMENT_TIERS.map((tier) => renderIaTierGroup(augments, tier, "augment", tierlistActive)).join("")
      : renderIaFlatList(augments, "augment", tierlistActive);
  itemList.innerHTML = !items.length
    ? `<p class="detailEmpty">–</p>`
    : iaBrowseGroupMode
      ? IA_ITEM_TIERS.map((tier) => renderIaTierGroup(items, tier, "item", tierlistActive)).join("")
      : renderIaFlatList(items, "item", tierlistActive);

  bindIaTileEvents(augList, augments);
  bindIaTileEvents(itemList, items);
}

function bindIaTileEvents(container, entries, kindFilter) {
  container.querySelectorAll(".iaTile").forEach((tile) => {
    const kind = tile.dataset.kind;
    if (kindFilter && kind !== kindFilter) return;
    const idx = parseInt(tile.dataset.idx, 10);
    const entry = entries[idx];
    if (!entry) return;
    tile.addEventListener("mouseenter", (e) => showIaTooltip(e, entry, kind));
    tile.addEventListener("mousemove", positionIaTooltip);
    tile.addEventListener("mouseleave", hideIaTooltip);
    tile.addEventListener("click", () => {
      if (iaEditMode) {
        startEditingEntity(entry, kind);
        return;
      }
      // Im Tier-Liste-Modus zeigt ein Klick die echten Top-5-Partner
      // (aus den Spielerdaten berechnet) statt der handkuratierten
      // Synergien.
      if (iaTierListMode) {
        const row = iaTierlistRowForEntry(entry, kind);
        if (row) selectTierListEntry(row, entry);
        return;
      }
      selectEntryForFilter(entry, kind);
    });
  });
}

// Klick auf ein Augment ODER Item: blendet die normale Browse-Ansicht
// aus und zeigt nur noch das ausgewaehlte Element (gross, mit Name +
// Beschreibung) plus die dazu passenden Synergie-Treffer, sortiert
// nach deren Tier. Erneuter Klick auf dasselbe Element -> zurueck zur
// normalen Ansicht.
async function selectEntryForFilter(entry, kind) {
  const sameEntrySelected = iaSelectedEntry &&
    iaSelectedEntry.kind === kind &&
    iaEntryName(iaSelectedEntry.entry) === iaEntryName(entry) &&
    (kind !== "augment" || iaSelectedEntry.entry.apiName === entry.apiName);
  if (sameEntrySelected) {
    backToItemsAugmentsBrowse();
    return;
  }

  iaSelectedEntry = { entry, kind };
  hideIaTooltip();
  document.getElementById("itemsAugmentsBody").classList.add("hidden");
  document.getElementById("iaSearchInput").classList.add("hidden");
  document.getElementById("iaDetailView").classList.remove("hidden");
  document.getElementById("itemsAugmentsClearFilter").classList.remove("hidden");

  renderIaSelectedCard(entry);
  renderIaSynergyResults(null, true); // Lade-Zustand

  try {
    const ref = iaEntityRef(entry, kind);
    const res = await authFetch(serverUrl(`/synergy/${ref.type}/${encodeURIComponent(ref.key)}`));
    const partners = res.ok ? await res.json() : [];
    renderIaSynergyResults(partners, false);
  } catch (err) {
    console.error("[ItemsAugments] Synergie-Lookup fehlgeschlagen:", err);
    renderIaSynergyResults([], false);
  }
}

function backToItemsAugmentsBrowse() {
  iaSelectedEntry = null;
  document.getElementById("itemsAugmentsBody").classList.remove("hidden");
  document.getElementById("iaSearchInput").classList.remove("hidden");
  document.getElementById("iaDetailView").classList.add("hidden");
  document.getElementById("itemsAugmentsClearFilter").classList.add("hidden");
}

// ============================================================
// Zugriffsschutz: Synergie-Editor und Preset-Erstellung nur mit Code
// Der Code wird serverseitig geprueft (siehe editAuth.js im Backend) -
// im Frontend steht kein Code, nur das nach Erfolg ausgestellte,
// zeitlich begrenzte Token (12h, in sessionStorage).
// ============================================================
async function requireIaCode(callback) {
  if (getIaEditToken()) { callback(); return; }
  const input = window.prompt(t("iaCodePrompt"));
  if (input === null) return; // Abbruch
  try {
    const res = await fetch(serverUrl("/auth/edit-code"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: input })
    });
    if (!res.ok) {
      alert(t("iaCodeWrong"));
      return;
    }
    const data = await res.json();
    if (!data.token) {
      alert(t("iaCodeWrong"));
      return;
    }
    setIaEditToken(data.token);
    callback();
  } catch (err) {
    console.error("[ItemsAugments] Code-Pruefung fehlgeschlagen:", err);
    alert(t("iaCodeWrong"));
  }
}

// ============================================================
// Synergie-Editor (Browser-UI statt manueller MongoDB-Eingriffe)
// ============================================================
function toggleIaEditMode() {
  if (!iaEditMode && !getIaEditToken()) { requireIaCode(toggleIaEditMode); return; }
  iaEditMode = !iaEditMode;
  const btn = document.getElementById("iaEditModeBtn");
  if (btn) {
    btn.classList.toggle("active", iaEditMode);
    btn.textContent = iaEditMode ? t("iaEditModeBtnActive") : t("iaEditModeBtn");
  }
  if (iaEditMode) {
    if (iaPresetMode) { iaPresetMode = false; document.getElementById("iaPresetModeBtn")?.classList.remove("active"); cancelIaPreset(); }
    if (iaTierListMode) { iaTierListMode = false; setIaTierListToggleUnchecked(); backToTierListOverview(); }
    backToItemsAugmentsBrowse(); // Detail-/Filteransicht verlassen, falls offen
    document.getElementById("itemsAugmentsBody").classList.remove("hidden");
    document.getElementById("iaEditView").classList.add("hidden");
    iaEditingAnchor = null;
  } else {
    cancelIaEdit();
  }
}

// Anker fuer den Editor setzen - kann JEDES Augment oder Item sein.
// Zeigt darunter ALLE anderen Augments+Items zum An-/Abklicken; jede
// Verbindung ist sofort in beide Richtungen sichtbar (siehe db.js).
async function startEditingEntity(entry, kind) {
  iaEditingAnchor = { entry, kind };
  iaEditingPartnerIds = new Set();
  iaEditSearchTerm = "";
  const editSearchInput = document.getElementById("iaEditSearchInput");
  if (editSearchInput) editSearchInput.value = "";
  document.getElementById("itemsAugmentsBody").classList.add("hidden");
  document.getElementById("iaSearchInput").classList.add("hidden");
  document.getElementById("iaEditView").classList.remove("hidden");
  hideIaTooltip();

  const card = document.getElementById("iaEditSelectedCard");
  const name = iaEntryName(entry);
  card.innerHTML = `
    ${entry.icon ? `<img src="${entry.icon}" alt="${name}" />` : ""}
    <span class="iaSelectedName">${name}</span>
  `;
  document.getElementById("iaEditStatus").textContent = "";
  renderIaEditTargetGrid();

  // Bestehende Verbindungen laden, damit man nicht von Null anfaengt.
  try {
    const ref = iaEntityRef(entry, kind);
    const res = await authFetch(serverUrl(`/synergy/${ref.type}/${encodeURIComponent(ref.key)}`));
    const partners = res.ok ? await res.json() : [];
    iaEditingPartnerIds = new Set(partners.map(iaEntityId));
  } catch (err) {
    console.error("[ItemsAugments-Editor] Laden fehlgeschlagen:", err);
  }
  renderIaEditTargetGrid();
}

// Zeigt ALLE Augments + Items als Ziel-Grid (Anker selbst ausgenommen).
function renderIaEditTargetGrid() {
  const grid = document.getElementById("iaEditItemsGrid");
  if (!grid) return;
  if (!iaEditingAnchor) {
    grid.innerHTML = `<p class="detailEmpty">${t("iaEditHintChooseAugment")}</p>`;
    return;
  }
  const anchorRef = iaEntityRef(iaEditingAnchor.entry, iaEditingAnchor.kind);
  const anchorId = iaEntityId(anchorRef);

  const term = normName(iaEditSearchTerm);
  const filterByTerm = (e) => {
    const name = iaEntryName(e);
    const desc = iaEntryDesc(e);
    const matchesTerm = !term || normName(name).includes(term) || normName(desc).includes(term);
    const matchesCategory = !iaCategoryFilter || iaEntryCategories(e, name, desc).includes(iaCategoryFilter);
    return matchesTerm && matchesCategory;
  };

  const augments = (arenaAugmentsData || [])
    .filter((a) => iaEntityId(iaEntityRef(a, "augment")) !== anchorId)
    .filter(filterByTerm);
  const items = (arenaItemsData || [])
    .filter((i) => iaEntityId(iaEntityRef(i, "item")) !== anchorId)
    .filter(filterByTerm);

  let html = `<h4>${t("iaAugmentsHeading")}</h4>` +
    IA_AUGMENT_TIERS.map((tier) => renderIaTierGroup(augments, tier, "augment")).join("");
  html += `<h4>${t("iaItemsHeading")}</h4>` +
    IA_ITEM_TIERS.map((tier) => renderIaTierGroup(items, tier, "item")).join("");
  grid.innerHTML = html;

  markIaEditTiles(grid, augments, "augment");
  markIaEditTiles(grid, items, "item");
}

// Markiert Kacheln als verbunden (gruener Rahmen + "✕") oder nicht
// (Standard-Rahmen + "+") und bindet den Klick auf sofortiges
// Hinzufuegen/Entfernen ueber die Synergie-API.
function markIaEditTiles(container, entries, kindFilter) {
  container.querySelectorAll(".iaTile").forEach((tile) => {
    if (tile.dataset.kind !== kindFilter) return;
    const idx = parseInt(tile.dataset.idx, 10);
    const entry = entries[idx];
    if (!entry) return;
    const ref = iaEntityRef(entry, kindFilter);
    const id = iaEntityId(ref);
    const isLinked = iaEditingPartnerIds.has(id);

    tile.classList.toggle("synergySelected", isLinked);
    if (!tile.querySelector(".iaEditBadge")) {
      const badge = document.createElement("span");
      badge.className = "iaEditBadge";
      tile.appendChild(badge);
    }
    tile.querySelector(".iaEditBadge").textContent = isLinked ? "✕" : "+";

    tile.addEventListener("mouseenter", (e) => showIaTooltip(e, entry, kindFilter));
    tile.addEventListener("mousemove", positionIaTooltip);
    tile.addEventListener("mouseleave", hideIaTooltip);
    tile.onclick = () => toggleIaEditPartner(entry, kindFilter, ref, id, isLinked);
  });
}

// Fuegt sofort hinzu bzw. entfernt sofort - kein separater "Speichern"-
// Schritt mehr noetig, jeder Klick wirkt direkt (optimistisches Update,
// bei Fehler wird zurueckgerollt).
async function toggleIaEditPartner(entry, kind, ref, id, wasLinked) {
  const anchorRef = iaEntityRef(iaEditingAnchor.entry, iaEditingAnchor.kind);
  const statusEl = document.getElementById("iaEditStatus");

  if (wasLinked) iaEditingPartnerIds.delete(id);
  else iaEditingPartnerIds.add(id);
  renderIaEditTargetGrid();

  try {
    const res = await authFetch(serverUrl(`/synergy/${wasLinked ? "remove" : "add"}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: anchorRef, b: ref })
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    statusEl.textContent = wasLinked ? t("iaEditRemoved") : t("iaEditAdded");
    statusEl.style.color = "#4ade80";
  } catch (err) {
    console.error("[ItemsAugments-Editor] Speichern fehlgeschlagen:", err);
    // Zurueckrollen, da der Server-Aufruf fehlgeschlagen ist.
    if (wasLinked) iaEditingPartnerIds.add(id);
    else iaEditingPartnerIds.delete(id);
    renderIaEditTargetGrid();
    statusEl.textContent = t("iaEditSaveError");
    statusEl.style.color = "#f87171";
  }
}

// Entfernt ALLE aktuellen Verbindungen des Ankers (einzeln ueber die
// API, damit auch serverseitig wirklich jede Kante geloescht wird).
async function clearIaEditSelection() {
  if (!iaEditingAnchor) return;
  const anchorRef = iaEntityRef(iaEditingAnchor.entry, iaEditingAnchor.kind);
  const statusEl = document.getElementById("iaEditStatus");
  const allByApiName = {};
  for (const a of arenaAugmentsData || []) allByApiName[iaEntityId(iaEntityRef(a, "augment"))] = iaEntityRef(a, "augment");
  for (const i of arenaItemsData || []) allByApiName[iaEntityId(iaEntityRef(i, "item"))] = iaEntityRef(i, "item");

  const idsToRemove = [...iaEditingPartnerIds];
  for (const id of idsToRemove) {
    const ref = allByApiName[id];
    if (!ref) continue;
    try {
      await authFetch(serverUrl("/synergy/remove"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a: anchorRef, b: ref })
      });
    } catch (err) {
      console.error("[ItemsAugments-Editor] Entfernen fehlgeschlagen:", err);
    }
  }
  iaEditingPartnerIds = new Set();
  renderIaEditTargetGrid();
  statusEl.textContent = t("iaEditAllRemoved");
  statusEl.style.color = "#4ade80";
}

function cancelIaEdit() {
  iaEditingAnchor = null;
  iaEditingPartnerIds = new Set();
  document.getElementById("itemsAugmentsBody").classList.remove("hidden");
  document.getElementById("iaSearchInput").classList.remove("hidden");
  document.getElementById("iaEditView").classList.add("hidden");
}

// ============================================================
// Presets ("Tank", "Full Autocast", "Onhit Atkspeed", ...) - eine
// benannte, champion-unabhaengige Sammlung von Augments/Items.
// Mehrfachauswahl statt Einzel-Anker wie beim Synergie-Editor: jede
// Kachel laesst sich an-/abklicken, "Speichern" legt das Preset mit
// allen aktuell markierten Eintraegen an.
// ============================================================
async function loadPresets(force) {
  if (iaPresetsCache && !force) return iaPresetsCache;
  try {
    const res = await authFetch(serverUrl("/presets"));
    iaPresetsCache = res.ok ? await res.json() : [];
  } catch (err) {
    console.error("[Presets] Laden fehlgeschlagen:", err);
    iaPresetsCache = [];
  }
  return iaPresetsCache;
}

function toggleIaPresetMode() {
  if (!iaPresetMode && !getIaEditToken()) { requireIaCode(toggleIaPresetMode); return; }
  iaPresetMode = !iaPresetMode;
  const btn = document.getElementById("iaPresetModeBtn");
  if (btn) btn.classList.toggle("active", iaPresetMode);
  if (iaPresetMode) {
    if (iaEditMode) { iaEditMode = false; document.getElementById("iaEditModeBtn")?.classList.remove("active"); cancelIaEdit(); }
    if (iaTierListMode) { iaTierListMode = false; setIaTierListToggleUnchecked(); backToTierListOverview(); }
    backToItemsAugmentsBrowse();
    cancelIaEdit();
    startCreatingPreset();
  } else {
    cancelIaPreset();
  }
}

async function startCreatingPreset() {
  iaPresetSelectedEntries = new Map();
  iaEditingPresetId = null;
  editingBuildId = null;
  editingBuildNotes = "";
  editingBuildChampKey = null;
  editingSkillOrder = [];
  iaPresetSearchTerm = "";
  const nameInput = document.getElementById("iaPresetNameInput");
  if (nameInput) nameInput.value = "";
  const searchInput = document.getElementById("iaPresetSearchInput");
  if (searchInput) searchInput.value = "";
  document.getElementById("iaPresetStatus").textContent = "";
  document.getElementById("iaPresetExisting")?.classList.remove("hidden");
  document.getElementById("buildSkillPathSection")?.classList.add("hidden");
  document.getElementById("buildSelectedNotesSection")?.classList.add("hidden");
  document.getElementById("itemsAugmentsBody").classList.add("hidden");
  document.getElementById("iaSearchInput").classList.add("hidden");
  document.getElementById("iaPresetView").classList.remove("hidden");
  updateIaPresetSaveLabel();

  await renderIaPresetExistingList();
  renderIaPresetGrid();
}

function updateIaPresetSaveLabel() {
  const btn = document.getElementById("iaPresetSave");
  if (!btn) return;
  btn.textContent = (iaEditingPresetId || editingBuildId) ? t("iaPresetUpdate") : t("iaPresetSave");
}

async function startEditingPreset(preset) {
  iaEditingPresetId = preset._id;
  iaPresetSelectedEntries = new Map();
  (preset.entries || []).forEach((entry) => {
    const id = iaEntityId(entry);
    iaPresetSelectedEntries.set(id, entry);
  });
  const nameInput = document.getElementById("iaPresetNameInput");
  if (nameInput) nameInput.value = preset.name || "";
  document.getElementById("iaPresetStatus").textContent = "";
  updateIaPresetSaveLabel();
  renderIaPresetGrid();
}

function cancelIaPreset() {
  iaPresetSelectedEntries = new Map();
  iaEditingPresetId = null;
  editingBuildId = null;
  editingBuildNotes = "";
  editingBuildChampKey = null;
  editingSkillOrder = [];
  document.getElementById("iaPresetExisting")?.classList.remove("hidden");
  document.getElementById("buildSkillPathSection")?.classList.add("hidden");
  document.getElementById("buildSelectedNotesSection")?.classList.add("hidden");
  document.getElementById("itemsAugmentsBody").classList.remove("hidden");
  document.getElementById("iaSearchInput").classList.remove("hidden");
  document.getElementById("iaPresetView").classList.add("hidden");
}

async function renderIaPresetExistingList() {
  const ul = document.getElementById("iaPresetExistingList");
  if (!ul) return;
  const presets = await loadPresets();
  if (!presets.length) {
    ul.innerHTML = `<li class="iaPresetEmpty">${t("iaPresetNoneYet")}</li>`;
    return;
  }
  ul.innerHTML = presets.map((p) => `
    <li data-preset-id="${p._id}">
      <span class="iaPresetListName iaPresetListNameClickable" data-preset-id="${p._id}" title="${t("iaPresetEdit")}">${p.name}${p.createdBy ? ` <span class="iaPresetListCreator">${t("iaPresetByLabel")} ${p.createdBy}</span>` : ""}</span>
      <span class="iaPresetListCount">${(p.entries || []).length}</span>
      <button class="iaPresetConvertBtn" data-preset-id="${p._id}" title="${t("iaPresetConvertTitle")}">${t("iaPresetConvertBtn")}</button>
      <button class="iaPresetDeleteBtn" data-preset-id="${p._id}" title="${t("iaPresetDelete")}">✕</button>
    </li>
  `).join("");
  ul.querySelectorAll(".iaPresetConvertBtn").forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.presetId;
      const preset = presets.find((p) => p._id === id);
      if (preset) openBuildConvertPicker(preset);
    };
  });
  ul.querySelectorAll(".iaPresetListNameClickable").forEach((el) => {
    el.onclick = () => {
      const id = el.dataset.presetId;
      const preset = presets.find((p) => p._id === id);
      if (preset) startEditingPreset(preset);
    };
  });
  ul.querySelectorAll(".iaPresetDeleteBtn").forEach((btn) => {
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.presetId;
      try {
        const res = await authFetch(serverUrl(`/presets/${id}`), { method: "DELETE" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        if (iaEditingPresetId === id) {
          iaEditingPresetId = null;
          iaPresetSelectedEntries = new Map();
          document.getElementById("iaPresetNameInput").value = "";
          updateIaPresetSaveLabel();
          renderIaPresetGrid();
        }
        await loadPresets(true);
        renderIaPresetExistingList();
      } catch (err) {
        console.error("[Presets] Löschen fehlgeschlagen:", err);
      }
    };
  });
}

function renderIaPresetGrid() {
  const grid = document.getElementById("iaPresetItemsGrid");
  if (!grid) return;
  const term = normName(iaPresetSearchTerm);
  const filterByTerm = (e) => {
    const name = iaEntryName(e);
    const desc = iaEntryDesc(e);
    const matchesTerm = !term || normName(name).includes(term) || normName(desc).includes(term);
    const matchesCategory = !iaCategoryFilter || iaEntryCategories(e, name, desc).includes(iaCategoryFilter);
    return matchesTerm && matchesCategory;
  };
  const augments = (arenaAugmentsData || []).filter(filterByTerm);
  const items = (arenaItemsData || []).filter(filterByTerm);

  let html = `<h4>${t("iaAugmentsHeading")}</h4>` +
    IA_AUGMENT_TIERS.map((tier) => renderIaTierGroup(augments, tier, "augment")).join("");
  html += `<h4>${t("iaItemsHeading")}</h4>` +
    IA_ITEM_TIERS.map((tier) => renderIaTierGroup(items, tier, "item")).join("");
  grid.innerHTML = html;

  markIaPresetTiles(grid, augments, "augment");
  markIaPresetTiles(grid, items, "item");
  renderBuildSelectedNotesList();
}

function markIaPresetTiles(container, entries, kindFilter) {
  container.querySelectorAll(".iaTile").forEach((tile) => {
    if (tile.dataset.kind !== kindFilter) return;
    const idx = parseInt(tile.dataset.idx, 10);
    const entry = entries[idx];
    if (!entry) return;
    const ref = iaEntityRef(entry, kindFilter);
    const id = iaEntityId(ref);
    const isSelected = iaPresetSelectedEntries.has(id);

    tile.classList.toggle("selected", isSelected);
    tile.addEventListener("mouseenter", (e) => showIaTooltip(e, entry, kindFilter));
    tile.addEventListener("mousemove", positionIaTooltip);
    tile.addEventListener("mouseleave", hideIaTooltip);
    tile.onclick = () => {
      if (iaPresetSelectedEntries.has(id)) iaPresetSelectedEntries.delete(id);
      else iaPresetSelectedEntries.set(id, ref);
      renderIaPresetGrid();
    };
  });
}

async function saveIaPreset() {
  const nameInput = document.getElementById("iaPresetNameInput");
  const statusEl = document.getElementById("iaPresetStatus");
  const name = (nameInput?.value || "").trim();
  if (!name) {
    statusEl.textContent = t("iaPresetNameRequired");
    statusEl.style.color = "#f87171";
    return;
  }
  if (iaPresetSelectedEntries.size === 0) {
    statusEl.textContent = t("iaPresetEntriesRequired");
    statusEl.style.color = "#f87171";
    return;
  }

  // Build-Edit-Modus: speichert ueber PUT /builds/:id statt der
  // Preset-Routen (siehe openBuildEditor).
  if (editingBuildId) {
    if (!state.riotId) {
      statusEl.textContent = t("buildConvertNeedRiotId");
      statusEl.style.color = "#f87171";
      return;
    }
    try {
      const entries = [...iaPresetSelectedEntries.values()];
      const augments = entries.filter((e) => e.type === "augment");
      const items = entries.filter((e) => e.type === "item");
      const res = await authFetch(serverUrl(`/builds/${editingBuildId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riotId: state.riotId, name, augments, items, notes: editingBuildNotes, skillOrder: editingSkillOrder })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      statusEl.textContent = t("iaPresetUpdated");
      statusEl.style.color = "#4ade80";
      const champKey = editingBuildChampKey;
      cancelIaPreset();
      closeItemsAugmentsModal();
      if (currentDetailChamp && String(currentDetailChamp.key) === String(champKey)) {
        loadChampBuildsSidebar(currentDetailChamp);
      }
    } catch (err) {
      console.error("[ChampBuild] Speichern fehlgeschlagen:", err);
      statusEl.textContent = t("iaEditSaveError");
      statusEl.style.color = "#f87171";
    }
    return;
  }

  try {
    const entries = [...iaPresetSelectedEntries.values()];
    const isEdit = !!iaEditingPresetId;
    const res = await authFetch(
      serverUrl(isEdit ? `/presets/${iaEditingPresetId}` : "/presets"),
      {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, entries })
      }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    statusEl.textContent = isEdit ? t("iaPresetUpdated") : t("iaPresetSaved");
    statusEl.style.color = "#4ade80";
    await loadPresets(true);
    await renderIaPresetExistingList();
    iaPresetSelectedEntries = new Map();
    iaEditingPresetId = null;
    nameInput.value = "";
    updateIaPresetSaveLabel();
    renderIaPresetGrid();
  } catch (err) {
    console.error("[Presets] Speichern fehlgeschlagen:", err);
    statusEl.textContent = t("iaEditSaveError");
    statusEl.style.color = "#f87171";
  }
}

// ============================================================
// Schnellsuche -> Champion-Build umwandeln
// Nutzt die BEREITS bestehende champBuilds-Collection/Route (GET/POST
// /builds), NICHT die presets-Collection - echte Verschiebung statt
// Kopie: nach erfolgreichem Anlegen des Builds wird die Original-
// Schnellsuche geloescht. Einziger inhaltlicher Unterschied zur
// Schnellsuche: championKey ist gesetzt, dadurch nur auf der Seite
// dieses einen Champions sichtbar (siehe loadChampBuildsSidebar).
// ============================================================
let pendingConvertPreset = null;

function openBuildConvertPicker(preset) {
  pendingConvertPreset = preset;
  const overlay = document.getElementById("buildConvertPickerOverlay");
  const searchInput = document.getElementById("buildConvertPickerSearch");
  if (searchInput) searchInput.value = "";
  overlay.classList.remove("hidden");
  renderBuildConvertPickerGrid("");
}

function closeBuildConvertPicker() {
  pendingConvertPreset = null;
  document.getElementById("buildConvertPickerOverlay").classList.add("hidden");
}

function renderBuildConvertPickerGrid(filterText) {
  const grid = document.getElementById("buildConvertPickerGrid");
  if (!grid) return;
  const term = (filterText || "").toLowerCase();
  const visible = championList.filter((c) => c.name.toLowerCase().includes(term));
  grid.innerHTML = visible.map((c) => `
    <div class="buildConvertPickerChamp" data-champ-key="${c.key}">
      <img src="${c.icon}" alt="${c.name}" loading="lazy" />
      <span>${c.name}</span>
    </div>
  `).join("");
  grid.querySelectorAll(".buildConvertPickerChamp").forEach((el) => {
    el.onclick = () => {
      const champ = championByKey[el.dataset.champKey];
      if (champ) confirmConvertPresetToBuild(champ);
    };
  });
}

async function confirmConvertPresetToBuild(champ) {
  const preset = pendingConvertPreset;
  if (!preset) return;
  if (!state.riotId) {
    showToast(t("buildConvertNeedRiotId"), "warning");
    return;
  }
  if (!confirm(t("buildConvertConfirm", { name: preset.name, champ: champ.name }))) return;

  try {
    const entries = preset.entries || [];
    const augments = entries.filter((e) => e.type === "augment");
    const items = entries.filter((e) => e.type === "item");
    const res = await authFetch(serverUrl("/builds"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        riotId: state.riotId,
        championKey: champ.key,
        name: preset.name,
        augments,
        items,
        notes: ""
      })
    });
    if (!res.ok) throw new Error("HTTP " + res.status);

    // Original-Schnellsuche bleibt bestehen - der Build ist eine Kopie,
    // keine Verschiebung mehr (auf Wunsch geaendert).
    closeBuildConvertPicker();
    await loadPresets(true);
    await renderIaPresetExistingList();
    showToast(t("buildConvertSuccess", { champ: champ.name }), "success");
  } catch (err) {
    console.error("[Presets->Build] Umwandlung fehlgeschlagen:", err);
    showToast(t("buildConvertFailed"), "error");
  }
}

safeBind("buildConvertPickerClose", "onclick", closeBuildConvertPicker);
safeBind("buildConvertPickerSearch", "oninput", (e) => renderBuildConvertPickerGrid(e.target.value));

// ---------- Champion-Seite: Champion-Builds in der rechten Sidebar (per championKey) ----------
let champBuildsForSidebar = [];

async function loadChampBuildsSidebar(champ) {
  const section = document.getElementById("champBuildSidebar");
  if (!section) return;
  try {
    await loadArenaItemsAugments();
    const res = await authFetch(serverUrl(`/builds/${encodeURIComponent(champ.key)}`));
    champBuildsForSidebar = res.ok ? await res.json() : [];
    renderChampBuildSidebar(champ, champBuildsForSidebar);
  } catch (err) {
    console.error("[ChampBuilds] Laden fehlgeschlagen:", err);
    champBuildsForSidebar = [];
    renderChampBuildSidebar(champ, []);
  }
}

function renderChampBuildSidebar(champ, builds) {
  const section = document.getElementById("champBuildSidebar");
  if (!section) return;
  if (!builds.length) {
    section.innerHTML = `<h3>${t("champBuildSidebarHeading")}</h3><p class="detailEmpty">${t("champBuildNone")}</p>`;
    return;
  }
  section.innerHTML = `<h3>${t("champBuildSidebarHeading")}</h3>` +
    builds.map((b, i) => `
      <div class="champBuildSidebarPill" data-build-idx="${i}">
        <img src="${champ.icon}" alt="${champ.name}" />
        <span class="champBuildSidebarPillName">${b.name}${b.riotId ? `<span class="champBuildSidebarPillCreator">${t("iaPresetByLabel")} ${b.riotId}</span>` : ""}</span>
      </div>
    `).join("");
  section.querySelectorAll(".champBuildSidebarPill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const idx = parseInt(pill.dataset.buildIdx, 10);
      const build = builds[idx];
      if (build) openBuildFullView(build);
      section.querySelectorAll(".champBuildSidebarPill").forEach((p) => p.classList.toggle("active", p === pill));
    });
  });
}

// Ersetzt den kompletten Hauptbereich (Schnellsuche-Pills + Augments/
// Items) durch die Vollansicht des angeklickten Champion-Builds.
// "← Zurueck" baut die normale Champion-Ansicht wieder komplett auf
// (gleiches Muster wie die anderen Rueckwege in der App).
function openBuildFullView(build) {
  const section = document.getElementById("champPresetsSection");
  if (!section) return;
  const augments = build.augments || [];
  const items = build.items || [];

  let html = `<button class="champBuildFullBackBtn" id="champBuildFullBackBtn">${t("champBuildBackBtn")}</button>`;
  html += `<div class="champBuildBlockHeader">
    <h3 class="champPresetActiveName">${build.name}${build.riotId ? ` <span class="champPresetBlockCreator">${t("iaPresetByLabel")} ${build.riotId}</span>` : ""}</h3>
    <button class="champBuildEditBtn" id="champBuildFullEditBtn" title="${t("champBuildEditTitle")}">✏️</button>
  </div>`;
  if (augments.length) {
    html += `<div class="champPresetKindLabel">${t("iaAugmentsHeading")}</div>` +
      IA_AUGMENT_TIERS.map((tier) => renderIaTierGroup(augments, tier, "augment")).join("");
  }
  if (items.length) {
    html += `<div class="champPresetKindLabel">${t("iaItemsHeading")}</div>` +
      IA_ITEM_TIERS.map((tier) => renderIaTierGroup(items, tier, "item")).join("");
  }
  if (build.skillOrder && build.skillOrder.length) {
    html += `<div class="champPresetKindLabel">${t("buildSkillPathHeading")}</div>`;
    html += renderSkillPathReadOnly(build.skillOrder);
  }
  if (build.notes) html += `<p class="detailEmpty" style="margin-top:8px;">${build.notes}</p>`;

  section.innerHTML = html;
  document.getElementById("champBuildFullBackBtn").addEventListener("click", () => openChampDetail(currentDetailChamp));
  document.getElementById("champBuildFullEditBtn").addEventListener("click", () => {
    requireIaCode(() => openBuildEditor(build, build.championKey));
  });

  const bindTiles = (entries, kind) => {
    section.querySelectorAll(`.iaTile[data-kind="${kind}"]`).forEach((tile) => {
      const idx = parseInt(tile.dataset.idx, 10);
      const entry = entries[idx];
      if (!entry) return;
      tile.addEventListener("mouseenter", (e) => showIaTooltip(e, entry, kind));
      tile.addEventListener("mousemove", positionIaTooltip);
      tile.addEventListener("mouseleave", hideIaTooltip);
      tile.style.cursor = "pointer";
      tile.addEventListener("click", () => {
        hideIaTooltip();
        openItemOrAugmentDetail(iaEntryName(entry), kind);
      });
      if (entry.note) {
        tile.title = entry.note;
      }
    });
  };
  if (augments.length) bindTiles(augments, "augment");
  if (items.length) bindTiles(items, "item");
}

const SKILL_PATH_ROWS = ["Q", "W", "E", "R"];
const SKILL_PATH_ROUNDS = 18;

// Lesend: zeigt eine gespeicherte skillOrder (Array aus {round,key})
// als kompaktes Grid, ohne Klick-Funktion (nur in der Build-Vollansicht).
function renderSkillPathReadOnly(skillOrder) {
  const counters = {};
  let html = `<div id="buildSkillPathGrid" class="buildSkillPathReadOnly">`;
  SKILL_PATH_ROWS.forEach((key) => {
    counters[key] = 0;
    html += `<div class="buildSkillRow"><span class="buildSkillRowLabel">${key}</span>`;
    for (let round = 1; round <= SKILL_PATH_ROUNDS; round++) {
      const entry = skillOrder.find((s) => s.round === round && s.key === key);
      if (entry) counters[key]++;
      html += `<span class="buildSkillCell${entry ? " filled" : ""}">${entry ? counters[key] : ""}</span>`;
    }
    html += `</div>`;
  });
  html += `</div>`;
  return html;
}

// Oeffnet den bestehenden Schnellsuche-Editor im "Build-Edit-Modus":
// gleiche Grid-/Auswahl-Mechanik, aber speichert am Ende ueber
// PUT /builds/:id statt der Preset-Routen (siehe saveIaPreset).
async function openBuildEditor(build, champKey) {
  document.getElementById("itemsAugmentsOverlay").classList.remove("hidden");
  await loadArenaItemsAugments();

  if (iaEditMode) { iaEditMode = false; document.getElementById("iaEditModeBtn")?.classList.remove("active"); cancelIaEdit(); }
  if (iaTierListMode) { iaTierListMode = false; setIaTierListToggleUnchecked(); backToTierListOverview(); }
  iaPresetMode = true;
  document.getElementById("iaPresetModeBtn")?.classList.add("active");
  backToItemsAugmentsBrowse();

  editingBuildId = build._id;
  editingBuildNotes = build.notes || "";
  editingBuildChampKey = champKey;
  editingSkillOrder = Array.isArray(build.skillOrder) ? [...build.skillOrder] : [];
  iaEditingPresetId = null;
  iaPresetSelectedEntries = new Map();
  [...(build.augments || []), ...(build.items || [])].forEach((entry) => {
    iaPresetSelectedEntries.set(iaEntityId(entry), entry);
  });

  const nameInput = document.getElementById("iaPresetNameInput");
  if (nameInput) nameInput.value = build.name || "";
  const searchInput = document.getElementById("iaPresetSearchInput");
  if (searchInput) searchInput.value = "";
  iaPresetSearchTerm = "";
  document.getElementById("iaPresetStatus").textContent = "";
  document.getElementById("iaPresetExisting")?.classList.add("hidden"); // im Build-Edit irrelevant
  document.getElementById("itemsAugmentsBody").classList.add("hidden");
  document.getElementById("iaSearchInput").classList.add("hidden");
  document.getElementById("iaPresetView").classList.remove("hidden");
  document.getElementById("buildSkillPathSection")?.classList.remove("hidden");
  document.getElementById("buildSelectedNotesSection")?.classList.remove("hidden");
  updateIaPresetSaveLabel();
  renderIaPresetGrid();
  renderSkillPathGrid();
}

// ---- Skill Path: klickbares Grid (Q/W/E/R x Runden), nur im Build-Editor ----
function renderSkillPathGrid() {
  const grid = document.getElementById("buildSkillPathGrid");
  if (!grid) return;
  const counters = {};
  let html = "";
  SKILL_PATH_ROWS.forEach((key) => {
    counters[key] = 0;
    html += `<div class="buildSkillRow"><span class="buildSkillRowLabel">${key}</span>`;
    for (let round = 1; round <= SKILL_PATH_ROUNDS; round++) {
      const entry = editingSkillOrder.find((s) => s.round === round && s.key === key);
      if (entry) counters[key]++;
      html += `<span class="buildSkillCell${entry ? " filled" : ""}" data-round="${round}" data-key="${key}">${entry ? counters[key] : ""}</span>`;
    }
    html += `</div>`;
  });
  grid.innerHTML = html;
  grid.querySelectorAll(".buildSkillCell").forEach((cell) => {
    cell.onclick = () => {
      const round = parseInt(cell.dataset.round, 10);
      const key = cell.dataset.key;
      const existingIdx = editingSkillOrder.findIndex((s) => s.round === round);
      if (existingIdx !== -1 && editingSkillOrder[existingIdx].key === key) {
        // Gleiche Zelle nochmal geklickt -> entfernen (Toggle aus).
        editingSkillOrder.splice(existingIdx, 1);
      } else if (existingIdx !== -1) {
        // Andere Faehigkeit in dieser Runde -> ersetzen (nur 1 Pick/Runde).
        editingSkillOrder[existingIdx] = { round, key };
      } else {
        editingSkillOrder.push({ round, key });
      }
      renderSkillPathGrid();
    };
  });
}
safeBind("buildSkillPathReset", "onclick", () => { editingSkillOrder = []; renderSkillPathGrid(); });

// ---- Notizen: pro ausgewaehltem Augment/Item optional ein Freitext ----
function renderBuildSelectedNotesList() {
  const list = document.getElementById("buildSelectedNotesList");
  if (!list) return;
  const entries = [...iaPresetSelectedEntries.values()];
  if (!entries.length) {
    list.innerHTML = `<p class="detailEmpty">–</p>`;
    return;
  }
  list.innerHTML = entries.map((entry, i) => `
    <div class="buildNoteRow">
      ${entry.icon ? `<img src="${entry.icon}" alt="" />` : ""}
      <span class="buildNoteRowName">${iaEntryName(entry)}</span>
      <input class="buildNoteRowInput" data-note-idx="${i}" type="text" value="${(entry.note || "").replace(/"/g, "&quot;")}" placeholder="Notiz (optional)..." />
    </div>
  `).join("");
  list.querySelectorAll(".buildNoteRowInput").forEach((input, i) => {
    input.oninput = () => { entries[i].note = input.value; };
  });
}


function renderIaSelectedCard(entry, containerId) {
  const card = document.getElementById(containerId || "iaSelectedCard");
  if (!card) return;
  const name = iaEntryName(entry);
  const desc = iaEntryDesc(entry);
  const priceHtml = typeof entry.priceTotal === "number"
    ? `<div class="iaSelectedPrice">💰 ${entry.priceTotal}${typeof entry.price === "number" && entry.price !== entry.priceTotal ? ` (Komponente: ${entry.price})` : ""}</div>`
    : "";
  card.innerHTML = `
    ${entry.icon ? `<img src="${entry.icon}" alt="${name}" />` : ""}
    <div class="iaSelectedInfo">
      <div class="iaSelectedName">${name}</div>
      ${priceHtml}
      <div class="iaSelectedDesc">${desc || ""}</div>
    </div>
  `;
}

function renderIaSynergyResults(partners, loading) {
  const container = document.getElementById("iaSynergyResults");
  if (!container) return;
  if (loading) {
    container.innerHTML = `<p class="detailEmpty">…</p>`;
    return;
  }
  if (!partners || partners.length === 0) {
    container.innerHTML = `<p class="detailEmpty">${t("iaNoSynergyYet")}</p>`;
    return;
  }
  const augPartners = partners.filter((p) => p.type === "augment");
  const itemPartners = partners.filter((p) => p.type === "item");
  let html = "";
  if (augPartners.length) {
    html += `<h4>${t("iaAugmentsHeading")}</h4>` +
      IA_AUGMENT_TIERS.map((tier) => renderIaTierGroup(augPartners, tier, "augment")).join("");
  }
  if (itemPartners.length) {
    html += `<h4>${t("iaItemsHeading")}</h4>` +
      IA_ITEM_TIERS.map((tier) => renderIaTierGroup(itemPartners, tier, "item")).join("");
  }
  container.innerHTML = html;
  if (augPartners.length) bindIaTileEvents(container, augPartners, "augment");
  if (itemPartners.length) bindIaTileEvents(container, itemPartners, "item");
}

// ============================================================
// Item/Augment-Tier-Liste (echte Spielerdaten statt handkuratierter
// Synergien) - "Variante A": S/A/B/C/D nach Solo-Winrate ueber ALLE
// Spieler. "Variante B": Klick auf eine Kachel zeigt die 5 besten
// Partner-Kombinationen nach echter gemeinsamer Winrate (kommt fertig
// vorberechnet vom Server, kein zusaetzlicher Request noetig).
// ============================================================

// KEINE festen Winrate-Schwellen (z.B. "S ab 54%") - "Sieg" bedeutet in
// Arena Platz 1 von 8 Teams, der Basiswert liegt also bei ~12.5%, nicht
// bei 50% wie bei einem klassischen 1v1. Feste Prozent-Grenzen wuerden
// dadurch fast alles in die unterste Stufe stecken. Stattdessen: relative
// Rang-Einteilung nach Perzentil innerhalb der tatsaechlich geladenen
// Daten - passt sich automatisch an, egal wie die echte Verteilung
// aussieht.
const IA_TIER_PERCENTILES = [
  { key: "S", upTo: 0.10 },
  { key: "A", upTo: 0.30 },
  { key: "B", upTo: 0.70 },
  { key: "C", upTo: 0.90 },
  { key: "D", upTo: 1.00 }
];

async function loadItemAugmentTierlist() {
  if (iaTierListData) return true;
  try {
    const res = await authFetch(serverUrl("/item-augment-tierlist"));
    if (!res.ok) throw new Error("HTTP " + res.status);
    iaTierListData = await res.json();

    // Einmalig global (ueber ALLE Items+Augments zusammen) den Perzentil-
    // Rang je Zeile berechnen und ablegen - wird fuer die gruene/rote
    // Faerbung der Winrate-Badges in der normalen Browse-Ansicht
    // gebraucht (S/A/B = ueberdurchschnittlich, C/D = unterdurchschnittlich).
    const sorted = iaTierListData.slice().sort((a, b) => b.winrate - a.winrate || b.games - a.games);
    const n = sorted.length;
    sorted.forEach((row, i) => {
      const percentile = (i + 1) / n;
      const tierInfo = IA_TIER_PERCENTILES.find((t) => percentile <= t.upTo) || IA_TIER_PERCENTILES[IA_TIER_PERCENTILES.length - 1];
      row.percentileTier = tierInfo.key;
    });

    iaTierListByKey = new Map(iaTierListData.map((row) => [`${row.kind}:${row.id}`, row]));
    return true;
  } catch (err) {
    console.error("[ItemAugmentTierlist] Laden fehlgeschlagen:", err);
    return false;
  }
}

// Loest eine Tierlist-Zeile (nur kind+id) zum vollen Augment-/Item-
// Objekt auf (Name/Icon/Beschreibung kommen aus den schon geladenen
// arenaAugments/arenaItems-Daten, nicht nochmal von hier). Wird fuer
// die Top-5-Partner-Ansicht gebraucht, deren Eintraege selbst nur
// {kind,id,...} sind.
function iaTierlistEntryLookup(row) {
  if (!row) return null;
  const map = row.kind === "augment" ? iaAugmentById : iaItemById;
  return map[row.id] || null;
}

// Partner-Tierliste (Variante B): zeigt ALLE Partner-Kombinationen einer
// angeklickten Kachel (nicht mehr nur die Top 5) als eigene S/A/B/C/D-
// Tierliste - mit denselben Rarity-Spalten (Augments/Items), demselben
// All/Augments/Items-Filter und derselben Group-Checkbox wie die normale
// Browse-Ansicht (renderItemsAugmentsModal). Die S/A/B/C/D-Einteilung
// wird dabei NEU und NUR ueber diese Partner-Menge berechnet (eigene
// Map iaPartnerRowByKey, nicht die globale iaTierListByKey) - "S"
// bedeutet hier "bester Partner FUER DIESES Item/Augment", nicht
// "bestes Item/Augment insgesamt".
let iaPartnerRowByKey = null; // Map "kind:id" -> {games, winrate, percentileTier}
let iaPartnerAugmentEntries = [];
let iaPartnerItemEntries = [];
let iaPartnerGroupMode = true;
let iaPartnerColumnFilter = null; // null = beide Spalten
let iaCurrentPartnerTopPartners = null; // Rohdaten der aktuell offenen Kachel (fuer Re-Render bei Group-Toggle)

function iaPartnerTierlistRowForEntry(entry, kind) {
  if (!iaPartnerRowByKey || !entry) return null;
  const numId = entry.id ?? entry.augmentId ?? entry.itemId;
  if (numId === undefined || numId === null) return null;
  return iaPartnerRowByKey.get(`${kind}:${numId}`) || null;
}

function renderIaPartnerTierlist(topPartners) {
  iaCurrentPartnerTopPartners = topPartners;
  const augList = document.getElementById("iaPartnerAugmentsList");
  const itemList = document.getElementById("iaPartnerItemsList");
  if (!augList || !itemList) return;

  const resolved = (topPartners || [])
    .map((p) => ({ p, entry: iaTierlistEntryLookup(p) }))
    .filter((x) => x.entry);

  if (!resolved.length) {
    augList.innerHTML = `<p class="detailEmpty">${t("iaTierListNoPartners")}</p>`;
    itemList.innerHTML = "";
    iaPartnerRowByKey = null;
    iaPartnerAugmentEntries = [];
    iaPartnerItemEntries = [];
    return;
  }

  // Lokale Perzentil-Einteilung NUR ueber diese Partner-Menge (gleiches
  // Prinzip wie loadItemAugmentTierlist, aber auf diesen Ausschnitt
  // gescoped statt global ueber alle Items/Augments).
  const sorted = resolved.slice().sort((a, b) => b.p.winrate - a.p.winrate || b.p.games - a.p.games);
  const n = sorted.length;
  iaPartnerRowByKey = new Map();
  sorted.forEach(({ p }, i) => {
    const percentile = (i + 1) / n;
    const tierInfo = IA_TIER_PERCENTILES.find((tp) => percentile <= tp.upTo) || IA_TIER_PERCENTILES[IA_TIER_PERCENTILES.length - 1];
    iaPartnerRowByKey.set(`${p.kind}:${p.id}`, { games: p.games, winrate: p.winrate, percentileTier: tierInfo.key });
  });

  iaPartnerAugmentEntries = resolved.filter((x) => x.p.kind === "augment").map((x) => x.entry);
  iaPartnerItemEntries = resolved.filter((x) => x.p.kind === "item").map((x) => x.entry);

  augList.innerHTML = !iaPartnerAugmentEntries.length
    ? `<p class="detailEmpty">–</p>`
    : iaPartnerGroupMode
      ? IA_AUGMENT_TIERS.map((tier) => renderIaTierGroup(iaPartnerAugmentEntries, tier, "augment", true, iaPartnerTierlistRowForEntry)).join("")
      : renderIaFlatList(iaPartnerAugmentEntries, "augment", true, iaPartnerTierlistRowForEntry);
  itemList.innerHTML = !iaPartnerItemEntries.length
    ? `<p class="detailEmpty">–</p>`
    : iaPartnerGroupMode
      ? IA_ITEM_TIERS.map((tier) => renderIaTierGroup(iaPartnerItemEntries, tier, "item", true, iaPartnerTierlistRowForEntry)).join("")
      : renderIaFlatList(iaPartnerItemEntries, "item", true, iaPartnerTierlistRowForEntry);

  bindIaTileEvents(augList, iaPartnerAugmentEntries);
  bindIaTileEvents(itemList, iaPartnerItemEntries);
  applyIaPartnerColumnFilter();
}

// "All"/"Augments"/"Items"-Filter fuer die Partner-Tierliste - exakt
// dasselbe Prinzip wie selectIaColumnFilter/applyIaColumnFilter fuer die
// normale Browse-Ansicht, nur auf die Partner-Spalten bezogen.
function selectIaPartnerColumnFilter(kind) {
  iaPartnerColumnFilter = kind === "all" ? null : kind;
  applyIaPartnerColumnFilter();
}

function applyIaPartnerColumnFilter() {
  const allBtn = document.getElementById("iaPartnerShowAllBtn");
  const augBtn = document.getElementById("iaPartnerShowAugmentsBtn");
  const itemBtn = document.getElementById("iaPartnerShowItemsBtn");
  const augCol = document.getElementById("iaPartnerAugmentsCol");
  const itemCol = document.getElementById("iaPartnerItemsCol");
  allBtn?.classList.toggle("active", iaPartnerColumnFilter === null);
  augBtn?.classList.toggle("active", iaPartnerColumnFilter === "augment");
  itemBtn?.classList.toggle("active", iaPartnerColumnFilter === "item");
  augCol?.classList.toggle("iaColHidden", iaPartnerColumnFilter === "item");
  itemCol?.classList.toggle("iaColHidden", iaPartnerColumnFilter === "augment");
}

// "Gruppieren"-Checkbox fuer die Partner-Tierliste - exakt dasselbe
// Prinzip wie toggleIaBrowseGroupMode, nur fuer diese Ansicht.
function toggleIaPartnerGroupMode() {
  const cb = document.getElementById("iaPartnerGroupToggle");
  iaPartnerGroupMode = cb ? cb.checked : true;
  renderIaPartnerTierlist(iaCurrentPartnerTopPartners);
}

// Zeigt zu einer angeklickten Kachel (im Tier-Liste-Modus) die volle
// Partner-Tierliste an - blendet dafuer die normale Browse-Ansicht kurz
// aus, genau wie die alte handkuratierte Synergie-Detailansicht. Klick
// auf eine Partner-Kachel ruft ueber bindIaTileEvents erneut diese
// Funktion auf (mit der GLOBALEN Tierlist-Zeile des Partners) - man kann
// sich so beliebig tief weiterklicken.
function selectTierListEntry(row, entry) {
  hideIaTooltip();
  document.getElementById("itemsAugmentsBody").classList.add("hidden");
  document.getElementById("iaSearchInput").classList.add("hidden");
  document.getElementById("itemsAugmentsHint")?.classList.add("hidden");
  document.getElementById("iaTierListDetailView").classList.remove("hidden");
  renderIaSelectedCard(entry, "iaTierListSelectedCard");
  iaPartnerColumnFilter = null;
  iaPartnerGroupMode = true;
  const groupCb = document.getElementById("iaPartnerGroupToggle");
  if (groupCb) groupCb.checked = true;
  applyIaPartnerColumnFilter();
  renderIaPartnerTierlist(row.topPartners);
}

function backToTierListOverview() {
  document.getElementById("iaTierListDetailView")?.classList.add("hidden");
  document.getElementById("itemsAugmentsBody")?.classList.remove("hidden");
  document.getElementById("iaSearchInput")?.classList.remove("hidden");
  document.getElementById("itemsAugmentsHint")?.classList.remove("hidden");
}

// Tier-Liste ist jetzt eine Checkbox (wie "Gruppieren"), keine eigene
// Seite - unchecked schaltet einfach zurueck zur normalen Ansicht.
function setIaTierListToggleUnchecked() {
  const cb = document.getElementById("iaTierListToggle");
  if (cb) cb.checked = false;
}

// Der Tier-Liste-Schalter aendert NICHT die Seite, sondern sortiert die
// Kacheln der normalen Browse-Ansicht (Silver/Gold/Prismatic bzw.
// Quest/Boots/Legendary/...) innerhalb jeder bestehenden Kategorie nach
// echter Winrate und zeigt Spielanzahl+Winrate als Badge an. Ein Klick
// auf eine Kachel zeigt weiterhin die Partner-Tierliste (Variante B).
function toggleIaTierListMode() {
  const cb = document.getElementById("iaTierListToggle");
  iaTierListMode = cb ? cb.checked : !iaTierListMode;

  if (iaEditMode) { iaEditMode = false; document.getElementById("iaEditModeBtn")?.classList.remove("active"); cancelIaEdit(); }
  if (iaPresetMode) { iaPresetMode = false; document.getElementById("iaPresetModeBtn")?.classList.remove("active"); cancelIaPreset(); }
  backToTierListOverview(); // Partner-Detailansicht verlassen, falls offen
  backToItemsAugmentsBrowse(); // alte Synergie-Detailansicht verlassen, falls offen

  if (iaTierListMode) {
    loadItemAugmentTierlist().then((ok) => {
      if (!ok) console.error("[ItemAugmentTierlist] Konnte Tierlist-Daten nicht laden.");
      renderItemsAugmentsModal();
    });
  }
  renderItemsAugmentsModal();
}

function showIaTooltip(e, entry, kind) {
  if (!iaTooltipEl) {
    iaTooltipEl = document.createElement("div");
    iaTooltipEl.className = "iaTooltip hidden";
    document.body.appendChild(iaTooltipEl);
  }
  // Falls "entry" nur eine Partner-Referenz ohne Beschreibung ist (z.B.
  // aus den Synergie-Ergebnissen oder einer gespeicherten Schnellsuche),
  // volle Daten aus den lokalen Listen nachladen, damit der Tooltip
  // trotzdem die Beschreibung zeigt. Schnellsuche-Eintraege haben kein
  // .apiName-Feld (nur .key aus iaEntityRef), daher zusaetzlich ueber
  // .key und als letzten Fallback ueber den Namen nachschlagen.
  let full = entry;
  if (!entry.desc && kind) {
    if (kind === "augment") {
      const byApiName = entry.apiName && iaAugmentByApiName[entry.apiName];
      const byKey = entry.key && iaAugmentByApiName[entry.key];
      const byName = iaAugmentByName[normName(entry.name?.[currentLang] || entry.name?.de || entry.name?.en || "")];
      full = byApiName || byKey || byName || entry;
    }
    if (kind === "item") full = iaItemByName[normName(entry.name?.[currentLang] || entry.name?.de || "")] || entry;
  }
  const name = iaEntryName(full);
  const desc = iaEntryDesc(full);
  const priceHtml = typeof full.priceTotal === "number"
    ? `<div class="iaTooltipPrice">💰 ${full.priceTotal}${typeof full.price === "number" && full.price !== full.priceTotal ? ` (Komponente: ${full.price})` : ""}</div>`
    : "";
  iaTooltipEl.innerHTML = `
    <div class="iaTooltipTitle">${name}</div>
    ${priceHtml}
    <div class="iaTooltipDesc">${desc || ""}</div>
  `;
  iaTooltipEl.classList.remove("hidden");
  positionIaTooltip(e);
}

function positionIaTooltip(e) {
  if (!iaTooltipEl) return;
  const offset = 16;
  let x = e.clientX + offset;
  let y = e.clientY + offset;
  const rect = iaTooltipEl.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - offset;
  if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - offset;
  iaTooltipEl.style.left = x + "px";
  iaTooltipEl.style.top = y + "px";
}

function hideIaTooltip() {
  if (iaTooltipEl) iaTooltipEl.classList.add("hidden");
}

safeBind("openItemsAugmentsBtn", "onclick", openItemsAugmentsModal);
safeBind("itemsAugmentsClose", "onclick", closeItemsAugmentsModal);
safeBind("itemsAugmentsClearFilter", "onclick", backToItemsAugmentsBrowse);
safeBind("iaTierListToggle", "onchange", toggleIaTierListMode);
safeBind("iaTierListBack", "onclick", backToTierListOverview);
safeBind("iaShowAllBtn", "onclick", () => selectIaColumnFilter("all"));
safeBind("iaShowAugmentsBtn", "onclick", () => selectIaColumnFilter("augment"));
safeBind("iaShowItemsBtn", "onclick", () => selectIaColumnFilter("item"));
safeBind("iaBrowseGroupToggle", "onchange", toggleIaBrowseGroupMode);
safeBind("iaPartnerShowAllBtn", "onclick", () => selectIaPartnerColumnFilter("all"));
safeBind("iaPartnerShowAugmentsBtn", "onclick", () => selectIaPartnerColumnFilter("augment"));
safeBind("iaPartnerShowItemsBtn", "onclick", () => selectIaPartnerColumnFilter("item"));
safeBind("iaPartnerGroupToggle", "onchange", toggleIaPartnerGroupMode);
safeBind("iaEditModeBtn", "onclick", toggleIaEditMode);
safeBind("iaPresetModeBtn", "onclick", toggleIaPresetMode);
safeBind("iaPresetSave", "onclick", saveIaPreset);
safeBind("iaPresetCancel", "onclick", () => { iaPresetMode = false; document.getElementById("iaPresetModeBtn")?.classList.remove("active"); cancelIaPreset(); });
safeBind("iaPresetSearchInput", "oninput", (e) => {
  iaPresetSearchTerm = e.target.value;
  renderIaPresetGrid();
});
safeBind("iaEditClearAll", "onclick", clearIaEditSelection);
safeBind("iaEditCancel", "onclick", cancelIaEdit);
safeBind("iaSearchInput", "oninput", (e) => {
  iaSearchTerm = e.target.value;
  renderItemsAugmentsModal();
});
safeBind("iaEditSearchInput", "oninput", (e) => {
  iaEditSearchTerm = e.target.value;
  renderIaEditTargetGrid();
});

// Kategorie-Dropdowns (Heilung/Schaden/Leben/Resistenzen/CC/...) befuellen.
// Beide Dropdowns (Hauptsuche + Editor) teilen sich denselben Filter-State
// "iaCategoryFilter" und werden beim Aendern synchron gehalten, damit die
// Auswahl nicht verloren geht, wenn man zwischen Browse- und Editor-Ansicht
// wechselt.
function populateIaCategoryDropdown(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">${t("iaCategoryAll")}</option>` +
    Object.keys(IA_CATEGORIES).map((key) => {
      const cat = IA_CATEGORIES[key];
      const label = currentLang === "de" ? cat.labelDe : cat.labelEn;
      return `<option value="${key}">${label}</option>`;
    }).join("");
  selectEl.value = iaCategoryFilter;
}
function onIaCategoryChange(e) {
  iaCategoryFilter = e.target.value;
  const main = document.getElementById("iaCategoryFilter");
  const edit = document.getElementById("iaEditCategoryFilter");
  if (main && main !== e.target) main.value = iaCategoryFilter;
  if (edit && edit !== e.target) edit.value = iaCategoryFilter;
  renderItemsAugmentsModal();
  if (iaEditingAnchor) renderIaEditTargetGrid();
  if (iaPresetMode) renderIaPresetGrid();
}
populateIaCategoryDropdown(document.getElementById("iaCategoryFilter"));
populateIaCategoryDropdown(document.getElementById("iaEditCategoryFilter"));
safeBind("iaCategoryFilter", "onchange", onIaCategoryChange);
safeBind("iaEditCategoryFilter", "onchange", onIaCategoryChange);

// Ein-/Ausklappen der Tier-Abschnitte (Silber/Gold/Prismatic/Legendary/...).
// Delegierter Listener auf dem Modal-Container statt auf den einzelnen
// Labels - die werden bei jeder Suche/jedem Render neu erzeugt, ein
// direkt gebundener Listener wuerde sonst nach dem ersten Render verloren
// gehen. Der Aufklapp-Zustand selbst wird bewusst nicht gespeichert -
// jede neue Filterung/Suche startet wieder mit allen Abschnitten offen.
document.getElementById("itemsAugmentsOverlay")?.addEventListener("click", (e) => {
  const label = e.target.closest("[data-tier-toggle]");
  if (!label) return;
  label.closest(".iaTierGroup")?.classList.toggle("collapsed");
});


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

// ---- Standard-Datenbank (Collection "communityMeta", handgepflegte Stats) ----
// REIN LESEND, genau wie die bestehende KI-Empfehlung - kein Eingabefeld.
function renderCommunityDbPlaceholder() {
  return `<div class="detailSection" id="communityDbSection"><h3>${t("communityDbHeading")}</h3><p class="detailEmpty">...</p></div>`;
}

function renderStatCard(label, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<div class="dbStatCard"><div class="dbStatValue">${value}</div><div class="dbStatLabel">${label}</div></div>`;
}

// Loest einen Champion-Namen (aus synergies/strongAgainst) ueber die schon
// vorhandene championByNormName-Lookup-Tabelle (aus loadChampionList) auf -
// kein zusaetzlicher Request noetig, dieselbe Tabelle nutzt auch der Rest
// der App fuer Trio-/Synergie-Anzeigen.
function championIconUrlByName(name) {
  const c = championByNormName ? championByNormName[normName(name)] : null;
  return c ? c.icon : null;
}

// Icon-Fallback fuer die neuen DB-Reihen (Augments/Items/Champions): EIN
// Icon pro Eintrag (anders als die Mehrfach-Kandidaten-Kette der KI-Tags),
// bei Ladefehler wird einfach auf eine Kuerzel-Badge ohne Bild umgeschaltet.
function bindDbIconFallbacks(container) {
  container.querySelectorAll(".dbIconRow img, .dbSkillIcon img").forEach((img) => {
    img.addEventListener("error", () => {
      const candidates = JSON.parse(img.dataset.candidates || "[]");
      const nextIndex = Number(img.dataset.iconIndex || "0") + 1;
      if (nextIndex < candidates.length) {
        img.dataset.iconIndex = String(nextIndex);
        img.src = candidates[nextIndex];
        return;
      }
      const li = img.closest(".dbIconRow") || img.closest(".dbSkillIcon");
      const span = document.createElement("span");
      span.className = "dbIconFallback";
      span.textContent = (img.alt || "?").slice(0, 2).toUpperCase();
      img.replaceWith(span);
      if (li) li.classList.add("dbIconRow-broken");
    });
  });
}

// Icon + NAME (sichtbar, nicht nur per Tooltip) + optionaler Prozentwert -
// genau das vom Nutzer gewuenschte Format fuer Augments/Items. Items
// koennen mehrere Icon-URL-Kandidaten haben (zwei CDragon-Konventionen) -
// schlaegt die erste fehl, probiert bindDbIconFallbacks automatisch die
// naechste, bevor es auf den Buchstaben-Fallback zurueckfaellt.
function renderIconNameRow(entry, percentLabel) {
  const safeName = (entry.name || "").replace(/"/g, "&quot;");
  const candidates = (entry.iconCandidates && entry.iconCandidates.length ? entry.iconCandidates : [entry.icon]).filter(Boolean);
  const iconHtml = candidates.length
    ? `<img src="${candidates[0]}" alt="${safeName}" data-candidates='${JSON.stringify(candidates).replace(/'/g, "&#39;")}' data-icon-index="0" />`
    : `<span class="dbIconFallback">${safeName.slice(0, 2).toUpperCase()}</span>`;
  return `<li class="dbIconRow">
    <span class="dbIconRow-icon">${iconHtml}</span>
    <span class="dbIconRow-name">${entry.name}</span>
    ${percentLabel ? `<span class="dbIconRow-pct">${percentLabel}</span>` : ""}
  </li>`;
}

// Gleiche Optik wie renderIconNameRow, aber Icon kommt aus der ddragon-
// Champion-Liste (synergies/strongAgainst enthalten nur Champion-Namen,
// keine eigenen Icon-URLs von uns - die brauchen wir hier auch nicht, da
// die App den Champion-Icon-Katalog schon vollstaendig im Speicher hat).
function renderChampionIconRow(entry) {
  const icon = championIconUrlByName(entry.name);
  const iconHtml = icon
    ? `<img src="${icon}" alt="${entry.name}" />`
    : `<span class="dbIconFallback">${entry.name.slice(0, 2).toUpperCase()}</span>`;
  const top3 = entry.top3_pct != null ? `${entry.top3_pct}%` : "";
  const diff = entry.diff ? `<span class="dbDiffTag">${entry.diff}</span>` : "";
  return `<li class="dbIconRow">
    <span class="dbIconRow-icon">${iconHtml}</span>
    <span class="dbIconRow-name">${entry.name}</span>
    ${top3 ? `<span class="dbIconRow-pct">${top3}${diff}</span>` : ""}
  </li>`;
}

// Vier getrennte "Spielstile" (Anvil-Stufen) als Tabs, damit man die
// Augment-Empfehlung gezielt nach Silber/Gold/Prismatic/Gesamt umschalten
// kann statt einer langen vermischten Liste - angelehnt an die Tab-Logik
// von metasrc, aber eigenstaendig umgesetzt (eigene Klassen/Optik).
const AUGMENT_TABS = [
  { key: "overall", labelKey: "communityDbAugmentsOverall", field: "augmentsOverall" },
  { key: "silver", labelKey: "communityDbAugmentsSilver", field: "augmentsSilver" },
  { key: "gold", labelKey: "communityDbAugmentsGold", field: "augmentsGold" },
  { key: "prismatic", labelKey: "communityDbAugmentsPrismatic", field: "augmentsPrismatic" },
];

function renderAugmentTabs(build) {
  const tabsHtml = AUGMENT_TABS.map(
    (tab, i) => `<button class="dbTabBtn${i === 0 ? " active" : ""}" data-augtab="${tab.key}">${t(tab.labelKey)}</button>`
  ).join("");

  const panelsHtml = AUGMENT_TABS.map((tab, i) => {
    const list = build[tab.field] || [];
    const content = list.length
      ? `<ul class="dbIconList" data-augpanel-list="${tab.key}">` +
        list.map((a) => renderIconNameRow(a, a.pickPct != null ? `${a.pickPct}%` : "")).join("") +
        `</ul>`
      : `<p class="detailEmpty">${t("communityDbNoBuildDetails")}</p>`;
    return `<div class="dbTabPanel${i === 0 ? "" : " hidden"}" data-augpanel="${tab.key}">${content}</div>`;
  }).join("");

  return `<div class="dbTabBar">${tabsHtml}</div>${panelsHtml}`;
}

function bindAugmentTabs(section, build) {
  section.querySelectorAll(".dbTabBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.augtab;
      section.querySelectorAll(".dbTabBtn").forEach((b) => b.classList.toggle("active", b === btn));
      section.querySelectorAll(".dbTabPanel").forEach((p) => p.classList.toggle("hidden", p.dataset.augpanel !== key));
    });
  });

  for (const tab of AUGMENT_TABS) {
    const list = build[tab.field] || [];
    const enriched = list.map((a) => enrichDbEntryWithDesc(a, "augment"));
    const panel = section.querySelector(`[data-augpanel-list="${tab.key}"]`);
    if (panel) {
      bindAiTagTooltips(panel, ".dbIconRow", enriched);
      bindDbIconListClicks(panel, ".dbIconRow", enriched, "augment");
    }
  }
}

function renderCommunityDbContent(data) {
  if (!data) {
    return `<h3>${t("communityDbHeading")}</h3><p class="detailEmpty">${t("communityDbNone")}</p>`;
  }

  let html = `<div class="dbHeaderRow">
    <span class="metaTierBadge ${metaTierBadgeClass(data.tier)}">${data.tier || "?"}</span>
    <h3 style="margin:0;">${t("communityDbHeading")}</h3>
  </div>`;

  const statCards = [
    renderStatCard(t("communityDbWinrate"), data.winPct != null ? `${data.winPct}%` : null),
    renderStatCard(t("communityDbTop3"), data.top3Pct != null ? `${data.top3Pct}%` : null),
    renderStatCard(t("communityDbPickRate"), data.pickPct != null ? `${data.pickPct}%` : null),
    renderStatCard(t("communityDbBanRate"), data.banPct != null ? `${data.banPct}%` : null),
    renderStatCard(t("communityDbKda"), data.kda),
    renderStatCard(t("communityDbAvgPlace"), data.avgPlace),
    renderStatCard(t("communityDbGames"), data.games),
  ].filter(Boolean);

  if (statCards.length) {
    html += `<div class="dbStatGrid">${statCards.join("")}</div>`;
  }

  if (!data.hasBuildDetails || !data.build) {
    html += `<p class="detailEmpty" style="margin-top:8px;">${t("communityDbNoBuildDetails")}</p>`;
    return html;
  }

  const build = data.build;

  html += `<div class="dbTwoCol">`;

  html += `<div>`;
  html += `<p class="detailSkillOrderLabel">${t("communityDbAugmentsHeading")}</p>`;
  html += renderAugmentTabs(build);

  if (build.itemNamesFromIntro && build.itemNamesFromIntro.length) {
    html += `<p class="detailSkillOrderLabel" style="margin-top:10px;">${t("communityDbItems")}</p><ul class="dbIconList" data-itemlist="1">` +
      build.itemNamesFromIntro.map((i) => renderIconNameRow(i, "")).join("") + `</ul>`;
  }
  html += `</div>`;

  html += `<div>`;
  if (build.synergies && build.synergies.length) {
    html += `<p class="detailSkillOrderLabel">${t("communityDbSynergies")}</p><ul class="dbIconList" data-synergylist="1">` +
      build.synergies.map((s) => renderChampionIconRow(s)).join("") + `</ul>`;
  }
  if (build.strongAgainst && build.strongAgainst.length) {
    html += `<p class="detailSkillOrderLabel" style="margin-top:10px;">${t("communityDbStrongAgainst")}</p><ul class="dbIconList" data-stronglist="1">` +
      build.strongAgainst.map((s) => renderChampionIconRow(s)).join("") + `</ul>`;
  }
  if (build.skillOrder && build.skillOrder.priority) {
    html += `<p class="detailSkillOrderLabel" style="margin-top:10px;">${t("communityDbSkillOrder")}</p>`;
    html += renderSkillOrderIcons(build.skillOrder);
  }
  html += `</div>`;

  html += `</div>`;
  return html;
}

// Skill-Reihenfolge als Icon-Reihe (Q/W/E/R-Bilder statt nur Buchstaben),
// mit Hover-Tooltip (Faehigkeitsname + Beschreibung DE/EN). Fehlt das
// Icon (Sync noch nicht gelaufen), wird der Buchstabe als Fallback gezeigt.
function renderSkillOrderIcons(skillOrder) {
  const icons = skillOrder.icons;
  if (!icons || !icons.length) {
    return `<div class="detailSkillOrder">${skillOrder.priority}</div>`;
  }
  const rows = icons.map((s, i) => {
    const iconHtml = s.icon
      ? `<img src="${s.icon}" alt="${s.key}" />`
      : `<span class="dbIconFallback">${s.key}</span>`;
    const arrow = i < icons.length - 1 ? `<span class="dbSkillArrow">&gt;</span>` : "";
    return `<span class="dbSkillIcon" data-skillkey="${s.key}">${iconHtml}</span>${arrow}`;
  }).join("");
  return `<div class="dbSkillOrderRow" data-skillorder="1">${rows}</div>`;
}

function bindSkillOrderTooltips(section, build) {
  if (!build.skillOrder || !build.skillOrder.icons) return;
  const row = section.querySelector("[data-skillorder]");
  if (!row) return;
  bindAiTagTooltips(row, ".dbSkillIcon", build.skillOrder.icons);
}

// Hover-Info fuer Champion-Icon-Zeilen (Synergien/Stark-gegen): hier gibt
// es keine CDragon-Beschreibung, sondern Zahlen (Top-3%, Differenz, Spiele) -
// deshalb eigene kleine Tooltip-Funktion statt des Text-basierten
// showAiTagTooltip, aber mit demselben #champTooltip-Element.
function championStatsTooltipText(entry) {
  const parts = [];
  if (entry.top3_pct != null) parts.push(`${t("communityDbTop3")}: ${entry.top3_pct}%`);
  if (entry.diff) parts.push(`${t("communityDbDiff")}: ${entry.diff}`);
  if (entry.games) parts.push(`${t("communityDbGames")}: ${entry.games}`);
  return parts.join(" · ");
}
function bindChampionStatTooltips(container, selector, entries) {
  const items = container.querySelectorAll(selector);
  items.forEach((li, i) => {
    const entry = entries[i];
    if (!entry) return;
    const show = (e) => {
      const tooltip = document.getElementById("champTooltip");
      const bodyText = championStatsTooltipText(entry);
      tooltip.innerHTML = `<div class="tooltipTitle">${entry.name}</div>` +
        (bodyText ? `<div class="tooltipCount">${bodyText}</div>` : "");
      tooltip.classList.remove("hidden");
      positionTooltip(e);
    };
    li.addEventListener("mouseenter", show);
    li.addEventListener("mousemove", positionTooltip);
    li.addEventListener("mouseleave", hideChampTooltip);
  });
}

function bindCommunityDbInteractions(section, data) {
  bindDbIconFallbacks(section);
  if (!data || !data.build) return;
  const build = data.build;
  bindAugmentTabs(section, build);

  const itemList = section.querySelector("[data-itemlist]");
  if (itemList && build.itemNamesFromIntro) {
    const enrichedItems = build.itemNamesFromIntro.map((i) => enrichDbEntryWithDesc(i, "item"));
    bindAiTagTooltips(itemList, ".dbIconRow", enrichedItems);
    bindDbIconListClicks(itemList, ".dbIconRow", enrichedItems, "item");
  }

  const synergyList = section.querySelector("[data-synergylist]");
  if (synergyList && build.synergies) bindChampionStatTooltips(synergyList, ".dbIconRow", build.synergies);

  const strongList = section.querySelector("[data-stronglist]");
  if (strongList && build.strongAgainst) bindChampionStatTooltips(strongList, ".dbIconRow", build.strongAgainst);

  bindSkillOrderTooltips(section, build);
}

async function loadCommunityDbSection(champ) {
  const section = document.getElementById("communityDbSection");
  if (!section) return;
  try {
    const [res] = await Promise.all([
      authFetch(serverUrl(`/community-meta/${champ.key}`)),
      loadArenaItemsAugments()
    ]);
    if (!res.ok) {
      section.innerHTML = renderCommunityDbContent(null);
      return;
    }
    const data = await res.json();
    section.innerHTML = renderCommunityDbContent(data);
    bindCommunityDbInteractions(section, data);
  } catch {
    section.innerHTML = renderCommunityDbContent(null);
  }
}

// ---- KI-Analyse der Standard-Datenbank (Collection "communityAiMeta") ----
// Erscheint UNTER der Standard-Datenbank-Sektion, getrennte eigene KI-Quelle
// (NICHT zu verwechseln mit der bestehenden "itemMeta"-KI-Empfehlung oben,
// die auf eigenen Match-Daten basiert statt auf der Community-Datenbank).
function renderCommunityAiPlaceholder() {
  return `<div class="detailSection" id="communityAiSection"><h3>${t("communityAiHeading")}</h3><p class="detailEmpty">...</p></div>`;
}

function renderCommunityAiContent(data) {
  if (!data) {
    return `<h3>${t("communityAiHeading")}</h3><p class="detailEmpty">${t("communityAiNone")}</p>`;
  }

  let html = `<h3>${t("communityAiHeading")}</h3>`;
  html += `<p class="detailEmpty" style="margin-bottom:8px;">${confidenceLabel(data.confidence)}</p>`;

  if (data.summary) {
    html += `<p class="detailEmpty">${data.summary}</p>`;
  }
  if (data.strengths && data.strengths.length) {
    html += `<p class="detailSkillOrderLabel">${t("communityAiStrengths")}</p><ul class="detailTacticsList">` +
      data.strengths.map((s) => `<li>${s}</li>`).join("") + `</ul>`;
  }
  if (data.recommendedAugments && data.recommendedAugments.length) {
    html += `<p class="detailSkillOrderLabel">${t("communityAiAugments")}</p><ul class="dbIconList" data-airecaugs="1">` +
      data.recommendedAugments.map((a) => renderIconNameRow(a, "")).join("") + `</ul>`;
    html += `<ul class="detailTacticsList" style="margin-top:4px;">` +
      data.recommendedAugments.map((a) => `<li><strong>${a.name}:</strong> ${a.reason}</li>`).join("") + `</ul>`;
  }
  if (data.synergyNote) {
    html += `<p class="detailSkillOrderLabel">${t("communityAiSynergy")}</p><p class="detailEmpty">${data.synergyNote}</p>`;
  }
  if (data.weaknessNote) {
    html += `<p class="detailSkillOrderLabel">${t("communityAiWeakness")}</p><p class="detailEmpty">${data.weaknessNote}</p>`;
  }
  return html;
}

function bindCommunityAiInteractions(section, data) {
  bindDbIconFallbacks(section);
  if (data && data.recommendedAugments && data.recommendedAugments.length) {
    const list = section.querySelector("[data-airecaugs]");
    if (list) {
      const enriched = data.recommendedAugments.map((a) => enrichDbEntryWithDesc(a, "augment"));
      bindAiTagTooltips(list, ".dbIconRow", enriched);
      bindDbIconListClicks(list, ".dbIconRow", enriched, "augment");
    }
  }
}

async function loadCommunityAiSection(champ) {
  const section = document.getElementById("communityAiSection");
  if (!section) return;
  try {
    const [res] = await Promise.all([
      authFetch(serverUrl(`/community-meta-ai/${champ.key}`)),
      loadArenaItemsAugments()
    ]);
    if (!res.ok) {
      section.innerHTML = renderCommunityAiContent(null);
      return;
    }
    const data = await res.json();
    section.innerHTML = renderCommunityAiContent(data);
    bindCommunityAiInteractions(section, data);
  } catch {
    section.innerHTML = renderCommunityAiContent(null);
  }
}

// Rendert ein einzelnes Tag der KI-Empfehlung: NUR Icon, kein Text.
// "icon" kann entweder ein einzelner String sein (Augments, 1 URL-
// Konvention reicht) oder ein Array von Kandidaten-URLs (Items/Spells,
// 2 verschiedene CDragon-Pfad-Konventionen werden nacheinander probiert,
// bevor auf Text zurueckgefallen wird). Tooltip-Inhalt (Name + offizielle
// Spielbeschreibung) wird NICHT mehr ueber das native title-Attribut
// gezeigt, sondern ueber das bestehende #champTooltip-System der App -
// deutlich sichtbarer als der unauffaellige Browser-Standard-Tooltip.
function renderAiTag(entry) {
  const candidates = Array.isArray(entry.icon) ? entry.icon.filter(Boolean) : entry.icon ? [entry.icon] : [];
  const safeName = entry.name.replace(/"/g, "&quot;");

  if (candidates.length > 0) {
    return `<li class="detailTagList-item aiTagItem" data-fallback-name="${safeName}" data-icon-index="0">` +
      `<img src="${candidates[0]}" alt="${safeName}" data-candidates='${JSON.stringify(candidates).replace(/'/g, "&#39;")}' />` +
      `</li>`;
  }
  return `<li class="detailTagList-item aiTagItem">${entry.name}</li>`;
}

// Bindet pro KI-Tag: (1) Icon-Fallback-Kette - bei Ladefehler wird die
// naechste Kandidaten-URL probiert, erst nach allen Versuchen Text-
// Fallback; (2) Hover -> zeigt Name + offizielle Beschreibung im
// bestehenden #champTooltip-Element der App, in der aktuell aktiven
// Sprache (currentLang).
function bindAiTagFallbacks(container) {
  container.querySelectorAll(".aiTagItem").forEach((li) => {
    const img = li.querySelector("img");
    if (img) {
      img.addEventListener("error", () => {
        const candidates = JSON.parse(img.dataset.candidates || "[]");
        const nextIndex = Number(li.dataset.iconIndex || "0") + 1;
        if (nextIndex < candidates.length) {
          li.dataset.iconIndex = String(nextIndex);
          img.src = candidates[nextIndex];
        } else {
          li.textContent = li.dataset.fallbackName || img.alt || "";
        }
      });
    }
  });
}

// Generischer Tooltip-Trigger fuer KI-Tags, nutzt dasselbe #champTooltip-
// Element wie die Champion-Grid-Hovers. "entry" ist das Original-Objekt
// (mit .name und .tooltip = {en, de}), wird per Closure mitgegeben statt
// aus dem DOM gelesen - umgeht jegliche HTML-Escaping-Probleme.
function showAiTagTooltip(e, entry) {
  const tooltip = document.getElementById("champTooltip");
  const bodyText = entry.tooltip ? (entry.tooltip[currentLang] || entry.tooltip.en || "") : "";
  tooltip.innerHTML = `<div class="tooltipTitle">${entry.name}</div>` +
    (bodyText ? `<div class="tooltipCount">${bodyText}</div>` : "");
  tooltip.classList.remove("hidden");
  positionTooltip(e);
}

// Bindet die Hover-Tooltips fuer eine Liste von KI-Tag-Elementen + ihre
// Original-Datenobjekte (Reihenfolge MUSS der Render-Reihenfolge
// entsprechen - wird direkt nach dem jeweiligen renderAiTag-Aufruf genutzt).
// Reichert einen Community-DB-Eintrag ({name, pickPct, ...}) mit der
// echten Augment-/Item-Beschreibung aus arenaAugmentsData/arenaItemsData
// an, damit der Hover-Tooltip nicht nur den Namen zeigt, sondern auch
// den Beschreibungstext (falls die Referenzdaten geladen sind).
function enrichDbEntryWithDesc(entry, kind) {
  const lookupMap = kind === "item" ? iaItemByName : iaAugmentByName;
  const match = lookupMap[normName(entry.name)];
  if (!match || !match.desc) return entry;
  return {
    ...entry,
    tooltip: { en: match.desc.en || match.desc.de || "", de: match.desc.de || match.desc.en || "" }
  };
}

// Macht eine dbIconList-Zeile klickbar: oeffnet dieselbe Synergie-Detailansicht
// wie die "clickableTag"-Elemente im Build-Bereich (openItemOrAugmentDetail).
function bindDbIconListClicks(container, selector, entries, kind) {
  const items = container.querySelectorAll(selector);
  items.forEach((li, i) => {
    const entry = entries[i];
    if (!entry) return;
    li.classList.add("clickableTag");
    li.addEventListener("click", () => openItemOrAugmentDetail(entry.name, kind));
  });
}

function bindAiTagTooltips(container, selector, entries) {
  const items = container.querySelectorAll(selector);
  items.forEach((li, i) => {
    const entry = entries[i];
    if (!entry) return;
    li.addEventListener("mouseenter", (e) => showAiTagTooltip(e, entry));
    li.addEventListener("mousemove", positionTooltip);
    li.addEventListener("mouseleave", hideChampTooltip);
  });
}

function renderAiMetaContent(aiMeta) {
  if (!aiMeta) {
    return `<h3>${t("champDetailAiHeading")}</h3><p class="detailEmpty">${t("champDetailAiNone")}</p>`;
  }

  let html = `<h3>${t("champDetailAiHeading")}</h3>`;
  html += `<p class="detailEmpty" style="margin-bottom:8px;">${confidenceLabel(aiMeta.confidence)} (${aiMeta.sampleSize || 0} Spiele)</p>`;

  if (aiMeta.coreItems && aiMeta.coreItems.length) {
    html += `<p class="detailSkillOrderLabel">${t("champDetailAiCore")}</p><ul class="detailTagList" data-ai-group="coreItems">` +
      aiMeta.coreItems.map(renderAiTag).join("") + `</ul>`;
  }
  if (aiMeta.situationalItems && aiMeta.situationalItems.length) {
    html += `<p class="detailSkillOrderLabel">${t("champDetailAiSituational")}</p><ul class="detailTagList" data-ai-group="situationalItems">` +
      aiMeta.situationalItems.map(renderAiTag).join("") + `</ul>`;
  }
  if (aiMeta.recommendedAugments && aiMeta.recommendedAugments.length) {
    html += `<p class="detailSkillOrderLabel">${t("champDetailAiAugments")}</p><ul class="detailTagList" data-ai-group="recommendedAugments">` +
      aiMeta.recommendedAugments.map(renderAiTag).join("") + `</ul>`;
  }
  if (aiMeta.recommendedSummonerSpells && aiMeta.recommendedSummonerSpells.length) {
    html += `<p class="detailSkillOrderLabel">${t("champDetailAiSpells")}</p><ul class="detailTagList" data-ai-group="recommendedSummonerSpells">` +
      aiMeta.recommendedSummonerSpells.map(renderAiTag).join("") + `</ul>`;
  }
  if (aiMeta.buildPathSummary) {
    html += `<p class="detailEmpty" style="margin-top:8px;">${aiMeta.buildPathSummary}</p>`;
  }
  return html;
}

// Bindet fuer jede der 4 Kategorien Icon-Fallback + Hover-Tooltip -
// getrennt pro Gruppe (data-ai-group), damit die Reihenfolge der
// Original-Datenobjekte garantiert zur Render-Reihenfolge passt.
function bindAiMetaInteractions(container, aiMeta) {
  bindAiTagFallbacks(container);
  const groups = {
    coreItems: aiMeta.coreItems,
    situationalItems: aiMeta.situationalItems,
    recommendedAugments: aiMeta.recommendedAugments,
    recommendedSummonerSpells: aiMeta.recommendedSummonerSpells,
  };
  for (const [groupName, entries] of Object.entries(groups)) {
    if (!entries || !entries.length) continue;
    const list = container.querySelector(`[data-ai-group="${groupName}"]`);
    if (list) bindAiTagTooltips(list, ".aiTagItem", entries);
  }
}

// Laedt die KI-Empfehlung asynchron NACH dem ersten Rendern der
// Detailansicht (champ.key = numerische Champion-ID, passend zur
// itemMeta-Collection). Schlaegt der Request fehl (z.B. Server down),
// wird einfach "keine Daten" angezeigt statt eines Fehlers.
async function loadAiMetaSection(champ) {
  const section = document.getElementById("aiMetaSection");
  if (!section) return;
  try {
    const res = await authFetch(serverUrl(`/meta-ai/${champ.key}`));
    if (!res.ok) {
      section.innerHTML = renderAiMetaContent(null);
      return;
    }
    const aiMeta = await res.json();
    section.innerHTML = renderAiMetaContent(aiMeta);
    bindAiMetaInteractions(section, aiMeta);
  } catch {
    section.innerHTML = renderAiMetaContent(null);
  }
}

function openChampDetail(champ) {
  currentDetailChamp = champ;
  hideChampTooltip();
  document.getElementById("grid").classList.add("hidden");
  document.getElementById("top30Trio").classList.add("hidden");
  document.getElementById("mainMatchHistorySection")?.classList.add("hidden");
  document.getElementById("champBuildSidebar").classList.remove("hidden");
  document.getElementById("rankingPanel").classList.add("hidden");
  const detail = document.getElementById("champDetail");
  detail.classList.remove("hidden");

  detail.innerHTML = `
    <div class="detailHeader">
      <button class="backArrowBtn" id="champDetailBackBtn" title="${t("backToGridTitle")}">${t("backArrow")}</button>
      <img src="${champ.icon}" alt="${champ.name}" />
      <h2>${champ.name}</h2>
    </div>
    <div class="detailSection" id="champPresetsSection">
      <h3 class="champPresetsToggle collapsed" id="champPresetsToggle" data-i18n="champPresetsHeading">Schnellsuchen</h3>
      <div id="champPresetsBody" class="hidden">
        <div id="champPresetPills"><p class="detailEmpty">...</p></div>
        <div id="champPresetEntries"></div>
      </div>
    </div>
    ${renderCommunityDbPlaceholder()}
    ${renderCommunityAiPlaceholder()}
  `;

  applyStaticTranslations();

  document.getElementById("champDetailBackBtn").addEventListener("click", closeChampDetail);
  document.getElementById("champPresetsToggle").addEventListener("click", () => {
    document.getElementById("champPresetsBody").classList.toggle("hidden");
    document.getElementById("champPresetsToggle").classList.toggle("collapsed");
  });
  detail.querySelectorAll(".clickableTag").forEach((li) => {
    li.addEventListener("click", () => openItemOrAugmentDetail(li.dataset.name, li.dataset.type));
  });
  loadChampPresetPicker(champ);
  loadChampBuildsSidebar(champ);
  loadCommunityDbSection(champ);
  loadCommunityAiSection(champ);
}

// ---------- Champion-Seite: reine Anzeige/Auswahl der GLOBALEN Presets ----------
// Kein Zuweisen/Speichern mehr pro Champion - nur Klick zum Anzeigen.
// Presets selbst werden weiterhin ausschliesslich im Editor (Items &
// Augments -> "+ Preset") erstellt/verwaltet.

let champPresetSelectedId = null;

async function loadChampPresetPicker(champ) {
  const pillsEl = document.getElementById("champPresetPills");
  if (!pillsEl) return;
  champPresetSelectedId = null;
  loadArenaItemsAugments();
  try {
    const presets = await loadPresets();
    renderChampPresetPills(presets);
    document.getElementById("champPresetEntries").innerHTML = "";
  } catch (err) {
    console.error("[ChampPresets] Laden fehlgeschlagen:", err);
    pillsEl.innerHTML = `<p class="detailEmpty">${t("iaLoadError")}</p>`;
  }
}

function renderChampPresetPills(presets) {
  const pillsEl = document.getElementById("champPresetPills");
  if (!pillsEl) return;
  if (!presets.length) {
    pillsEl.innerHTML = `<p class="detailEmpty">${t("champPresetsNoneGlobal")}</p>`;
    return;
  }
  pillsEl.innerHTML = presets.map((p) => `
    <button class="champPresetPill${p._id === champPresetSelectedId ? " active" : ""}" data-preset-id="${p._id}">
      ${p.name}${p.createdBy ? ` <span class="champPresetPillCreator">${t("iaPresetByLabel")} ${p.createdBy}</span>` : ""}
    </button>
  `).join("");
  pillsEl.querySelectorAll(".champPresetPill").forEach((btn) => {
    btn.onclick = () => {
      const preset = presets.find((p) => p._id === btn.dataset.presetId);
      if (!preset) return;
      // Klick auf das bereits aktive Preset schliesst es wieder.
      champPresetSelectedId = champPresetSelectedId === preset._id ? null : preset._id;
      renderChampPresetPills(presets);
      renderChampPresetEntries(champPresetSelectedId ? preset : null);
    };
  });
}

// Zeigt NUR das angeklickte Preset (alle anderen verschwinden aus der
// Auswahl-Anzeige automatisch, da renderChampPresetPills() neu rendert) -
// Preset-Name als Ueberschrift, Eintraege gruppiert nach Tier wie gewohnt.
function renderChampPresetEntries(preset) {
  const container = document.getElementById("champPresetEntries");
  if (!container) return;
  if (!preset) {
    container.innerHTML = "";
    return;
  }
  const entries = preset.entries || [];
  const augments = entries.filter((e) => e.type === "augment");
  const items = entries.filter((e) => e.type === "item");

  let html = `<h4 class="champPresetActiveName">${preset.name}</h4>`;
  if (augments.length) {
    html += `<div class="champPresetKindLabel">${t("iaAugmentsHeading")}</div>` +
      IA_AUGMENT_TIERS.map((tier) => renderIaTierGroup(augments, tier, "augment")).join("");
  }
  if (items.length) {
    html += `<div class="champPresetKindLabel">${t("iaItemsHeading")}</div>` +
      IA_ITEM_TIERS.map((tier) => renderIaTierGroup(items, tier, "item")).join("");
  }
  container.innerHTML = html;

  // Hover-Tooltip mit Beschreibung + Klick oeffnet die Synergie-Ansicht
  // (gleiches Verhalten wie bei den Build-Tags und der Standard-Datenbank).
  container.querySelectorAll(".iaTile").forEach((tile) => {
    const kind = tile.dataset.kind;
    const idx = parseInt(tile.dataset.idx, 10);
    const entry = (kind === "augment" ? augments : items)[idx];
    if (!entry) return;
    tile.addEventListener("mouseenter", (e) => showIaTooltip(e, entry, kind));
    tile.addEventListener("mousemove", positionIaTooltip);
    tile.addEventListener("mouseleave", hideIaTooltip);
    tile.style.cursor = "pointer";
    tile.addEventListener("click", () => {
      hideIaTooltip();
      openItemOrAugmentDetail(iaEntryName(entry), kind);
    });
  });
}


// Vierte Ebene: ersetzt die komplette Detailansicht durch eine einzelne,
// volle Breite nutzende Synergie-Ansicht. Rueckweg fuehrt zurueck zur
// zuletzt geoeffneten Champion-Ansicht (nicht zum Grid).

// Laedt die ECHTEN, live editierbaren Synergien aus der synergyPairs-
// Collection (dieselbe Quelle wie der "✏️ Synergien bearbeiten"-Editor
// und die Detailansicht im Items&Augments-Modal, ueber /synergy/:type/:key).
// Vorher wurde hier faelschlich die separate, statische
// metaData.augmentSynergyMap/itemSynergyMap genutzt (vom Agent-Sync
// befuellt, NICHT vom Synergie-Editor) - dadurch zeigten manuell
// gepflegte Synergien hier nie an, obwohl sie im Editor sichtbar waren.
async function openItemOrAugmentDetail(name, type) {
  const heading = type === "item" ? t("itemDetailHeading") : t("augmentDetailHeading");
  const detail = document.getElementById("champDetail");

  detail.innerHTML = `
    <div class="detailHeader">
      <button class="backArrowBtn" id="itemDetailBackBtn" title="${t("backToChampTitle")}">${t("backArrow")}</button>
      <h2>${name}</h2>
    </div>
    <div class="detailSection"><h3>${heading} · ${t("detailSynergyHeading")}</h3>
      <div id="itemDetailSynergyBody"><p class="detailEmpty">…</p></div>
    </div>`;
  document.getElementById("itemDetailBackBtn").addEventListener("click", () => openChampDetail(currentDetailChamp));

  const bodyEl = document.getElementById("itemDetailSynergyBody");
  await loadArenaItemsAugments();
  const lookupEntry = type === "item" ? iaItemByName[normName(name)] : iaAugmentByName[normName(name)];
  if (!lookupEntry) {
    bodyEl.innerHTML = `<p class="detailEmpty">${t("detailNoSynergyData")}</p>`;
    return;
  }

  try {
    const ref = iaEntityRef(lookupEntry, type);
    const res = await authFetch(serverUrl(`/synergy/${ref.type}/${encodeURIComponent(ref.key)}`));
    const partners = res.ok ? await res.json() : [];
    if (!partners.length) {
      bodyEl.innerHTML = `<p class="detailEmpty">${t("detailNoSynergyData")}</p>`;
      return;
    }
    const augPartners = partners.filter((p) => p.type === "augment");
    const itemPartners = partners.filter((p) => p.type === "item");
    let html = "";
    if (augPartners.length) {
      html += `<h4>${t("iaAugmentsHeading")}</h4>` +
        IA_AUGMENT_TIERS.map((tier) => renderIaTierGroup(augPartners, tier, "augment")).join("");
    }
    if (itemPartners.length) {
      html += `<h4>${t("iaItemsHeading")}</h4>` +
        IA_ITEM_TIERS.map((tier) => renderIaTierGroup(itemPartners, tier, "item")).join("");
    }
    bodyEl.innerHTML = html;

    const bindPartnerTiles = (entries, kind) => {
      bodyEl.querySelectorAll(`.iaTile[data-kind="${kind}"]`).forEach((tile) => {
        const idx = parseInt(tile.dataset.idx, 10);
        const entry = entries[idx];
        if (!entry) return;
        tile.addEventListener("mouseenter", (e) => showIaTooltip(e, entry, kind));
        tile.addEventListener("mousemove", positionIaTooltip);
        tile.addEventListener("mouseleave", hideIaTooltip);
        tile.style.cursor = "pointer";
        tile.addEventListener("click", () => { hideIaTooltip(); openItemOrAugmentDetail(iaEntryName(entry), kind); });
      });
    };
    if (augPartners.length) bindPartnerTiles(augPartners, "augment");
    if (itemPartners.length) bindPartnerTiles(itemPartners, "item");
  } catch (err) {
    console.error("[ItemDetail] Synergie-Lookup fehlgeschlagen:", err);
    bodyEl.innerHTML = `<p class="detailEmpty">${t("detailNoSynergyData")}</p>`;
  }
}

function closeChampDetail() {
  document.getElementById("champDetail").classList.add("hidden");
  document.getElementById("grid").classList.remove("hidden");
  document.getElementById("top30Trio").classList.remove("hidden");
  document.getElementById("mainMatchHistorySection")?.classList.remove("hidden");
  document.getElementById("champBuildSidebar").classList.add("hidden");
  document.getElementById("rankingPanel").classList.remove("hidden");
}

// ---------- Freunde ----------

async function loadFriends() {
  if (!state.riotId || !state.serverUrl) return;
  try {
    const res = await authFetch(serverUrl(`/friends/${encodeURIComponent(state.riotId)}`));
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
    const res = await authFetch(serverUrl(`/friends/${encodeURIComponent(state.riotId)}`), {
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
    const res = await authFetch(serverUrl(path));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t("rankLoadFailed"));
    renderRanking(data.ranking || []);
    rememberProfileIcons(data.ranking || []);
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

const DEFAULT_PROFILE_ICON_ID = 29;

// Merkt sich zu jedem bekannten Ranking-Namen (Teil vor dem "#") das
// zuletzt gesehene profileIconId - genutzt, um im Mitspieler-Tab
// dieselben echten Profilicons wie im Ranking anzuzeigen, statt
// Champion-Icons. Bei Namensueberschneidungen (zwei Accounts mit
// gleichem Namen, unterschiedlichem Tag) gewinnt der zuletzt geladene
// Eintrag - ein Kompromiss, da Mitspieler-Daten selbst kein Tag speichern.
let knownProfileIconsByName = {};

function rememberProfileIcons(ranking) {
  for (const entry of ranking) {
    if (!entry.riotId) continue;
    const gameName = entry.riotId.split("#")[0];
    if (!gameName) continue;
    knownProfileIconsByName[gameName.toLowerCase()] = entry.profileIconId || DEFAULT_PROFILE_ICON_ID;
  }
}

// Baut dasselbe <img>-Markup wie im Ranking (echtes Profilicon + Fallback
// auf Standard-Icon 29 bei Ladefehler). Ist der Name nicht aus dem
// Ranking bekannt (Mitspieler nutzt die App selbst nicht/nicht
// registriert), wird direkt das Standard-Icon verwendet.
function buildProfileIconImg(displayName) {
  const iconId = knownProfileIconsByName[displayName.toLowerCase()] || DEFAULT_PROFILE_ICON_ID;
  if (!ddragonVersion) return `<span class="dbIconFallback">${displayName.slice(0, 2).toUpperCase()}</span>`;
  const iconUrl = `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/profileicon/${iconId}.png`;
  const fallbackUrl = `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/profileicon/${DEFAULT_PROFILE_ICON_ID}.png`;
  return `<img src="${iconUrl}" alt="${displayName}" onerror="this.onerror=null;this.src='${fallbackUrl}';" />`;
}

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
    // Echtes In-Game-Profilicon des Spielers, wenn vorhanden (wird beim
    // Sync mitgespeichert). Fehlt es (z.B. weil der Nutzer noch nicht
    // seit dem Update neu gesynct wurde) oder schlaegt das Laden fehl,
    // wird IMMER ein echtes League-Profilicon angezeigt (Standard-Icon
    // 29), NIE mehr das op.gg-Logo - alle Spieler sollen optisch
    // gleich aussehen wie in League selbst, nicht wie auf op.gg.
    const DEFAULT_PROFILE_ICON_ID = 29;
    const iconId = entry.profileIconId || DEFAULT_PROFILE_ICON_ID;
    const profileIconUrl = ddragonVersion
      ? `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/profileicon/${iconId}.png`
      : null;
    const fallbackIconUrl = ddragonVersion
      ? `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/profileicon/${DEFAULT_PROFILE_ICON_ID}.png`
      : "";
    const iconImg = profileIconUrl
      ? `<img src="${profileIconUrl}" alt="${entry.riotId}" onerror="this.onerror=null;this.src='${fallbackIconUrl}';" />`
      : "";
    const opggLink = opggUrl
      ? `<a class="opggLink" href="${opggUrl}" target="_blank" rel="noopener noreferrer" title="${t("opggOpenTitle")}">${iconImg}</a>`
      : "";

    // Je nach gewaehlter Kategorie wird ein anderer Wert angezeigt.
    // In allen Kategorien wird zusaetzlich die Winrate vorangestellt
    // (sofern genug Spiele vorhanden).
    const winRateSpan = typeof entry.winRate === "number" && entry.totalGames >= 5
      ? `<span class="rankWinRate">${entry.winRate.toFixed(1)}%</span>`
      : "";
    let valueHtml;
    if (currentRankingCategory === "totalWins") {
      valueHtml = `${winRateSpan}<span class="rankWins">${entry.totalWins} Wins</span>`;
    } else if (currentRankingCategory === "bestChampion") {
      const champ = entry.bestChampionKey ? championByKey[entry.bestChampionKey] : null;
      const champIcon = champ
        ? `<img src="${champ.icon}" alt="${champ.name}" title="${champ.name}" class="rankBestChampIcon" />`
        : "";
      valueHtml = `${champIcon}${winRateSpan}<span class="rankWins">${entry.bestChampionWins} Wins</span>`;
    } else if (currentRankingCategory === "winRate") {
      const wrDisplay = typeof entry.winRate === "number" && entry.totalGames >= 5
        ? `<span class="rankWinRateBig">${entry.winRate.toFixed(1)}%</span><span class="rankWins">${entry.totalWins}W</span>`
        : `<span class="rankWins rankWinRateTooFew">–</span>`;
      valueHtml = wrDisplay;
    } else {
      // Eigene Winrate fuer diese Kategorie: jeder gewonnene Champion
      // zaehlt nur einmal (championsWon), im Verhaeltnis zu allen
      // verschiedenen gespielten Champions (championsPlayed) - bewusst
      // NICHT die globale winRate (die Mehrfachsiege mitzaehlt).
      const champWinRateSpan = typeof entry.championsWinRate === "number" && entry.championsPlayed >= 5
        ? `<span class="rankWinRate">${entry.championsWinRate.toFixed(1)}%</span>`
        : "";
      valueHtml = `${champWinRateSpan}<span class="rankWins">${entry.championsWon} Champs</span>`;
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
    const res = await authFetch(serverUrl(`/stats/${encodeURIComponent(riotId)}`));
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
    const res = await authFetch(serverUrl(`/friends/${encodeURIComponent(state.riotId)}`));
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

// ============================================================
// NEU (19.07.2026): Eigene Statistik-Seite - Platzierungsverteilung
// ============================================================
// Zeigt, wie oft man 1., 2., 3. usw. Platz belegt hat - insgesamt UND
// pro Champion. Nutzt AUSSCHLIESSLICH bereits vorhandene Daten
// (state.matchHistory[champKey][i].placement), die ohnehin schon bei
// jedem Sync vom Server kommen (siehe syncUser.js im Backend) - daher
// komplett clientseitig berechnet, kein neuer Server-Endpunkt noetig.
// Gleiche Datenquelle wie die Champion-Tooltips und updateOverallStats().

// Liefert { overall: {placement: count}, perChamp: {champKey: {placement: count}} }
function computePlacementStats() {
  const overall = {};
  const perChamp = {};
  for (const champKey in state.matchHistory) {
    const games = state.matchHistory[champKey] || [];
    if (!games.length) continue;
    const dist = {};
    for (const g of games) {
      const p = g.placement;
      if (typeof p !== "number") continue;
      overall[p] = (overall[p] || 0) + 1;
      dist[p] = (dist[p] || 0) + 1;
    }
    if (Object.keys(dist).length) perChamp[champKey] = dist;
  }
  return { overall, perChamp };
}

// Gleiche DE/EN-Formatierung wie bereits in showChampTooltip() verwendet
// ("1. Platz" vs. "1st place") - hier zentral wiederverwendet.
function placementLabel(n) {
  return currentLang === "de" ? `${n}. Platz` : `${ordinal(n)} place`;
}

// Gemeinsamer Baustein fuer die Balken-Ansicht (Zusammenfassungs-Kacheln
// 1./2. Platz/Spiele-gesamt + volle Balkenliste aller Platzierungen) -
// wird sowohl fuer die eigene Gesamt-Verteilung als auch fuer die
// Detailansicht eines einzelnen Mitspielers verwendet (siehe
// openTeammateDetail() weiter unten), damit beide optisch identisch sind.
function renderPlacementBarsAndSummary(dist, totalGames) {
  const placements = Object.keys(dist).map(Number).sort((a, b) => a - b);
  const firstCount = dist[1] || 0;
  const secondCount = dist[2] || 0;
  const maxCount = placements.length ? Math.max(...placements.map((p) => dist[p])) : 0;

  let html = `
    <div class="placementStatsSummaryRow">
      <div class="placementStatsSummaryCard win">
        <div class="placementStatsSummaryValue">${firstCount}</div>
        <div class="placementStatsSummaryLabel">${t("placementStatFirst")}</div>
      </div>
      <div class="placementStatsSummaryCard second">
        <div class="placementStatsSummaryValue">${secondCount}</div>
        <div class="placementStatsSummaryLabel">${t("placementStatSecond")}</div>
      </div>
      <div class="placementStatsSummaryCard">
        <div class="placementStatsSummaryValue">${totalGames}</div>
        <div class="placementStatsSummaryLabel">${t("placementStatGames")}</div>
      </div>
    </div>
  `;

  html += `<div class="placementBarList">`;
  for (const p of placements) {
    const count = dist[p];
    const pct = totalGames > 0 ? ((count / totalGames) * 100).toFixed(1) : "0.0";
    const barPct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
    const rowClass = p === 1 ? " placementBarWin" : p === 2 ? " placementBarSecond" : "";
    html += `
      <div class="placementBarRow${rowClass}">
        <span class="placementBarLabel">${placementLabel(p)}</span>
        <div class="placementBarTrack"><div class="placementBarFill" style="width:${barPct}%"></div></div>
        <span class="placementBarCount">${count} (${pct}%)</span>
      </div>
    `;
  }
  html += `</div>`;
  return html;
}

function renderPlacementOverallSection() {
  const section = document.getElementById("placementOverallSection");
  if (!section) return;
  const { overall } = computePlacementStats();
  const placements = Object.keys(overall).map(Number);
  const totalGames = placements.reduce((sum, p) => sum + overall[p], 0);

  if (!placements.length) {
    section.innerHTML = `
      <h3>${t("placementOverallHeading", { games: 0 })}</h3>
      <p class="detailEmpty">${t("placementOverallNone")}</p>
    `;
    return;
  }

  section.innerHTML = `<h3>${t("placementOverallHeading", { games: totalGames })}</h3>`
    + renderPlacementBarsAndSummary(overall, totalGames);
}

function renderPlacementChampList(filterText) {
  const listEl = document.getElementById("placementChampList");
  if (!listEl) return;
  const { perChamp } = computePlacementStats();
  const term = (filterText || "").toLowerCase();

  const rows = Object.keys(perChamp)
    .map((key) => {
      const champ = championByKey[key];
      const name = champ ? champ.name : `#${key}`;
      const dist = perChamp[key];
      const totalGames = Object.values(dist).reduce((a, b) => a + b, 0);
      return { key, champ, name, dist, totalGames };
    })
    .filter((r) => r.name.toLowerCase().includes(term))
    .sort((a, b) => b.totalGames - a.totalGames || a.name.localeCompare(b.name));

  if (!rows.length) {
    listEl.innerHTML = `<p class="detailEmpty">${t("placementPerChampNone")}</p>`;
    return;
  }

  listEl.innerHTML = rows.map((r) => {
    const placements = Object.keys(r.dist).map(Number).sort((a, b) => a - b);
    const breakdown = placements.map((p) => {
      const tagClass = p === 1 ? " placementChampTagWin" : p === 2 ? " placementChampTagSecond" : "";
      return `<span class="placementChampTag${tagClass}">${placementLabel(p)}: ${r.dist[p]}</span>`;
    }).join("");
    const iconHtml = r.champ
      ? `<img src="${r.champ.icon}" alt="${r.name}" />`
      : `<span class="dbIconFallback">${r.name.slice(0, 2).toUpperCase()}</span>`;
    return `
      <div class="placementChampRow">
        <span class="placementChampIcon">${iconHtml}</span>
        <span class="placementChampName">${r.name}</span>
        <span class="placementChampGames">${t("placementGamesShort", { count: r.totalGames })}</span>
        <span class="placementChampBreakdown">${breakdown}</span>
      </div>
    `;
  }).join("");
}

// ---- Mitspieler-Tab: Aggregation ueber ALLE Matches hinweg (unabhaengig
// vom eigenen gespielten Champion) - gruppiert nach Summoner-Name, der
// einzigen in g.teammates verfuegbaren Kennung (siehe syncUser.js/
// showChampTooltip, die dasselbe Feld m.summoner nutzt). Jedes Match
// steckt genau einmal in state.matchHistory (unter dem selbst gespielten
// Champion), daher entsteht beim Durchlaufen aller champKeys keine
// Doppelzaehlung.
// Ab wie vielen gemeinsamen Spielen eine Winrate als aussagekraeftig gilt -
// wird sowohl fuer die "Beste Winrate"-Sortierung als auch fuer den
// Trio-Hover-Tooltip verwendet.
const MIN_TEAMMATE_GAMES_FOR_WINRATE = 3;

function computeTeammateStats() {
  // key: Name in Kleinbuchstaben -> { name, games, placementDist, champCounts, champPlacements }
  // champPlacements[championApiName][placement] = Anzahl - Platzierung des Mitspielers
  // auf genau diesem Champion, wenn er mit einem selbst zusammen gespielt hat (Arena ist
  // Team-basiert, die Platzierung des Matches gilt fuer beide gleichermassen).
  const mates = {};
  for (const champKey in state.matchHistory) {
    const games = state.matchHistory[champKey] || [];
    for (const g of games) {
      if (typeof g.placement !== "number") continue;
      const teammates = g.teammates || [];
      for (let i = 0; i < teammates.length; i++) {
        const m = teammates[i];
        const rawName = m && m.summoner ? String(m.summoner).trim() : "";
        if (!rawName) continue;
        const key = rawName.toLowerCase();
        if (!mates[key]) {
          mates[key] = { key, name: rawName, games: 0, placementDist: {}, champCounts: {}, champPlacements: {}, coMates: {} };
        }
        const entry = mates[key];
        entry.games++;
        entry.placementDist[g.placement] = (entry.placementDist[g.placement] || 0) + 1;
        if (m.champion) {
          entry.champCounts[m.champion] = (entry.champCounts[m.champion] || 0) + 1;
          if (!entry.champPlacements[m.champion]) entry.champPlacements[m.champion] = {};
          entry.champPlacements[m.champion][g.placement] = (entry.champPlacements[m.champion][g.placement] || 0) + 1;
        }

        // Falls in diesem Match noch weitere Teammates dabei waren (echte
        // Trio-Lobby statt normalem 2er-Arena-Team), merken wir uns pro
        // Mitspieler zusaetzlich, mit welchen ANDEREN Mitspielern man in
        // genau diesen Matches zusammen war - fuer den Hover-Tooltip
        // "gemeinsame dritte Mitspieler".
        for (let j = 0; j < teammates.length; j++) {
          if (j === i) continue;
          const m2 = teammates[j];
          const rawName2 = m2 && m2.summoner ? String(m2.summoner).trim() : "";
          if (!rawName2) continue;
          const key2 = rawName2.toLowerCase();
          if (key2 === key) continue;
          if (!entry.coMates[key2]) {
            entry.coMates[key2] = { key: key2, name: rawName2, games: 0, wins: 0 };
          }
          entry.coMates[key2].games++;
          if (g.placement === 1) entry.coMates[key2].wins++;
        }
      }
    }
  }
  return mates;
}

function renderPlacementMateList(filterText, sortMode) {
  const listEl = document.getElementById("placementMateList");
  if (!listEl) return;
  const mates = computeTeammateStats();
  const term = (filterText || "").toLowerCase();
  const mode = sortMode === "wins" ? "wins" : sortMode === "winrate" ? "winrate" : "games";

  // Im Winrate-Modus verzerren Mitspieler mit sehr wenigen gemeinsamen
  // Spielen (z.B. 1 Spiel = 100%) das Ranking. Erst ab
  // MIN_TEAMMATE_GAMES_FOR_WINRATE gemeinsamen Spielen gilt die Quote als
  // aussagekraeftig genug, darunter wird ausgeblendet.
  const rows = Object.values(mates)
    .filter((r) => r.name.toLowerCase().includes(term))
    .filter((r) => {
      if (mode !== "winrate") return true;
      return r.games >= MIN_TEAMMATE_GAMES_FOR_WINRATE;
    })
    .sort((a, b) => {
      if (mode === "wins") {
        const winsA = a.placementDist[1] || 0;
        const winsB = b.placementDist[1] || 0;
        return winsB - winsA || b.games - a.games || a.name.localeCompare(b.name);
      }
      if (mode === "winrate") {
        const winrateA = a.games ? (a.placementDist[1] || 0) / a.games : 0;
        const winrateB = b.games ? (b.placementDist[1] || 0) / b.games : 0;
        return winrateB - winrateA || b.games - a.games || a.name.localeCompare(b.name);
      }
      return b.games - a.games || a.name.localeCompare(b.name);
    });

  if (!rows.length) {
    listEl.innerHTML = `<p class="detailEmpty">${t("placementMatesNone")}</p>`;
    return;
  }

  listEl.innerHTML = rows.map((r) => {
    const placements = Object.keys(r.placementDist).map(Number).sort((a, b) => a - b);
    const breakdown = placements.map((p) => {
      const tagClass = p === 1 ? " placementChampTagWin" : p === 2 ? " placementChampTagSecond" : "";
      return `<span class="placementChampTag${tagClass}">${placementLabel(p)}: ${r.placementDist[p]}</span>`;
    }).join("");

    // Dasselbe Profilicon wie im Ranking (falls der Mitspieler dort als
    // registrierter Nutzer bekannt ist), statt eines Champion-Icons.
    const iconHtml = buildProfileIconImg(r.name);
    const mateKeyAttr = r.key.replace(/"/g, "&quot;");

    // Im Winrate-Sortiermodus zeigen wir zusaetzlich die 1.-Platz-Quote
    // direkt neben der Spieleanzahl, damit der Sortiergrund sichtbar ist.
    const winrateHtml = mode === "winrate"
      ? `<span class="placementChampWinrate">${Math.round(((r.placementDist[1] || 0) / r.games) * 100)}% #1</span>`
      : "";

    return `
      <div class="placementChampRow clickableRow" data-mate-key="${mateKeyAttr}">
        <span class="placementChampIcon">${iconHtml}</span>
        <span class="placementChampName mateNameHoverable">${r.name}</span>
        <span class="placementChampGames">${t("placementGamesShort", { count: r.games })}</span>
        ${winrateHtml}
        <span class="placementChampBreakdown">${breakdown}</span>
      </div>
    `;
  }).join("");

  // key -> Mitspieler-Datensatz, damit der Hover-Tooltip ohne erneute
  // Berechnung direkt auf die schon vorhandenen coMates-Daten zugreifen kann.
  const rowsByKey = new Map(rows.map((r) => [r.key, r]));

  listEl.querySelectorAll(".placementChampRow[data-mate-key]").forEach((rowEl) => {
    rowEl.addEventListener("click", () => openTeammateDetail(rowEl.dataset.mateKey));

    const entry = rowsByKey.get(rowEl.dataset.mateKey);
    const nameEl = rowEl.querySelector(".mateNameHoverable");
    if (nameEl && entry) {
      nameEl.addEventListener("mouseenter", (e) => showMateTrioTooltip(e, entry));
      nameEl.addEventListener("mousemove", positionMateTrioTooltip);
      nameEl.addEventListener("mouseleave", hideMateTrioTooltip);
    }
  });
}

// Zeigt beim Hover ueber einem Mitspieler-Namen, mit welchen ANDEREN
// Mitspielern man in denselben Matches zusammen war (echte Trio-Lobbys),
// gefiltert auf mind. MIN_TEAMMATE_GAMES_FOR_WINRATE gemeinsame Spiele und
// sortiert nach Winrate (1. Platz-Quote) absteigend.
function showMateTrioTooltip(e, entry) {
  const tooltip = document.getElementById("mateTrioTooltip");
  if (!tooltip) return;

  const coMates = Object.values(entry.coMates || {})
    .filter((c) => c.games >= MIN_TEAMMATE_GAMES_FOR_WINRATE)
    .sort((a, b) => {
      const winrateA = a.games ? a.wins / a.games : 0;
      const winrateB = b.games ? b.wins / b.games : 0;
      return winrateB - winrateA || b.games - a.games || a.name.localeCompare(b.name);
    });

  let html = `<div class="tooltipTitle">${t("mateTrioTooltipTitle", { name: entry.name })}</div>`;

  if (!coMates.length) {
    html += `<div class="tooltipEmpty">${t("mateTrioTooltipEmpty")}</div>`;
  } else {
    html += `<ul class="tooltipList">`;
    for (const c of coMates) {
      const winratePct = Math.round((c.wins / c.games) * 100);
      html += `
        <li class="mateTrioRow">
          <span class="mateTrioName">${c.name}</span>
          <span class="mateTrioMeta"><span class="mateTrioWinrate">${winratePct}% #1</span>${t("mateTrioTooltipGames", { count: c.games })}</span>
        </li>
      `;
    }
    html += `</ul>`;
  }

  tooltip.innerHTML = html;
  tooltip.classList.remove("hidden");
  positionMateTrioTooltip(e);
}

function positionMateTrioTooltip(e) {
  const tooltip = document.getElementById("mateTrioTooltip");
  if (!tooltip || tooltip.classList.contains("hidden")) return;
  const offset = 14;
  let x = e.clientX + offset;
  let y = e.clientY + offset;
  const rect = tooltip.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - offset;
  if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - offset;
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

function hideMateTrioTooltip() {
  document.getElementById("mateTrioTooltip")?.classList.add("hidden");
}

// ---- Detailansicht: Klick auf einen Mitspieler zeigt dessen eigene
// Platzierungs-Verteilung (bezogen auf die gemeinsam gespielten Matches -
// mehr Daten ueber den Mitspieler hat die App nicht, da nur der eigene
// Match-Verlauf gesynct wird) im selben Balken-Stil wie der "Platzierungen"-Tab.
function openTeammateDetail(mateKey) {
  const mates = computeTeammateStats();
  const entry = mates[mateKey];
  if (!entry) return;

  document.getElementById("placementMateListView")?.classList.add("hidden");
  document.getElementById("placementMateDetailView")?.classList.remove("hidden");

  const nameEl = document.getElementById("placementMateDetailName");
  if (nameEl) nameEl.textContent = entry.name;

  const iconEl = document.getElementById("placementMateDetailIcon");
  if (iconEl) iconEl.innerHTML = buildProfileIconImg(entry.name);

  const bodyEl = document.getElementById("placementMateDetailBody");
  if (bodyEl) {
    bodyEl.innerHTML = renderPlacementBarsAndSummary(entry.placementDist, entry.games) + `
      <h3 class="placementMateChampHeading">${t("placementMateChampHeading")}</h3>
      <input id="placementMateDetailChampFilter" type="text" placeholder="${t("champSearchPlaceholder")}" />
      <div id="placementMateDetailChampList"></div>
    `;
    const champFilterInput = document.getElementById("placementMateDetailChampFilter");
    champFilterInput?.addEventListener("input", () => {
      renderTeammateChampBreakdown(entry, champFilterInput.value);
    });
    renderTeammateChampBreakdown(entry, "");
  }
}

// Zeigt, auf welchen Champions dieser Mitspieler mit einem zusammen
// gespielt hat, jeweils mit derselben Platzierungs-Aufschluesselung wie
// die Haupt-Champion-Liste im "Platzierungen"-Tab - nur eben bezogen auf
// die gemeinsamen Spiele mit genau diesem Mitspieler.
function renderTeammateChampBreakdown(entry, filterText) {
  const listEl = document.getElementById("placementMateDetailChampList");
  if (!listEl) return;
  const term = (filterText || "").toLowerCase();

  const rows = Object.keys(entry.champPlacements || {})
    .map((apiName) => {
      const champ = championByApiName[apiName];
      const name = champ ? champ.name : apiName;
      const dist = entry.champPlacements[apiName];
      const games = Object.values(dist).reduce((a, b) => a + b, 0);
      return { champ, name, dist, games };
    })
    .filter((r) => r.name.toLowerCase().includes(term))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));

  if (!rows.length) {
    listEl.innerHTML = `<p class="detailEmpty">${t("placementPerChampNone")}</p>`;
    return;
  }

  listEl.innerHTML = rows.map((r) => {
    const placements = Object.keys(r.dist).map(Number).sort((a, b) => a - b);
    const breakdown = placements.map((p) => {
      const tagClass = p === 1 ? " placementChampTagWin" : p === 2 ? " placementChampTagSecond" : "";
      return `<span class="placementChampTag${tagClass}">${placementLabel(p)}: ${r.dist[p]}</span>`;
    }).join("");
    const iconHtml = r.champ
      ? `<img src="${r.champ.icon}" alt="${r.name}" />`
      : `<span class="dbIconFallback">${r.name.slice(0, 2).toUpperCase()}</span>`;
    return `
      <div class="placementChampRow">
        <span class="placementChampIcon">${iconHtml}</span>
        <span class="placementChampName">${r.name}</span>
        <span class="placementChampGames">${t("placementGamesShort", { count: r.games })}</span>
        <span class="placementChampBreakdown">${breakdown}</span>
      </div>
    `;
  }).join("");
}

function closeTeammateDetail() {
  document.getElementById("placementMateDetailView")?.classList.add("hidden");
  document.getElementById("placementMateListView")?.classList.remove("hidden");
}

safeBind("placementMateDetailBack", "onclick", closeTeammateDetail);

// ============================================================
// Spielverlauf-Tab: flache, chronologische Liste ALLER gespeicherten
// Arena-Matches (ueber alle gespielten Champions hinweg), mit Klick auf
// ein Match fuer die volle Detailansicht (Items/Augments/Runen/
// Beschwoererzauber/Mitspieler). Nutzt ausschliesslich Daten, die
// syncUser.js ohnehin schon pro Match speichert - kein neuer Server-Call.
// ============================================================

function flattenAllMatches() {
  const all = [];
  for (const champKey in state.matchHistory) {
    const champ = championByKey[champKey];
    const games = state.matchHistory[champKey] || [];
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      if (typeof g.placement !== "number") continue;
      all.push({ ...g, champKey, champ, historyIndex: i });
    }
  }
  all.sort((a, b) => (b.date || 0) - (a.date || 0));
  return all;
}

// Eindeutiger Schluessel pro Match fuer die Listen/Detail-Navigation -
// matchId ist eigentlich schon eindeutig, aber champKey+historyIndex als
// Fallback falls matchId mal fehlen sollte.
function matchDetailKey(m) {
  return m.matchId || `${m.champKey}::${m.historyIndex}`;
}

// ============================================================
// Eigene Item-/Augment-Statistik (My Stats -> Items / Augments)
// Zaehlt pro Item/Augment, wie oft der Spieler es selbst gespielt und wie
// oft er damit gewonnen (placement === 1) hat - komplett aus den schon
// geladenen matchHistory-Daten berechnet, kein zusaetzlicher Server-Call.
// ============================================================

let iaItemsStatsSortMode = "winrate"; // "winrate" | "games"
let iaAugmentsStatsSortMode = "winrate";
// iaItemsStatsGroupMode/iaAugmentsStatsGroupMode werden jetzt ganz oben bei
// den anderen UI-Prefs deklariert (siehe applyUIPrefs) - hier NICHT nochmal
// mit "let" deklarieren, das wuerde einen doppelten-Deklaration-Fehler geben.

// Winrate wird erst ab dieser Mindestanzahl Spiele als "verlaesslich"
// behandelt - darunter landet der Eintrag beim Winrate-Sortieren trotzdem
// in der Liste, aber ans Ende seiner Kategorie (sonst wuerde ein
// einzelnes 1/1-Spiel mit 100% ganz oben stehen).
const IA_STATS_MIN_GAMES_FOR_WINRATE = 10;

function computeOwnItemAugmentStats() {
  const items = {};
  const augments = {};
  for (const m of flattenAllMatches()) {
    if (typeof m.placement !== "number") continue;
    const win = m.placement === 1;
    // Item 3348 (Standard-Trinket) auch hier ausschliessen - jeder hat es,
    // liefert keine echte Build-Aussage (siehe renderPlacementHistoryList).
    for (const id of (m.items || [])) {
      if (id === 3348) continue;
      if (!items[id]) items[id] = { games: 0, wins: 0 };
      items[id].games++;
      if (win) items[id].wins++;
    }
    for (const id of (m.augments || [])) {
      if (!augments[id]) augments[id] = { games: 0, wins: 0 };
      augments[id].games++;
      if (win) augments[id].wins++;
    }
  }
  return { items, augments };
}

function sortIaStatEntries(entries, mode) {
  return entries.slice().sort((a, b) => {
    if (mode === "winrate") {
      const aQualified = a.games >= IA_STATS_MIN_GAMES_FOR_WINRATE;
      const bQualified = b.games >= IA_STATS_MIN_GAMES_FOR_WINRATE;
      if (aQualified !== bQualified) return aQualified ? -1 : 1;
      const aWr = a.wins / a.games;
      const bWr = b.wins / b.games;
      if (bWr !== aWr) return bWr - aWr;
      return b.games - a.games;
    }
    return b.games - a.games;
  });
}

function renderIaStatTierGroup(entries, tier, sortMode) {
  const tierEntries = entries.filter((e) => e.entry.tier === tier);
  if (!tierEntries.length) return "";
  const sorted = sortIaStatEntries(tierEntries, sortMode);
  const label = t("iaTier" + tier.charAt(0).toUpperCase() + tier.slice(1));
  let html = `<div class="iaTierGroup"><div class="iaTierLabel tier-${tier}">${label} (${tierEntries.length})</div><div class="iaStatsGrid">`;
  for (const e of sorted) {
    const name = iaEntryName(e.entry);
    const winrate = Math.round((e.wins / e.games) * 100);
    const lowSample = e.games < IA_STATS_MIN_GAMES_FOR_WINRATE;
    const wrClass = winrate >= 50 ? "good" : "bad";
    const tooltip = `${name}: ${e.wins}/${e.games} (${winrate}%)`;
    html += `
      <div class="iaStatsTile${lowSample ? " lowSample" : ""}" title="${tooltip}">
        ${e.entry.icon ? `<img src="${e.entry.icon}" alt="${name}" loading="lazy" />` : `<div class="iaStatsTileFallback">${name.slice(0, 3)}</div>`}
        <span class="iaStatsTileGames">${e.games}×</span>
        <span class="iaStatsTileWr ${wrClass}">${winrate}%</span>
      </div>`;
  }
  html += `</div></div>`;
  return html;
}

// Gleiche Kachel-Darstellung wie renderIaStatTierGroup, aber ohne
// Tier-Ueberschrift - fuer die Ansicht mit ausgeschalteter Gruppierung.
// Sortiert dann ueber ALLE Tiers hinweg gemeinsam nach dem Sortiermodus.
function renderIaStatFlatList(entries, sortMode) {
  if (!entries.length) return "";
  const sorted = sortIaStatEntries(entries, sortMode);
  let html = `<div class="iaStatsGrid">`;
  for (const e of sorted) {
    const name = iaEntryName(e.entry);
    const winrate = Math.round((e.wins / e.games) * 100);
    const lowSample = e.games < IA_STATS_MIN_GAMES_FOR_WINRATE;
    const wrClass = winrate >= 50 ? "good" : "bad";
    const tooltip = `${name}: ${e.wins}/${e.games} (${winrate}%)`;
    html += `
      <div class="iaStatsTile${lowSample ? " lowSample" : ""}" title="${tooltip}">
        ${e.entry.icon ? `<img src="${e.entry.icon}" alt="${name}" loading="lazy" />` : `<div class="iaStatsTileFallback">${name.slice(0, 3)}</div>`}
        <span class="iaStatsTileGames">${e.games}×</span>
        <span class="iaStatsTileWr ${wrClass}">${winrate}%</span>
      </div>`;
  }
  html += `</div>`;
  return html;
}

function renderOwnItemStatsTab() {
  const container = document.getElementById("placementItemsStatsList");
  if (!container) return;
  const { items } = computeOwnItemAugmentStats();
  const entries = Object.entries(items)
    .map(([id, s]) => ({ id, entry: iaItemById[id], ...s }))
    .filter((e) => e.entry);
  if (!entries.length) {
    container.innerHTML = `<p class="detailEmpty">${t("iaStatsNone")}</p>`;
    return;
  }
  container.innerHTML = iaItemsStatsGroupMode
    ? IA_ITEM_TIERS.map((tier) => renderIaStatTierGroup(entries, tier, iaItemsStatsSortMode)).join("")
    : renderIaStatFlatList(entries, iaItemsStatsSortMode);
}

function renderOwnAugmentStatsTab() {
  const container = document.getElementById("placementAugmentsStatsList");
  if (!container) return;
  const { augments } = computeOwnItemAugmentStats();
  const entries = Object.entries(augments)
    .map(([id, s]) => ({ id, entry: iaAugmentById[id], ...s }))
    .filter((e) => e.entry);
  if (!entries.length) {
    container.innerHTML = `<p class="detailEmpty">${t("iaStatsNone")}</p>`;
    return;
  }
  container.innerHTML = iaAugmentsStatsGroupMode
    ? IA_AUGMENT_TIERS.map((tier) => renderIaStatTierGroup(entries, tier, iaAugmentsStatsSortMode)).join("")
    : renderIaStatFlatList(entries, iaAugmentsStatsSortMode);
}

async function renderOwnItemStatsTabAsync() {
  await loadArenaItemsAugments();
  renderOwnItemStatsTab();
}

async function renderOwnAugmentStatsTabAsync() {
  await loadArenaItemsAugments();
  renderOwnAugmentStatsTab();
}

// Formatiert groessere Zahlen (Schaden, Gold) sprachabhaengig mit
// Tausendertrennzeichen, z.B. 12345 -> "12.345" (de) / "12,345" (en).
function formatStatNumber(n) {
  return Number(n).toLocaleString(currentLang === "de" ? "de-DE" : "en-US");
}

function resolveItemIcon(itemId) {
  const entry = iaItemById[itemId];
  if (entry) return { icon: entry.icon, name: iaEntryName(entry) };
  return {
    icon: ddragonVersion ? `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${itemId}.png` : null,
    name: `#${itemId}`
  };
}

function resolveAugmentIcon(augId) {
  const entry = iaAugmentById[augId];
  if (entry) return { icon: entry.icon, name: iaEntryName(entry), tier: entry.tier };
  return { icon: null, name: `#${augId}`, tier: null };
}

function resolveSummonerSpellIcon(spellId) {
  const entry = summonerSpellByKey[String(spellId)];
  if (entry) return entry;
  return { icon: null, name: `#${spellId}` };
}

function resolveRuneIcon(perkId) {
  const entry = runeById[perkId];
  if (entry) return entry;
  return { icon: null, name: `#${perkId}` };
}

async function renderPlacementHistoryList(filterText) {
  const listEl = document.getElementById("placementHistoryList");
  if (!listEl) return;
  const term = (filterText || "").toLowerCase();

  const matches = flattenAllMatches().filter((m) => {
    const champName = m.champ ? m.champ.name.toLowerCase() : "";
    return !term || champName.includes(term);
  });

  if (!matches.length) {
    listEl.innerHTML = `<p class="detailEmpty">${t("placementHistoryNone")}</p>`;
    return;
  }

  // Augment-Icons/Namen kommen aus der Arena-Items&Augments-DB - muss vor
  // dem Rendern geladen sein, sonst zeigen alle Augments hier faelschlich
  // nur den Zahlen-Fallback (siehe resolveAugmentIcon), auch wenn sie in
  // der DB eigentlich vorhanden waeren.
  await loadArenaItemsAugments();

  listEl.innerHTML = matches.map((m) => {
    const isWin = m.placement === 1;
    const tagClass = m.placement === 1 ? " placementChampTagWin" : m.placement === 2 ? " placementChampTagSecond" : "";
    const champIconHtml = m.champ
      ? `<img src="${m.champ.icon}" alt="${m.champ.name}" />`
      : `<span class="dbIconFallback">${String(m.champKey).slice(0, 2)}</span>`;
    const dateStr = formatDateDDMMYYYY(m.date);
    const mateNames = (m.teammates || []).map((tm) => tm.summoner).filter(Boolean);

    // NEU: kompakte Vorschau direkt in der Liste (K/D/A + Items), aehnlich
    // dem League-Client-Spielverlauf - spart bei vielen Matches den Klick
    // in die Detailansicht, nur um die grobe Runde einzuschaetzen. Nur
    // vorhanden bei Matches, die schon Stats haben (siehe syncUser.js).
    const hasStats = typeof m.kills === "number";
    const kdaHtml = hasStats
      ? `<span class="matchHistoryKda">${m.kills}/${m.deaths}/${m.assists}</span>`
      : "";

    // Item 3348 ("Ozanes Beharrlichkeit"/Standard-Trinket) wird nicht in
    // der Vorschau angezeigt - kein echter Build-Slot, jeder Spieler hat es.
    // Items als 3-spaltiges Grid (wie im League-Client) statt einer langen
    // Reihe - Augments stehen in einem eigenen Grid daneben, durch eine
    // Trennlinie klar von den Items abgesetzt (statt vorher alles vermischt
    // in einer einzigen Reihe).
    const visibleItems = (m.items || []).filter((id) => id !== 3348);
    const itemsGridHtml = visibleItems.length
      ? `<div class="matchHistoryItemsGrid">${visibleItems.map((id) => {
          const r = resolveItemIcon(id);
          return r.icon
            ? `<img class="matchHistoryItemIcon" src="${r.icon}" alt="${r.name}" title="${r.name}" />`
            : `<span class="matchHistoryItemIcon matchHistoryItemIconFallback" title="${r.name}"></span>`;
        }).join("")}</div>`
      : "";

    const augmentsGridHtml = (m.augments || []).length
      ? `<div class="matchHistoryAugmentsGrid">${m.augments.map((id) => {
          const r = resolveAugmentIcon(id);
          const tierClass = r.tier ? ` tier-${r.tier}` : "";
          return r.icon
            ? `<img class="matchHistoryItemIcon${tierClass}" src="${r.icon}" alt="${r.name}" title="${r.name}" />`
            : `<span class="matchHistoryItemIcon matchHistoryItemIconFallback${tierClass}" title="${r.name}"></span>`;
        }).join("")}</div>`
      : "";

    // Mitspieler-Namen stehen jetzt direkt neben Items/Augments statt in
    // einer eigenen Zeile darunter - spart Hoehe, macht die Karte
    // kompakter. Champion-Name entfaellt (steht bereits im Icon-Tooltip).
    // Jeder Name in eigener Zeile (statt mit Komma aneinandergereiht),
    // damit bei laengeren Namen alle lesbar bleiben statt abgeschnitten
    // zu werden.
    const matesHtml = mateNames.length
      ? `<span class="matchHistoryMates">${mateNames.map((n) => `<span class="matchHistoryMateName" title="${n}">${n}</span>`).join("")}</span>`
      : "";
    const loadoutHtml = (itemsGridHtml || augmentsGridHtml || matesHtml)
      ? `<div class="matchHistoryLoadout">${itemsGridHtml}${itemsGridHtml && augmentsGridHtml ? '<span class="matchHistoryLoadoutDivider"></span>' : ""}${augmentsGridHtml}${matesHtml}</div>`
      : "";

    return `
      <div class="matchHistoryRow clickableRow" data-match-key="${matchDetailKey(m)}" title="${m.champ ? m.champ.name : "?"}">
        <span class="placementChampIcon matchHistoryChampIconLg">${champIconHtml}</span>
        <div class="matchHistoryInfo">
          <div class="matchHistoryLine1">
            <span class="placementChampTag${tagClass}">${placementLabel(m.placement)}</span>
            <span class="matchHistoryDate">${dateStr}</span>
          </div>
          ${kdaHtml}
          ${loadoutHtml}
        </div>
      </div>
    `;
  }).join("");

  const byKey = new Map(matches.map((m) => [matchDetailKey(m), m]));
  listEl.querySelectorAll(".matchHistoryRow[data-match-key]").forEach((rowEl) => {
    rowEl.addEventListener("click", () => {
      const m = byKey.get(rowEl.dataset.matchKey);
      if (m) openMatchDetail(m);
    });
  });
}

async function openMatchDetail(m) {
  // Der Spielverlauf lebt jetzt permanent auf der Hauptseite (kein eigener
  // Tab mehr im "Meine Statistiken"-Fenster) - beim Klick auf ein Match
  // oeffnen wir das Fenster direkt in der Detail-Ansicht, ohne Tab-Leiste,
  // und ohne die (nicht mehr existierende) Listen-Unteransicht.
  const overlay = document.getElementById("placementStatsOverlay");
  if (overlay) overlay.classList.remove("hidden");
  document.getElementById("placementStatsTabBar")?.classList.add("hidden");
  document.getElementById("placementPanelPlacements")?.classList.add("hidden");
  document.getElementById("placementPanelMates")?.classList.add("hidden");
  document.getElementById("placementPanelHistory")?.classList.remove("hidden");
  document.getElementById("placementHistoryDetailView")?.classList.remove("hidden");

  const iconEl = document.getElementById("matchDetailIcon");
  if (iconEl) {
    iconEl.innerHTML = m.champ
      ? `<img src="${m.champ.icon}" alt="${m.champ.name}" />`
      : "";
  }
  const dateStr = formatDateTimeDDMMYYYY(m.date);
  const titleEl = document.getElementById("matchDetailTitle");
  if (titleEl) titleEl.textContent = `${m.champ ? m.champ.name : "?"} - ${placementLabel(m.placement)}`;

  const bodyEl = document.getElementById("matchDetailBody");
  if (!bodyEl) return;
  bodyEl.innerHTML = `<p class="detailEmpty">${t("matchDetailLoading")}</p>`;

  // Runen/Beschwoererzauber-Icons sowie die Augment/Item-Datenbank werden
  // erst bei Bedarf geladen (kein unnoetiger Request beim App-Start).
  await Promise.all([loadArenaItemsAugments(), loadSummonerSpellData(), loadRuneData()]);

  const teammatesHtml = (m.teammates || []).length
    ? m.teammates.map((tm) => {
        const champData = championByApiName[tm.champion];
        const icon = champData
          ? `<img src="${champData.icon}" alt="${champData.name}" />`
          : "";
        return `<span class="tooltipMate matchDetailMate">${icon}${tm.summoner || "?"}</span>`;
      }).join("")
    : `<p class="detailEmpty">${t("matchDetailNoTeammates")}</p>`;

  // Item 3348 auch in der Detailansicht ausblenden (siehe Kommentar bei
  // visibleItems in renderPlacementHistoryList).
  const visibleDetailItems = (m.items || []).filter((id) => id !== 3348);
  const itemsHtml = visibleDetailItems.length
    ? visibleDetailItems.map((id) => {
        const r = resolveItemIcon(id);
        return r.icon
          ? `<div class="matchDetailIaTile" title="${r.name}"><img src="${r.icon}" alt="${r.name}" /></div>`
          : `<div class="matchDetailIaTile fallback" title="${r.name}">${r.name.slice(0, 3)}</div>`;
      }).join("")
    : `<p class="detailEmpty">${t("matchDetailNoItems")}</p>`;

  const augmentsHtml = (m.augments || []).length
    ? m.augments.map((id) => {
        const r = resolveAugmentIcon(id);
        const tierClass = r.tier ? ` tier-${r.tier}` : "";
        return r.icon
          ? `<div class="matchDetailIaTile${tierClass}" title="${r.name}"><img src="${r.icon}" alt="${r.name}" /></div>`
          : `<div class="matchDetailIaTile fallback${tierClass}" title="${r.name}">${r.name.slice(0, 3)}</div>`;
      }).join("")
    : `<p class="detailEmpty">${t("matchDetailNoAugments")}</p>`;

  const perksHtml = (m.perks || []).length
    ? m.perks.map((id) => {
        const r = resolveRuneIcon(id);
        return r.icon
          ? `<div class="matchDetailIaTile" title="${r.name}"><img src="${r.icon}" alt="${r.name}" /></div>`
          : `<div class="matchDetailIaTile fallback" title="${r.name}">${r.name.slice(0, 3)}</div>`;
      }).join("")
    : `<p class="detailEmpty">${t("matchDetailNoPerks")}</p>`;

  const spellsHtml = (m.summonerSpells || []).length
    ? m.summonerSpells.map((id) => {
        const r = resolveSummonerSpellIcon(id);
        return r.icon
          ? `<div class="matchDetailIaTile" title="${r.name}"><img src="${r.icon}" alt="${r.name}" /></div>`
          : `<div class="matchDetailIaTile fallback" title="${r.name}">${r.name.slice(0, 3)}</div>`;
      }).join("")
    : `<p class="detailEmpty">${t("matchDetailNoSpells")}</p>`;

  // Kampf-Statistiken (K/D/A, Level, Gold, Schaden) - nur vorhanden bei
  // Matches, die nach der syncUser.js-Erweiterung (bzw. nach dem Backfill)
  // synct wurden. Aeltere Eintraege haben diese Felder gar nicht -> Hinweis
  // statt leerer/falscher Werte.
  const hasStats = typeof m.kills === "number" || typeof m.deaths === "number" || typeof m.assists === "number";
  const statCards = [];
  if (hasStats) {
    statCards.push(`
      <div class="matchDetailStatCard">
        <div class="matchDetailStatValue">${m.kills ?? 0}/${m.deaths ?? 0}/${m.assists ?? 0}</div>
        <div class="matchDetailStatLabel">${t("matchDetailKda")}</div>
      </div>
    `);
    if (typeof m.champLevel === "number") {
      statCards.push(`
        <div class="matchDetailStatCard">
          <div class="matchDetailStatValue">${m.champLevel}</div>
          <div class="matchDetailStatLabel">${t("matchDetailLevel")}</div>
        </div>
      `);
    }
    if (typeof m.goldEarned === "number") {
      statCards.push(`
        <div class="matchDetailStatCard">
          <div class="matchDetailStatValue">${formatStatNumber(m.goldEarned)}</div>
          <div class="matchDetailStatLabel">${t("matchDetailGold")}</div>
        </div>
      `);
    }
    if (typeof m.damageDealt === "number") {
      statCards.push(`
        <div class="matchDetailStatCard">
          <div class="matchDetailStatValue">${formatStatNumber(m.damageDealt)}</div>
          <div class="matchDetailStatLabel">${t("matchDetailDamageDealt")}</div>
        </div>
      `);
    }
    if (typeof m.damageTaken === "number") {
      statCards.push(`
        <div class="matchDetailStatCard">
          <div class="matchDetailStatValue">${formatStatNumber(m.damageTaken)}</div>
          <div class="matchDetailStatLabel">${t("matchDetailDamageTaken")}</div>
        </div>
      `);
    }
    if (typeof m.healingDone === "number") {
      statCards.push(`
        <div class="matchDetailStatCard">
          <div class="matchDetailStatValue">${formatStatNumber(m.healingDone)}</div>
          <div class="matchDetailStatLabel">${t("matchDetailHealing")}</div>
        </div>
      `);
    }
    if (typeof m.shieldingDone === "number") {
      statCards.push(`
        <div class="matchDetailStatCard">
          <div class="matchDetailStatValue">${formatStatNumber(m.shieldingDone)}</div>
          <div class="matchDetailStatLabel">${t("matchDetailShielding")}</div>
        </div>
      `);
    }
  }
  const statsHtml = hasStats
    ? `<div class="matchDetailStatsGrid">${statCards.join("")}</div>`
    : `<p class="detailEmpty">${t("matchDetailNoStats")}</p>`;

  bodyEl.innerHTML = `
    <p class="matchDetailDate">${dateStr}</p>
    <div class="detailSection">
      <h3>${t("matchDetailStatsHeading")}</h3>
      ${statsHtml}
    </div>
    <div class="detailSection">
      <h3>${t("matchDetailTeammatesHeading")}</h3>
      <div class="matchDetailMatesRow">${teammatesHtml}</div>
    </div>
    <div class="detailSection">
      <h3>${t("matchDetailSpellsHeading")}</h3>
      <div class="matchDetailIaGrid">${spellsHtml}</div>
    </div>
    <div class="detailSection">
      <h3>${t("matchDetailItemsHeading")}</h3>
      <div class="matchDetailIaGrid">${itemsHtml}</div>
    </div>
    <div class="detailSection">
      <h3>${t("matchDetailAugmentsHeading")}</h3>
      <div class="matchDetailIaGrid">${augmentsHtml}</div>
    </div>
    <div class="detailSection">
      <h3>${t("matchDetailPerksHeading")}</h3>
      <div class="matchDetailIaGrid">${perksHtml}</div>
    </div>
    <p class="matchDetailMatchId">${t("matchDetailMatchIdLabel")}: ${m.matchId || "-"}</p>
  `;
}

// Der Spielverlauf ist kein Tab im "Meine Statistiken"-Fenster mehr,
// sondern eine permanente Section auf der Hauptseite (ersetzt dort die
// vorherigen Meta-Trios). Der "Zurueck"-Pfeil in der Match-Detailansicht
// schliesst deshalb jetzt das ganze Fenster, statt zurueck zu einer
// (nicht mehr existierenden) Verlaufsliste im Fenster zu wechseln - die
// Liste ist ja im Hintergrund auf der Hauptseite ohnehin schon sichtbar.
function closeMatchDetail() {
  closePlacementStatsModal();
}

safeBind("placementHistoryDetailBack", "onclick", closeMatchDetail);

function switchPlacementStatsTab(tab) {
  const btnPlacements = document.getElementById("placementTabBtnPlacements");
  const btnMates = document.getElementById("placementTabBtnMates");
  const btnItems = document.getElementById("placementTabBtnItems");
  const btnAugments = document.getElementById("placementTabBtnAugments");
  const panelPlacements = document.getElementById("placementPanelPlacements");
  const panelMates = document.getElementById("placementPanelMates");
  const panelItems = document.getElementById("placementPanelItems");
  const panelAugments = document.getElementById("placementPanelAugments");
  const isMates = tab === "mates";
  const isItems = tab === "items";
  const isAugments = tab === "augments";
  const isPlacements = !isMates && !isItems && !isAugments;
  btnPlacements?.classList.toggle("active", isPlacements);
  btnMates?.classList.toggle("active", isMates);
  btnItems?.classList.toggle("active", isItems);
  btnAugments?.classList.toggle("active", isAugments);
  panelPlacements?.classList.toggle("hidden", !isPlacements);
  panelMates?.classList.toggle("hidden", !isMates);
  panelItems?.classList.toggle("hidden", !isItems);
  panelAugments?.classList.toggle("hidden", !isAugments);
  // Match-Detail-Panel (falls gerade offen) und Tab-Leiste wieder in den
  // Normalzustand bringen, wenn regulaer zwischen den Tabs gewechselt wird.
  document.getElementById("placementPanelHistory")?.classList.add("hidden");
  document.getElementById("placementStatsTabBar")?.classList.remove("hidden");
  if (isMates) {
    closeTeammateDetail();
    const filterInput = document.getElementById("placementMateFilter");
    const sortSelect = document.getElementById("placementMateSort");
    renderPlacementMateList(filterInput ? filterInput.value : "", sortSelect ? sortSelect.value : "games");
  } else if (isItems) {
    renderOwnItemStatsTabAsync();
  } else if (isAugments) {
    renderOwnAugmentStatsTabAsync();
  } else {
    renderPlacementOverallSection();
    const filterInput = document.getElementById("placementChampFilter");
    renderPlacementChampList(filterInput ? filterInput.value : "");
  }
}

// Re-rendert nur den aktuell sichtbaren Tab - genutzt bei Sprachwechsel,
// damit nicht unnoetig alle Tabs neu berechnet werden muessen.
function renderPlacementStatsModal() {
  const matesActive = document.getElementById("placementTabBtnMates")?.classList.contains("active");
  const itemsActive = document.getElementById("placementTabBtnItems")?.classList.contains("active");
  const augmentsActive = document.getElementById("placementTabBtnAugments")?.classList.contains("active");
  switchPlacementStatsTab(matesActive ? "mates" : itemsActive ? "items" : augmentsActive ? "augments" : "placements");
}

function openPlacementStatsModal() {
  const overlay = document.getElementById("placementStatsOverlay");
  if (!overlay) return;
  const champFilterInput = document.getElementById("placementChampFilter");
  if (champFilterInput) champFilterInput.value = "";
  const mateFilterInput = document.getElementById("placementMateFilter");
  if (mateFilterInput) mateFilterInput.value = "";
  const mateSortSelect = document.getElementById("placementMateSort");
  if (mateSortSelect) mateSortSelect.value = "games";
  overlay.classList.remove("hidden");
  switchPlacementStatsTab("placements");
}

function closePlacementStatsModal() {
  document.getElementById("placementStatsOverlay")?.classList.add("hidden");
}

safeBind("placementStatsBtn", "onclick", openPlacementStatsModal);
safeBind("placementStatsClose", "onclick", closePlacementStatsModal);
safeBind("placementTabBtnPlacements", "onclick", () => switchPlacementStatsTab("placements"));
safeBind("placementTabBtnMates", "onclick", () => switchPlacementStatsTab("mates"));
safeBind("placementTabBtnItems", "onclick", () => switchPlacementStatsTab("items"));
safeBind("placementTabBtnAugments", "onclick", () => switchPlacementStatsTab("augments"));
safeBind("iaItemsStatsSort", "onchange", () => {
  const sel = document.getElementById("iaItemsStatsSort");
  iaItemsStatsSortMode = sel ? sel.value : "winrate";
  renderOwnItemStatsTab();
});
safeBind("iaAugmentsStatsSort", "onchange", () => {
  const sel = document.getElementById("iaAugmentsStatsSort");
  iaAugmentsStatsSortMode = sel ? sel.value : "winrate";
  renderOwnAugmentStatsTab();
});
safeBind("iaItemsStatsGroupToggle", "onchange", () => {
  const cb = document.getElementById("iaItemsStatsGroupToggle");
  iaItemsStatsGroupMode = cb ? cb.checked : true;
  persistUIPrefs();
  renderOwnItemStatsTab();
});
safeBind("iaAugmentsStatsGroupToggle", "onchange", () => {
  const cb = document.getElementById("iaAugmentsStatsGroupToggle");
  iaAugmentsStatsGroupMode = cb ? cb.checked : true;
  persistUIPrefs();
  renderOwnAugmentStatsTab();
});
safeBind("placementChampFilter", "oninput", () => {
  const filterInput = document.getElementById("placementChampFilter");
  renderPlacementChampList(filterInput ? filterInput.value : "");
});
safeBind("placementMateFilter", "oninput", () => {
  const filterInput = document.getElementById("placementMateFilter");
  const sortSelect = document.getElementById("placementMateSort");
  renderPlacementMateList(filterInput ? filterInput.value : "", sortSelect ? sortSelect.value : "games");
});
safeBind("placementMateSort", "onchange", () => {
  const filterInput = document.getElementById("placementMateFilter");
  const sortSelect = document.getElementById("placementMateSort");
  renderPlacementMateList(filterInput ? filterInput.value : "", sortSelect ? sortSelect.value : "games");
});
safeBind("placementHistoryFilter", "oninput", () => {
  const filterInput = document.getElementById("placementHistoryFilter");
  renderPlacementHistoryList(filterInput ? filterInput.value : "");
});

// ---------- Start ----------

(async function init() {
  setStatus(t("statusLoadingChampList"));
  await loadChampionList();
  await loadCommunityTierMap();
  renderGrid();
  loadMetaData();
  // Meta-Trios-Section (extern) entfernt - an ihrer Stelle steht jetzt der
  // permanente Spielverlauf; einmal leer initialisieren, applyStats()
  // befuellt ihn dann sobald die Server-Daten da sind.
  renderPlacementHistoryList();
  ensureRankingLoaded();

  if (state.riotId && state.serverUrl) {
    await registerAndLoad();
    loadFriends();
  } else {
    setStatus(t("statusReadyFillSettings"));
    document.getElementById("settingsPanel").classList.remove("hidden");
  }
})();
