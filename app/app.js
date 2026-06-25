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
const DEFAULT_SERVER_URL = "https://arena-win-tracker-server.onrender.com";

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
let isSyncing = false;

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
    syncSecret: "",
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

document.getElementById("riotId").value = state.riotId;
document.getElementById("region").value = state.region;
document.getElementById("serverUrl").value = state.serverUrl;
document.getElementById("syncSecret").value = state.syncSecret;
document.getElementById("seasonStart").value = state.seasonStart;

document.getElementById("settingsToggle").onclick = () => {
  document.getElementById("settingsPanel").classList.toggle("hidden");
};

document.getElementById("friendsToggle").onclick = () => {
  document.getElementById("friendsPanel").classList.toggle("hidden");
};

document.getElementById("saveSettings").onclick = async () => {
  state.riotId = document.getElementById("riotId").value.trim();
  state.region = document.getElementById("region").value;
  state.serverUrl = document.getElementById("serverUrl").value.trim().replace(/\/$/, "");
  state.syncSecret = document.getElementById("syncSecret").value.trim();
  state.seasonStart = document.getElementById("seasonStart").value;
  saveState();
  document.getElementById("settingsPanel").classList.add("hidden");
  await registerAndLoad();
  loadMetaData();
  loadFriends();
};

document.getElementById("resetData").onclick = () => {
  if (!confirm("Lokal angezeigte Daten wirklich zurücksetzen? (Auf dem Server bleiben sie erhalten)")) return;
  state.wins = {};
  state.winCounts = {};
  state.matchHistory = {};
  state.lastSync = null;
  saveState();
  renderGrid();
  setStatus("Lokale Anzeige zurückgesetzt. Mit 'Jetzt syncen' neu laden.");
};

document.getElementById("syncBtn").onclick = () => triggerSync();
document.getElementById("filterInput").oninput = renderGrid;
document.getElementById("onlyMissing").onchange = renderGrid;

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
    throw new Error(data.error || `Registrierung fehlgeschlagen (${res.status})`);
  }
  return res.json();
}

