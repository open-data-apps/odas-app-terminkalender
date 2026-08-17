/*
 * Diese Funktion ist für die Inhalte der Startseite
 * zuständig.
 *
 * @param {Object} configdata - Alle Konfigurationsdaten der App
 * @returns {string} - darzustellendes HTML
 */
let tkInstanzZaehler = 0;
let calendarAssetsPromise = null;

function escapeHtml(str) {
  const s = String(str ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appAssetUrl(relativePath) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";

  let pathname = url.pathname;
  if (!pathname.endsWith("/")) {
    pathname = pathname.substring(0, pathname.lastIndexOf("/") + 1);
  }
  if (pathname.endsWith("/app/")) {
    pathname = pathname.slice(0, -4);
  }

  return url.origin + pathname + relativePath.replace(/^\/+/, "");
}

function loadStyleOnce(id, href) {
  if (document.getElementById(id)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    link.onload = resolve;
    link.onerror = () => reject(new Error("Stylesheet konnte nicht geladen werden: " + href));
    document.head.appendChild(link);
  });
}

function loadScriptOnce(id, src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve();

  const existing = document.getElementById(id);
  if (existing) {
    if (existing.dataset.loaded === "true") return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Script konnte nicht geladen werden: " + src)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Script konnte nicht geladen werden: " + src));
    document.head.appendChild(script);
  });
}

function ensureCalendarAssets() {
  if (calendarAssetsPromise) return calendarAssetsPromise;

  calendarAssetsPromise = Promise.all([
    loadStyleOnce("tk-calendar-css", appAssetUrl("dist/calendar.js.min.css")),
    loadScriptOnce(
      "tk-ical-js",
      "vendor/icaljs/ical.min.js",
      "ICAL",
    ),
    loadScriptOnce(
      "tk-calendar-translations-de",
      appAssetUrl("dist/translations/calendar.translations.de.js"),
      "__TRANSLATION_OPTIONS",
    ),
  ]).then(() =>
    loadScriptOnce("tk-calendar-js", appAssetUrl("dist/calendar.min.js"), "calendarJs"),
  );

  return calendarAssetsPromise;
}

function renderWeitereInfos(configdata) {
  const links = (configdata.weiterfuehrendeLinks || "").trim();
  if (!links) return "";
  return (
    '<section class="tk-weitere-infos mt-4">' +
    '<h2 class="h5 mb-3">Weitere Informationen</h2>' +
    '<div class="tk-weitere-infos-content">' +
    links +
    "</div></section>"
  );
}

function renderMethodikbox(configdata, extractedStand) {
  const methodik = String(configdata.datenquelleHinweis || "").trim();
  const datenStand = extractedStand || String(configdata.datenStand || "").trim();
  if (!methodik && !datenStand) return "";
  let content = "";
  if (datenStand) {
    content += '<p><strong>Datenstand:</strong> ' + escapeHtml(datenStand) + "</p>";
  }
  if (methodik) {
    content += methodik;
  }
  return (
    '<section class="tk-methodik mt-4">' +
    '<h2 class="h5 mb-3">Methodik / Datenquelle</h2>' +
    '<div class="tk-methodik-content">' +
    content +
    "</div></section>"
  );
}

function extractDatenStand(apiResponse) {
  const raw = apiResponse?.result?.metadata_modified || null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("de-DE");
}

function app(configData, enclosingHtmlDivElement) {
  // F-42: pro Instanz geschlossener State (Closure in app())
  const state = {
    uid: "i" + ++tkInstanzZaehler,
    root: enclosingHtmlDivElement,
    config: configData,
    disposed: false, // wird in Task 9 (onPageLeave) gesetzt
    calendarData: {},
  };
  const tkUid = state.uid;
  enclosingHtmlDivElement.innerHTML = `<div class="row">
      <div class="col-12" id="tk-calendarOptions-${tkUid}">
      </div>
      </div>
    </div>
    <div id="tk-status-${tkUid}">
    </div>
    <div id="tk-calendar-${tkUid}">
    </div>`;
  loadAvailableCalendars(state, configData, enclosingHtmlDivElement);
}

