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

// ============================================================
// Monetarisierung Stufe A: Overwolf-Ads
// (Ko-fi-Spendenlink erstmal wieder ausgebaut - siehe Git-Historie
// falls spaeter doch gewuenscht.)
// ============================================================

// ---------- Overwolf Ads SDK ----------
// onAdsSDKReady/onAdsSDKNotLoaded werden direkt vom <script>-Tag im
// <head> (onload/onerror) aufgerufen, MUESSEN deshalb globale Funktionen
// sein (kein "const" / keine IIFE). Im normalen Browser (kein
// window.overwolf) wird absichtlich gar kein Ad-Objekt erzeugt - dort
// gibt es ohnehin keine Overwolf-Ads, und der leere #adZone-Container
// wird per CSS (:has) automatisch ausgeblendet.
function onAdsSDKReady() {
  if (typeof window.overwolf === "undefined") {
    return; // laeuft als normale Webseite, nicht in der Overwolf-App
  }
  const container = document.getElementById("ad-div");
  if (!container || typeof OwAd === "undefined") return;
  try {
    // Erzeugt KEINE sichtbare Werbung, solange Overwolf den App-Account
    // nicht fuer Ads freigeschaltet hat (siehe Kommentar im <head>) -
    // bis dahin bleibt der Container leer und unsichtbar.
    window.owAd = new OwAd(container, { size: { width: 300, height: 250 } });
  } catch (err) {
    console.warn("[Ads] Overwolf-Ad konnte nicht initialisiert werden:", err.message);
  }
}
function onAdsSDKNotLoaded() {
  console.warn("[Ads] Overwolf Ads SDK konnte nicht geladen werden (kein Problem im normalen Browser).");
}

// ---------- Secret-System entfernt ----------
// Frueher hier: x-cron-secret-Header-Logik. Entfernt, weil die App nur
// fuer dich + Freunde gedacht ist und das Secret im Browser ohnehin
// sichtbar war - kein echter Schutz, nur Reibung. authFetch bleibt als
// Name erhalten (an allen Call-Sites im Code), ruft aber direkt fetch()
// auf, damit nicht jede einzelne Stelle umbenannt werden muss.
async function authFetch(url, options = {}) {
  return fetch(url, options);
}

// ---------- NEU: UI-Prefs persistieren ----------
const UI_PREFS_KEY = "arenaWinTrackerUIPrefs";

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
  if (prefs.filterText && filterInput) filterInput.value = prefs.filterText;
  if (prefs.sortMode && sortMode) sortMode.value = prefs.sortMode;
  if (typeof prefs.onlyMissing === "boolean" && onlyMissing) {
    onlyMissing.checked = prefs.onlyMissing;
  }
}