// Holt die zuletzt gesyncten Stats vom Server (kein Riot-Aufruf hier,
// nur ein Datenbank-Abruf - entsprechend schnell).
async function fetchStatsFromServer() {
  const encodedId = encodeURIComponent(state.riotId);
  const res = await fetch(serverUrl(`/stats/${encodedId}`));
  if (res.status === 404) {
    throw new Error("Noch nicht registriert. Erst Einstellungen speichern.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Stats-Abruf fehlgeschlagen (${res.status})`);
  }
  return res.json();
}

// Stoesst einen sofortigen Sync fuer die eigene Riot-ID an, statt auf
// den naechsten taeglichen Cron-Lauf zu warten.
async function triggerSyncOnServer() {
  const encodedId = encodeURIComponent(state.riotId);
  const res = await fetch(serverUrl(`/sync/${encodedId}`), {
    method: "POST",
    headers: { "x-cron-secret": state.syncSecret }
  });
  if (res.status === 401) {
    throw new Error("Sync-Secret falsch oder fehlt. Bitte in den Einstellungen prüfen.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Sync fehlgeschlagen (${res.status})`);
  }
  return res.json();
}

// ---------- Ablauf: Registrieren + Laden ----------

async function registerAndLoad() {
  if (!state.riotId || !state.serverUrl) {
    setStatus("Bitte Riot-ID und Server-URL eintragen.");
    document.getElementById("settingsPanel").classList.remove("hidden");
    return;
  }
  try {
    setStatus("Verbinde mit Server (kann beim ersten Mal bis zu 60s dauern)...");
    await registerWithServer();
    setStatus("Lade Stats vom Server...");
    const stats = await fetchStatsFromServer();
    applyStats(stats);
    setStatus(`Verbunden. Letzter Server-Sync: ${formatLastSync(stats.lastSync)}`);
  } catch (err) {
    console.error(err);
    setStatus("Fehler: " + err.message);
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
  return lastSync ? new Date(lastSync).toLocaleString("de-DE") : "noch nie";
}

// ---------- Sync-Button ----------

async function triggerSync() {
  if (isSyncing) return;
  if (!state.riotId || !state.syncSecret) {
    setStatus("Bitte Riot-ID und Sync-Secret in den Einstellungen eintragen.");
    document.getElementById("settingsPanel").classList.remove("hidden");
    return;
  }

  isSyncing = true;
  document.getElementById("syncBtn").disabled = true;

  try {
    setStatus("Sync läuft auf dem Server (kann etwas dauern, je nach Anzahl neuer Matches)...");
    await triggerSyncOnServer();
    setStatus("Sync fertig, lade aktualisierte Stats...");
    const stats = await fetchStatsFromServer();
    applyStats(stats);
    setStatus(`Sync abgeschlossen: ${formatLastSync(stats.lastSync)}`);
    // Falls das Ranking-Panel offen ist, gleich mit den frischen Werten
    // neu laden - sonst zeigt es noch den Stand von vor dem Sync.
    if (rankingLoadedOnce && !document.getElementById("rankingBox").classList.contains("hidden")) {
      loadRanking(currentRankingMode);
    }
  } catch (err) {
    console.error(err);
    setStatus("Fehler: " + err.message);
  } finally {
    isSyncing = false;
    document.getElementById("syncBtn").disabled = false;
  }
}

// ---------- Rendering ----------

function renderGrid() {
  const grid = document.getElementById("grid");
  const filterText = document.getElementById("filterInput").value.toLowerCase();
  const onlyMissing = document.getElementById("onlyMissing").checked;

  grid.innerHTML = "";
  let wonCount = 0;

  const visible = championList.filter((c) => c.name.toLowerCase().includes(filterText));

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
    `${wonCount} / ${championList.length} Champions gewonnen`;

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
    `${totalGames} Spiel(e) insgesamt (${totalWins} Siege / ${totalLosses} Niederlagen)`;
}

// ---------- Hover-Tooltip: Match-History pro Champion ----------

function showChampTooltip(e, champ) {
  const tooltip = document.getElementById("champTooltip");
  const history = (state.matchHistory[champ.key] || [])
    .slice()
    .sort((a, b) => b.date - a.date);

  let html = `<div class="tooltipTitle">${champ.name}</div>`;

  if (history.length === 0) {
    html += `<div class="tooltipEmpty">Keine Arena-Spiele seit Season-Start.</div>`;
  } else {
    html += `<div class="tooltipCount">${history.length} Spiel(e) seit ${formatSeasonStart()}</div>`;
    html += `<ul class="tooltipList">`;
    for (const g of history) {
      const isWin = g.placement === 1;
      const resultText = isWin ? "Sieg" : "Niederlage";
      const dateStr = new Date(g.date).toLocaleDateString("de-DE");
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
        <div class="tooltipDate">${dateStr} – ${resultText} (Platz ${g.placement})</div>
        <div class="tooltipMates">mit ${mates}</div>
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
      <span class="metaPartners">mit ${partners}</span>
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
    ? `Stand: ${new Date(data.updatedAt).toLocaleString("de-DE")}`
    : "";
}

// ---------- Freunde ----------

async function loadFriends() {
  if (!state.riotId || !state.serverUrl) return;
  try {
    const res = await fetch(serverUrl(`/friends/${encodeURIComponent(state.riotId)}`));
    if (!res.ok) return;
    const data = await res.json();
    renderFriendsList(data.friends || []);
  } catch (err) {
    console.error("Freunde konnten nicht geladen werden:", err);
  }
}

function renderFriendsList(friends) {
  const list = document.getElementById("friendsList");
  list.innerHTML = "";
  if (friends.length === 0) {
    list.innerHTML = `<li class="friendEmpty">Noch keine Freunde hinzugefügt.</li>`;
    return;
  }
  for (const friendId of friends) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${friendId}</span><button class="removeFriendBtn" title="Entfernen">✕</button>`;
    li.querySelector(".removeFriendBtn").onclick = () => removeFriend(friendId);
    list.appendChild(li);
  }
}

async function addFriend(friendRiotIdParam) {
  const input = document.getElementById("friendIdInput");
  const friendRiotId = friendRiotIdParam || input.value.trim();
  if (!friendRiotId) return;
  if (!state.riotId) {
    setStatus("Bitte zuerst deine eigene Riot-ID in den Einstellungen eintragen.");
    return;
  }
  try {
    const res = await fetch(serverUrl(`/friends/${encodeURIComponent(state.riotId)}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendRiotId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Freund konnte nicht hinzugefügt werden.");
    if (!friendRiotIdParam) input.value = "";
    renderFriendsList(data.friends || []);
    if (currentRankingMode === "friends") loadRanking("friends");
    return data.friends || [];
  } catch (err) {
    console.error(err);
    setStatus("Fehler: " + err.message);
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
    if (!res.ok) throw new Error(data.error || "Entfernen fehlgeschlagen.");
    renderFriendsList(data.friends || []);
    if (currentRankingMode === "friends") loadRanking("friends");
  } catch (err) {
    console.error(err);
    setStatus("Fehler: " + err.message);
  }
}

document.getElementById("addFriendBtn").onclick = addFriend;
document.getElementById("friendIdInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addFriend();
});

// ---------- Ranking ----------

let currentRankingMode = "global";
let rankingLoadedOnce = false;

document.getElementById("rankingToggle").onclick = () => {
  const box = document.getElementById("rankingBox");
  box.classList.toggle("hidden");
  if (!box.classList.contains("hidden") && !rankingLoadedOnce) {
    rankingLoadedOnce = true;
    loadRanking("global");
  }
};

document.getElementById("rankingTabGlobal").onclick = () => loadRanking("global");
document.getElementById("rankingTabFriends").onclick = () => loadRanking("friends");

async function loadRanking(mode) {
  currentRankingMode = mode;
  document.getElementById("rankingTabGlobal").classList.toggle("active", mode === "global");
  document.getElementById("rankingTabFriends").classList.toggle("active", mode === "friends");

  const list = document.getElementById("rankingList");
  list.innerHTML = `<li class="rankEmpty">Lade...</li>`;

  if (mode === "friends" && !state.riotId) {
    list.innerHTML = `<li class="rankEmpty">Erst eigene Riot-ID in den Einstellungen eintragen.</li>`;
    return;
  }

  try {
    const path = mode === "global"
      ? "/ranking/global"
      : `/ranking/friends/${encodeURIComponent(state.riotId)}`;
    const res = await fetch(serverUrl(path));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ranking konnte nicht geladen werden.");
    renderRanking(data.ranking || []);
  } catch (err) {
    console.error(err);
    list.innerHTML = `<li class="rankEmpty">Fehler: ${err.message}</li>`;
  }
}

function renderRanking(ranking) {
  const list = document.getElementById("rankingList");
  list.innerHTML = "";
  if (ranking.length === 0) {
    list.innerHTML = `<li class="rankEmpty">Noch keine Daten.</li>`;
    return;
  }
  ranking.forEach((entry, i) => {
    const li = document.createElement("li");
    li.classList.add("clickable");
    if (entry.riotId === state.riotId) li.classList.add("me");
    li.innerHTML = `
      <span class="rankNum">${i + 1}.</span>
      <span class="rankName">${entry.riotId}</span>
      <span class="rankWins">${entry.championsWon}</span>
    `;
    li.title = "Fortschritt anzeigen";
    li.addEventListener("click", () => openPlayerView(entry.riotId));
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
  summaryEl.textContent = "Lade...";
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
    if (!res.ok) throw new Error(data.error || "Stats konnten nicht geladen werden.");
    viewedPlayerStats = data;
    renderPlayerViewGrid();
  } catch (err) {
    console.error(err);
    summaryEl.textContent = "Fehler: " + err.message;
  }
}

async function updatePlayerViewFriendButton(riotId) {
  const btn = document.getElementById("playerViewAddFriend");
  btn.classList.remove("already");
  btn.textContent = "+ Freund";
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
      btn.textContent = "✓ Freund";
      btn.disabled = true;
    }
  } catch (err) {
    console.error("Freund-Status konnte nicht geprüft werden:", err);
  }
}

document.getElementById("playerViewAddFriend").onclick = async () => {
  const riotId = document.getElementById("playerViewName").textContent;
  const btn = document.getElementById("playerViewAddFriend");
  btn.disabled = true;
  btn.textContent = "...";
  const friends = await addFriend(riotId);
  if (friends) {
    btn.classList.add("already");
    btn.textContent = "✓ Freund";
  } else {
    btn.disabled = false;
    btn.textContent = "+ Freund";
  }
};

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
    `${wonCount} / ${championList.length} Champions gewonnen · ${totalGames} Spiel(e) (${totalWins} Siege)` +
    (viewedPlayerStats.lastSync ? ` · letzter Sync: ${formatLastSync(viewedPlayerStats.lastSync)}` : "");
}

document.getElementById("playerViewClose").onclick = () => {
  document.getElementById("playerViewOverlay").classList.add("hidden");
  viewedPlayerStats = null;
};

document.getElementById("playerViewFilter").oninput = renderPlayerViewGrid;

// ---------- Start ----------

(async function init() {
  setStatus("Champion-Liste wird geladen...");
  await loadChampionList();
  renderGrid();
  loadMetaData();

  if (state.riotId && state.serverUrl) {
    await registerAndLoad();
    loadFriends();
  } else {
    setStatus("Bereit. Einstellungen ausfüllen (Riot-ID, Server-URL, Sync-Secret).");
    document.getElementById("settingsPanel").classList.remove("hidden");
  }
})();