// ── SICHTBARE ZUSTÄNDE ───────────────────────────────────────────────────────
// Jeder Fehlerpfad muss die Oberfläche erreichen. Ein stumm leerer Kalender ist
// von "derzeit keine Termine" nicht zu unterscheiden.

function setTkStatus(state, typ, html) {
  const status =
    state && state.root
      ? state.root.querySelector("#tk-status-" + state.uid)
      : null;
  if (!status) return;
  if (!html) {
    status.innerHTML = "";
    return;
  }
  const cssClass =
    typ === "warning"
      ? "alert-warning"
      : typ === "danger"
        ? "alert-danger"
        : "alert-info";
  status.innerHTML =
    '<div class="alert ' + cssClass + '" role="alert">' + html + "</div>";
}

// Hilfsfunktion: Nur Pfad aus vollständiger URL extrahieren
function isOdasProxyEnabled(configdata = {}) {
  return String(configdata.proxyAktiv || "").trim().toLowerCase() === "ja";
}

function extractPathFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname + parsedUrl.search;
  } catch (_error) {
    return String(url || "");
  }
}

function getOdasAppBasePath(pathname) {
  let appPath =
    pathname === undefined
      ? typeof window !== "undefined"
        ? window.location.pathname
        : "/"
      : String(pathname || "/");

  if (!appPath.endsWith("/")) {
    const lastSlashIndex = appPath.lastIndexOf("/");
    const lastSegment = appPath.substring(lastSlashIndex + 1);
    if (lastSegment.includes(".")) {
      appPath = appPath.substring(0, lastSlashIndex + 1);
    }
  }

  return appPath.replace(/\/+$/, "");
}

function getOdasProxyEndpoint(targetUrl, pathname) {
  const appPath = getOdasAppBasePath(pathname);
  return `${appPath}/odp-data?path=${encodeURIComponent(
    extractPathFromUrl(targetUrl),
  )}`;
}

async function fetchViaOdasProxy(targetUrl) {
  const response = await fetch(getOdasProxyEndpoint(targetUrl), {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`ODAS-Proxy-Fehler: HTTP ${response.status}`);
  }

  const proxyData = await response.json();
  if (!proxyData || typeof proxyData.content !== "string") {
    throw new Error("ODAS-Proxy-Antwort enthält keinen content-String.");
  }

  return proxyData.content;
}

async function fetchOdasResource(targetUrl, configdata = {}) {
  if (isOdasProxyEnabled(configdata)) {
    return fetchViaOdasProxy(targetUrl);
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  } catch (error) {
    throw new Error(
      `Direkter Datenabruf fehlgeschlagen (${error.message}). Bitte prüfen Sie die Daten-URL und die CORS-Freigabe der Datenquelle.`,
    );
  }
}

async function fetchOdasJson(targetUrl, configdata = {}) {
  return JSON.parse(await fetchOdasResource(targetUrl, configdata));
}