function persistUIPrefs() {
  const filterInput = document.getElementById("filterInput");
  const sortMode = document.getElementById("sortMode");
  const onlyMissing = document.getElementById("onlyMissing");
  saveUIPrefs({
    filterText: filterInput?.value || "",
    sortMode: sortMode?.value || "name",
    onlyMissing: !!onlyMissing?.checked
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
    communityAiWeakness: "Schwäche-Hinweis"
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
    communityAiWeakness: "Weakness note"
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
  document.getElementById("langToggle").textContent = currentLang === "de" ? "EN" : "DE";
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

safeBind("langToggle", "onclick", () => {
  currentLang = currentLang === "de" ? "en" : "de";
  localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  applyStaticTranslations();
  renderGrid();
  if (metaData) renderMeta(metaData);
  renderTop30TrioSection();
  renderExternalTrioSection();
  if (currentDetailChamp && !document.getElementById("champDetail").classList.contains("hidden")) {
    openChampDetail(currentDetailChamp);
  }
  if (lastFriendsList) renderFriendsList(lastFriendsList);
  if (rankingLoadedOnce) {
    loadRanking(currentRankingMode);
  }
  if (viewedPlayerStats) renderPlayerViewGrid();
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
        const extTrio = document.getElementById("externalTrio");
        if (extTrio) extTrio.classList.remove("hidden");
        const rp = document.getElementById("rankingPanel");
        if (rp) rp.classList.remove("hidden");
        break;
      }
      const playerView = document.getElementById("playerViewOverlay");
      if (playerView && !playerView.classList.contains("hidden")) {
        playerView.classList.add("hidden");
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
// NEU: Cache in localStorage, schluesselt sich am DDragon-Patch-Stand.
// versions.json wird weiterhin bei jedem Start abgefragt (sehr klein,
// nur ein paar hundert Bytes), aber champion.json (~150-300 KB) wird
// nur dann neu geladen, wenn sich die Patch-Version seit dem letzten
// Besuch tatsaechlich geaendert hat - ansonsten kommt die Liste direkt
// aus dem Cache, ohne Netzwerk-Request.
const DDRAGON_CACHE_KEY = "awt_ddragon_champions_cache";

function readDdragonCache() {
  try {
    const raw = localStorage.getItem(DDRAGON_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDdragonCache(version, championList) {
  try {
    localStorage.setItem(
      DDRAGON_CACHE_KEY,
      JSON.stringify({ version, championList })
    );
  } catch {
    // localStorage kann z.B. im Inkognito-Modus voll/gesperrt sein -
    // dann faellt die App einfach auf "jedes Mal neu laden" zurueck.
  }
}

function applyChampionList(list) {
  championList = list;
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

async function loadChampionList() {
  const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  const versions = await versionsRes.json();
  const latest = versions[0];
  ddragonVersion = latest;

  const cached = readDdragonCache();
  if (cached && cached.version === latest && Array.isArray(cached.championList) && cached.championList.length > 0) {
    applyChampionList(cached.championList);
    return;
  }

  const champRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${latest}/data/de_DE/champion.json`
  );
  const champData = await champRes.json();

  const list = Object.values(champData.data)
    .map((c) => ({
      key: c.key,
      id: c.id,
      name: c.name,
      icon: `https://ddragon.leagueoflegends.com/cdn/${latest}/img/champion/${c.image.full}`
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  applyChampionList(list);
  writeDdragonCache(latest, list);
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
    <img src="${champ.icon}" alt="${champ.name}" loading="lazy" />
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
          ? `<img src="${champ.icon}" alt="${n}" class="trioChampIcon" loading="lazy" />`
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

// ---- Meta-Trios (separate Sammlung, getrennt von den eigenen
// gespielten Trios oben). Eigene Collection "externalTrioMeta" im
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
          ? `<img src="${champ.icon}" alt="${n}" class="trioChampIcon" loading="lazy" />`
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
    ? `<img src="${candidates[0]}" alt="${safeName}" data-candidates='${JSON.stringify(candidates).replace(/'/g, "&#39;")}' data-icon-index="0" loading="lazy" />`
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
    const panel = section.querySelector(`[data-augpanel-list="${tab.key}"]`);
    if (panel) bindAiTagTooltips(panel, ".dbIconRow", list);
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
  if (itemList && build.itemNamesFromIntro) bindAiTagTooltips(itemList, ".dbIconRow", build.itemNamesFromIntro);

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
    const res = await authFetch(serverUrl(`/community-meta/${champ.key}`));
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
    if (list) bindAiTagTooltips(list, ".dbIconRow", data.recommendedAugments);
  }
}

async function loadCommunityAiSection(champ) {
  const section = document.getElementById("communityAiSection");
  if (!section) return;
  try {
    const res = await authFetch(serverUrl(`/community-meta-ai/${champ.key}`));
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
      `<img src="${candidates[0]}" alt="${safeName}" data-candidates='${JSON.stringify(candidates).replace(/'/g, "&#39;")}' loading="lazy" />` +
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
  document.getElementById("externalTrio").classList.add("hidden");
  document.getElementById("rankingPanel").classList.add("hidden");
  const detail = document.getElementById("champDetail");
  detail.classList.remove("hidden");

  detail.innerHTML = `
    <div class="detailHeader">
      <button class="backArrowBtn" id="champDetailBackBtn" title="${t("backToGridTitle")}">${t("backArrow")}</button>
      <img src="${champ.icon}" alt="${champ.name}" />
      <h2>${champ.name}</h2>
    </div>
    ${renderCommunityDbPlaceholder()}
    ${renderCommunityAiPlaceholder()}
  `;

  document.getElementById("champDetailBackBtn").addEventListener("click", closeChampDetail);
  detail.querySelectorAll(".clickableTag").forEach((li) => {
    li.addEventListener("click", () => openItemOrAugmentDetail(li.dataset.name, li.dataset.type));
  });
  loadCommunityDbSection(champ);
  loadCommunityAiSection(champ);
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
  document.getElementById("externalTrio").classList.remove("hidden");
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
      ? `<img src="${profileIconUrl}" alt="${entry.riotId}" loading="lazy" onerror="this.onerror=null;this.src='${fallbackIconUrl}';" />`
      : "";
    const opggLink = opggUrl
      ? `<a class="opggLink" href="${opggUrl}" target="_blank" rel="noopener noreferrer" title="${t("opggOpenTitle")}">${iconImg}</a>`
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
        ? `<img src="${champ.icon}" alt="${champ.name}" title="${champ.name}" class="rankBestChampIcon" loading="lazy" />`
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
      <img src="${champ.icon}" alt="${champ.name}" loading="lazy" />
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
  await loadCommunityTierMap();
  renderGrid();
  loadMetaData();
  loadExternalTrioMeta();
  ensureRankingLoaded();

  if (state.riotId && state.serverUrl) {
    await registerAndLoad();
    loadFriends();
  } else {
    setStatus(t("statusReadyFillSettings"));
    document.getElementById("settingsPanel").classList.remove("hidden");
  }
})();