// Lade Kalender von der API über Proxy
function loadAvailableCalendars(state, configData, root) {
  const quelle = String(configData.apiurl || "").trim();
  if (!quelle || /^\{\{.*\}\}$/.test(quelle) || /^<.*>$/.test(quelle)) {
    setTkStatus(state, "info", "Es ist keine Datenquelle konfiguriert.");
    return;
  }
  // Daten laden: direkt oder ueber den ODAS-Proxy (proxyAktiv)
  fetchOdasJson(configData.apiurl, configData)
    .then((data) => {
      if (data.success && data.result.resources) {
        const stand = extractDatenStand(data);
        if (stand) {
          const frischeEl = document.createElement("div");
          frischeEl.className = "text-muted small text-end mb-2";
          frischeEl.textContent = "Aktualisiert: " + stand;
          root.prepend(frischeEl);
        }

        const resources = data.result.resources;
        state.calendarData = resources.filter(
          (resource) =>
            String((resource && resource.format) || "")
              .toLowerCase()
              .includes("ics"),
        );

        if (state.calendarData.length > 0) {
          createCalendarDropdown(state, state.calendarData, configData, root);
          loadCalendar(state, state.calendarData[0].url, configData, root);

          const methodikHTML = renderMethodikbox(configData, stand);
          if (methodikHTML) {
            const methodikEl = document.createElement("div");
            methodikEl.innerHTML = methodikHTML;
            root.appendChild(methodikEl);
          }

          const weitereHTML = renderWeitereInfos(configData);
          if (weitereHTML) {
            const weitereEl = document.createElement("div");
            weitereEl.innerHTML = weitereHTML;
            root.appendChild(weitereEl);
          }
        } else {
          setTkStatus(
            state,
            "info",
            "Keine Kalender im passenden Format (ICS) gefunden.",
          );
        }
      } else {
        setTkStatus(
          state,
          "danger",
          "Die Kalenderdaten konnten nicht geladen werden (fehlerhafte API-Antwort).",
        );
      }
    })
    .catch((err) => {
      console.error("Fehler beim Laden der Kalenderdaten:", err);
      setTkStatus(
        state,
        "danger",
        "Die Kalenderdaten konnten nicht geladen werden: " +
          escapeHtml(err.message),
      );
    });
}

// Dropdown-Menü erstellen
function createCalendarDropdown(state, resources, configData = {}, root) {
  const mainContent = root.querySelector("#tk-calendarOptions-" + state.uid);
  const dropdownContainer = document.createElement("div");
  dropdownContainer.className = "mb-3";

  const dropdown = document.createElement("select");
  dropdown.className = "form-select";
  dropdown.setAttribute("aria-label", "Kalenderauswahl");

  resources.forEach((resource, index) => {
    const option = document.createElement("option");
    option.value = resource.url;
    option.textContent = resource.name || `Kalender ${index + 1}`;
    dropdown.appendChild(option);
  });

  dropdown.addEventListener("change", (event) => {
    loadCalendar(state, event.target.value, configData, root); // Lade den ausgewählten Kalender
  });

  dropdownContainer.appendChild(dropdown);
  mainContent.prepend(dropdownContainer);
}

// Zerstoert eine vorhandene calendarJs-Instanz und leert den root-lokalen
// Kalendercontainer. Wirft destroy() (Drittanbieter-Code), bleibt die
// Leerung trotzdem garantiert.
function destroyCalendarInstance(calendarElement) {
  if (!calendarElement) return;
  const instance = calendarElement.__calendarInstance;
  if (instance && typeof instance.destroy === "function") {
    try {
      instance.destroy();
    } catch (error) {
      console.error("Fehler beim Zerstören der Kalenderinstanz:", error);
    }
  }
  calendarElement.__calendarInstance = null;
  calendarElement.innerHTML = "";
}

// Kalender laden und anzeigen (ICS über Proxy laden)
function loadCalendar(state, calendarUrl, configData = {}, root) {
  if (!calendarUrl) {
    console.error("Keine URL für den Kalender angegeben.");
    setTkStatus(
      state,
      "danger",
      "Für den ausgewählten Kalender ist keine Datenquelle hinterlegt.",
    );
    return;
  }
  setTkStatus(state, "", "");
  // Neuer Ladevorgang: vorherige Instanz zerstoeren und Container leeren,
  // damit beim Ressourcenwechsel keine stale Kalender-DOM stehen bleibt.
  const calendarElement = root.querySelector("#tk-calendar-" + state.uid);
  destroyCalendarInstance(calendarElement);
  // Latest-Load-Token: Nur der neueste Ladevorgang darf nach seinem Abschluss
  // Instanz/DOM/Status anfassen. Ein veralteter Erfolg oder Fehler (Request A
  // schlaegt spaet fehl, nachdem Request B bereits erfolgreich neu geladen
  // hat) wird dadurch verworfen, statt die neuere Instanz zu zerstoeren.
  state.calendarLadeToken = (state.calendarLadeToken || 0) + 1;
  const ladeToken = state.calendarLadeToken;
  // ICS laden: direkt oder ueber den ODAS-Proxy (proxyAktiv)
  fetchOdasResource(calendarUrl, configData)
    .then(async (icsData) => {
      await ensureCalendarAssets();
      // Veralteter Erfolg: weder Kalenderinstanz/DOM noch Status des
      // neueren Ladevorgangs veraendern.
      if (state.calendarLadeToken !== ladeToken) {
        return;
      }

      const events = parseIcsToEvents(icsData);
      if (events.length === 0) {
        setTkStatus(
          state,
          "info",
          "Für diesen Kalender sind derzeit keine Termine hinterlegt.",
        );
      } else {
        setTkStatus(state, "", "");
      }

      const calendarInstance = new calendarJs(
        "tk-calendar-" + state.uid,
        window.__TRANSLATION_OPTIONS || {},
        {
          manualEditingEnabled: false,
          id: "calendar-container",
          dataSource: events,
          language: "de",
          enableNotifications: true,
          exportICS: true,
        }
      );
      // Instanz registrieren, bevor setEvents laeuft: schlaegt der weitere
      // Aufbau fehl, kann der catch sie zerstoeren statt sie zu verlieren.
      calendarElement.__calendarInstance = calendarInstance;
      calendarInstance.setEvents(events);
    })
    .catch((err) => {
      // Veralteter Fehler: Instanz/DOM/Status des neueren Ladevorgangs
      // unangetastet lassen.
      if (state.calendarLadeToken !== ladeToken) {
        return;
      }
      console.error("Fehler beim Laden der Kalenderdaten:", err);
      // Auch eine frisch angelegte, fehlgeschlagene Instanz raeumen, damit
      // kein halb gerendertes Kalender-DOM zurueckbleibt.
      destroyCalendarInstance(calendarElement);
      setTkStatus(
        state,
        "danger",
        "Der Kalender konnte nicht geladen werden: " + escapeHtml(err.message),
      );
    });
}

// Termine aus ICS-Daten extrahieren
const predefinedColors = [
  "#FF5733",
  "#33FF57",
  "#3357FF",
  "#FF33A1",
  "#33FFF5",
  "#A133FF",
  "#FFC733",
];

// Deterministische Farbe aus dem Titel ableiten (F-59/F-61): einfache
// Zeichen-Prüfsumme modulo Palettenlänge statt Zufall + modulglobaler
// eventColors-Map. Derselbe Titel ergibt bei jedem Lauf dieselbe Farbe; da
// die Ableitung zustandslos ist, entfällt die zuvor über Instanzen und
// Seitenwechsel hinweg geteilte, nie zurückgesetzte Map ganz.
function colorForTitle(title) {
  let checksum = 0;
  for (let i = 0; i < title.length; i++) {
    checksum = (checksum + title.charCodeAt(i)) % predefinedColors.length;
  }
  return predefinedColors[checksum];
}

// Termine aus ICS-Daten extrahieren
function parseIcsToEvents(icsData) {
  const events = [];
  const jcalData = ICAL.parse(icsData);
  const component = new ICAL.Component(jcalData);
  const vevents = component.getAllSubcomponents("vevent");

  vevents.forEach((vevent) => {
    const event = new ICAL.Event(vevent);

    const title = event.summary || "Kein Titel";

    // Farbe für den Termin bestimmen
    const color = colorForTitle(title);

    // Ereignis hinzufügen
    events.push({
      from: new Date(event.startDate.toJSDate()),
      to: new Date(event.endDate.toJSDate()),
      title: title,
      description: event.description || "Keine Beschreibung verfügbar",
      color: color, // Farbe setzen
    });
  });
  return events;
}

function addToHead() {
  ensureCalendarAssets().catch((err) =>
    console.error("Kalender-Bibliotheken konnten nicht vorgeladen werden:", err),
  );

  return ``;
}
