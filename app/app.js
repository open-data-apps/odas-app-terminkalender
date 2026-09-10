/*
 * Diese Funktion ist für die Inhalte der Startseite
 * zuständig.
 *
 * @param {Object} configdata - Alle Konfigurationsdaten der App
 * @returns {string} - darzustellendes HTML
 */
let tkInstanzZaehler = 0;
let calendarAssetsPromise = null;

// Laufzeit-Cleanups pro App-Instanz, je DOM-Container registriert. onPageLeave
// iteriert alle registrierten Cleanups (try/catch) und leert die Registry
// anschliessend — die app/app-base.js ruft onPageLeave beim Seitenwechsel auf.
const tkCleanups = new Map();

function onPageLeave() {
  tkCleanups.forEach((cleanup) => {
    try {
      cleanup();
    } catch (_err) {
      // Ein einzelner Cleanup darf den Seitenwechsel nicht blockieren.
    }
  });
  tkCleanups.clear();
}

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

// TK-B3: Cache nach einem Fehlschlag freigeben (Muster wie im Muellkalender).
function resetCalendarAssetsCache() {
  if (!calendarAssetsPromise) return;
  calendarAssetsPromise = null;
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
  ])
    .then(() =>
      loadScriptOnce("tk-calendar-js", appAssetUrl("dist/calendar.min.js"), "calendarJs"),
    )
    .catch((err) => {
      resetCalendarAssetsCache();
      throw err;
    });

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
    disposed: false,
    calendarData: {},
  };
  // TK-B4: Controller je Instanz fuer abbrechbare Abrufe.
  state.controller = new AbortController();
  // TK-B1: Vorgaenger-Instanz desselben Containers zuerst abraeumen — sonst
  // bleibt ihre calendarJs-Instanz (dokumentweite Listener) am Leben.
  const tkVorherigerCleanup = tkCleanups.get(enclosingHtmlDivElement);
  if (tkVorherigerCleanup) {
    try {
      tkVorherigerCleanup();
    } catch (_e) {}
  }
  tkCleanups.set(enclosingHtmlDivElement, () => {
    state.disposed = true;
    state.controller.abort();
    const calendarElement = enclosingHtmlDivElement.querySelector("#tk-calendar-" + state.uid);
    destroyCalendarInstance(calendarElement);
  });
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
  return `${appPath}/odp-data?path=${encodeURIComponent(targetUrl)}`;
}

async function fetchViaOdasProxy(targetUrl, options = {}) {
  if (typeof isKeineDatenquelleKonfiguriert === "function" && isKeineDatenquelleKonfiguriert(targetUrl)) {
    throw new Error("Keine Datenquelle konfiguriert.");
  } else if (typeof isKeineDatenquelleKonfiguriert !== "function") {
    const v = String(targetUrl || "").trim();
    if (!v || /^\{\{.*\}\}$/.test(v) || /^<.*>$/.test(v)) throw new Error("Keine Datenquelle konfiguriert.");
  }

  const response = await fetch(getOdasProxyEndpoint(targetUrl), {
    method: "POST",
    signal: options && options.signal ? options.signal : undefined,
  });

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch (_e) {}
    const originHint = /origin not allowed/i.test(body) ? " – URL origin not allowed" : "";
    throw new Error(`ODAS-Proxy-Fehler: HTTP ${response.status}${originHint}`);
  }

  const proxyData = await response.json();
  if (!proxyData || typeof proxyData.content !== "string") {
    throw new Error("ODAS-Proxy-Antwort enthält keinen content-String.");
  }

  return proxyData.content;
}

async function fetchOdasResource(targetUrl, configdata = {}, options = {}) {
  if (isOdasProxyEnabled(configdata)) {
    return fetchViaOdasProxy(targetUrl, options);
  }

  try {
    const response = await fetch(targetUrl, {
      signal: options && options.signal ? options.signal : undefined,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    throw new Error(
      `Direkter Datenabruf fehlgeschlagen (${error.message}). Bitte prüfen Sie die Daten-URL und die CORS-Freigabe der Datenquelle.`,
    );
  }
}

/**
 * Löst eine benannte Datenressource aus configdata.apiurls auf.
 * Neue apiurls-Form (typ: "array"); das frühere skalare apiurl wird nicht mehr gelesen.
 * @returns {string} getrimmte URL, oder "" für den Zustand "keine Quelle konfiguriert"
 */
function getOdasApiUrl(configdata, name) {
  const liste = Array.isArray(configdata && configdata.apiurls) ? configdata.apiurls : [];
  const treffer = liste.find((eintrag) => eintrag && eintrag.name === name);
  return String((treffer && treffer.url) || "").trim();
}

async function fetchOdasJson(targetUrl, configdata = {}, options = {}) {
  const rawContent = await fetchOdasResource(targetUrl, configdata, options);
  try {
    return JSON.parse(rawContent);
  } catch (_error) {
    throw new Error(
      `Die konfigurierte Daten-URL liefert kein JSON, sondern ${describeNonJsonPayload(rawContent)}. ` +
        "Bitte in der Instanzkonfiguration den API-Endpunkt der Datenquelle eintragen, " +
        "nicht den Datensatz- oder Download-Link.",
    );
  }
}

function describeNonJsonPayload(rawContent) {
  const text = String(rawContent == null ? "" : rawContent).trim();
  if (!text) return "eine leere Antwort";
  if (text.startsWith("<")) return "eine HTML-Seite";
  const firstLine = text.split(/\r?\n/, 1)[0];
  if (/[,;]/.test(firstLine)) return "eine CSV- oder Textdatei";
  return "unlesbaren Inhalt";
}

function isKeineDatenquelleKonfiguriert(targetUrl) {
  const quelle = String(targetUrl || "").trim();
  return !quelle || /^\{\{.*\}\}$/.test(quelle) || /^<.*>$/.test(quelle);
}


const TYP_BEZEICHNUNG = {
  "ckan-dkan-ds": "Tabellen-API mit Daten-ID",
  "ckan-ps": "Datensatz-API",
  "ckan-dl": "Datei-Download",
  "ods21": "Open-Data-Suche (API v2.1)",
  "wfs": "Kartendienst (WFS)",
  "sparql": "Wissensdatenbank (SPARQL)",
  "csv-zip": "Statische Datei"
};

function validateUrlTypErwartung(url, erwarteterTyp) {
  const u = String(url || "");
  if (!erwarteterTyp || isKeineDatenquelleKonfiguriert(u)) return null;
  const checks = {
    "ckan-dkan-ds": /\/api\/3\/action\/datastore_search\?resource_id=/i,
    "ckan-ps": /\/api\/3\/action\/package_show\?id=/i,
    "ckan-dl": /\/dataset\/.*\/resource\/.*\/download\//i,
    "ods21": /\/api\/explore\/v2\.1\//i,
    "wfs": /service=WFS/i,
    "sparql": /\/api\/ts\/v1\/kg\/sparql/i,
    "csv-zip": /\.(csv|json|zip)(\?|$)/i
  };
  const re = checks[erwarteterTyp];
  if (!re) return null;
  if (!re.test(u)) {
    const soll = TYP_BEZEICHNUNG[erwarteterTyp] || erwarteterTyp;
    return `Typ passt nicht: erwartet „${soll}", erhalten „${u.slice(0, 60)}…". Prüfen Sie den Hilfe-Tooltip bei „URLs zu Datenressourcen".`;
  }
  return null;
}

function classifyOdasFehler(error, kontext = {}) {
  const msg = String((error && error.message) || error || "");
  const url = String(kontext.url || "");
  const label = String(kontext.label || "Datenressource");
  const typLabel = String(kontext.typLabel || TYP_BEZEICHNUNG[kontext.erwarteterTyp] || "Datenquelle");
  if (/Keine Datenquelle konfiguriert/i.test(msg) || isKeineDatenquelleKonfiguriert(url)) {
    return {
      kind: "KEINE_QUELLE",
      titel: "Es ist keine Datenquelle konfiguriert.",
      hinweis: `Prüfen Sie unter „URLs zu Datenressourcen → ${label}" ob eine gültige ${typLabel}-URL eingetragen ist (Hilfe-Tooltip beachten).`,
      detail: msg,
      alertClass: "alert-info"
    };
  }
  if (/Typ passt nicht: erwartet/i.test(msg)) {
    return {
      kind: "TYP_MISMATCH",
      titel: msg,
      hinweis: `Diese App erwartet ${typLabel}. Korrigieren Sie die URL gemäß Hilfe-Tooltip (Beispiel dort).`,
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/URL origin not allowed/i.test(msg)) {
    return {
      kind: "PROXY_ORIGIN",
      titel: "ODAS-Proxy blockiert: Ziel-Origin nicht freigegeben.",
      hinweis: "Tragen Sie die Ziel-Origin als eigenen Eintrag unter „URLs zu Datenressourcen“ ein oder prüfen Sie proxyAktiv.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/ODAS-Proxy-Fehler/i.test(msg) || /kein content-String/i.test(msg)) {
    return {
      kind: "PROXY_HTTP",
      titel: msg,
      hinweis: "Prüfen Sie proxyAktiv und Erreichbarkeit im ODAS-Live-System (lokal 404 ist normal).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/Direkter Datenabruf fehlgeschlagen/i.test(msg) || /Failed to fetch/i.test(msg)) {
    const corsHint = /Failed to fetch/i.test(msg) ? " – vermutlich CORS blockiert → im ODAS-Live proxyAktiv=ja." : "";
    return {
      kind: "DIREKT_CORS_HTTP",
      titel: msg,
      hinweis: `Prüfen Sie URL und CORS der Quelle${corsHint}`,
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/liefert kein JSON/i.test(msg) || /HTML-Seite|CSV-|leere Antwort|unlesbaren/i.test(msg)) {
    return {
      kind: "PAYLOAD_TYP",
      titel: msg,
      hinweis: "Tragen Sie den passenden Endpunkt ein – nicht die Datensatzseite (/dataset/…) – Hilfe-Tooltip beachten.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/CKAN.*Fehler|success:false/i.test(msg)) {
    return {
      kind: "CKAN_API",
      titel: msg,
      hinweis: "Prüfen Sie Daten-ID / Datensatz-ID (existiert die Tabelle/Datei noch auf dem Portal?).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/404|Nicht gefunden/i.test(msg)) {
    return {
      kind: "HTTP_404",
      titel: msg,
      hinweis: "Ressource/Datensatz auf dem Portal nicht gefunden (404).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  return {
    kind: "UNBEKANNT",
    titel: msg || "Unbekannter Fehler beim Laden.",
    hinweis: "Prüfen Sie Konfiguration und Erreichbarkeit der Quelle.",
    detail: msg,
    alertClass: "alert-danger"
  };
}

function renderOdasFehler(container, error, kontext = {}) {
  if (!container) return;
  const typWarn = validateUrlTypErwartung(kontext.url, kontext.erwarteterTyp);
  if (typWarn && !/Typ passt nicht/i.test(String(error && error.message))) {
    error = new Error(typWarn);
  }
  const info = classifyOdasFehler(error, kontext);
  const url = String(kontext.url || "");
  const urlZeile = url ? `<p class="mb-1 small text-muted">Konfigurierte URL: <code>${escapeHtml(url.length > 80 ? url.slice(0, 80) + "…" : url)}</code></p>` : "";
  const titel = kontext.leer ? "Keine Datensätze gefunden." : info.titel;
  const alertClass = kontext.leer ? "alert-info" : info.alertClass;
  container.innerHTML = `<div class="alert ${alertClass}" role="alert"><strong>${escapeHtml(titel)}</strong><p class="mb-1">${escapeHtml(info.hinweis)}</p>${urlZeile}<details class="small"><summary>Details</summary><code>${escapeHtml(info.detail || String(error))}</code></details></div>`;
}


// Lade Kalender von der API über Proxy
function loadAvailableCalendars(state, configData, root) {
  const quelle = getOdasApiUrl(configData, "termine");
  if (!quelle || /^\{\{.*\}\}$/.test(quelle) || /^<.*>$/.test(quelle)) {
    renderOdasFehler(root.querySelector(`#tk-status-${state.uid}`), new Error("Keine Datenquelle konfiguriert."), {
      url: quelle,
      label: "Termine-API",
      typLabel: "Datensatz-API",
      erwarteterTyp: "ckan-ps",
    });
    return;
  }
  // Variante A (F-92): Typprüfung vor dem ersten Fetch. Die .ics-Ressourcen,
  // die aus dieser package_show-Antwort abgeleitet werden, sind Laufzeit-
  // Downloads und werden bewusst nicht typgeprüft.
  const tkTypWarn = validateUrlTypErwartung(quelle, "ckan-ps");
  if (tkTypWarn) {
    renderOdasFehler(root.querySelector(`#tk-status-${state.uid}`), new Error(tkTypWarn), {
      url: quelle,
      label: "Termine-API",
      typLabel: "Datensatz-API",
      erwarteterTyp: "ckan-ps",
    });
    return;
  }
  // Daten laden: direkt oder ueber den ODAS-Proxy (proxyAktiv)
  fetchOdasJson(getOdasApiUrl(configData, "termine"), configData, {
    signal: state.controller.signal,
  })
    .then((data) => {
      if (state.disposed) return;
      if (data.success && data.result.resources) {
        const stand = extractDatenStand(data);
        if (stand) {
          const frischeEl = document.createElement("div");
          frischeEl.className = "text-muted small text-end mb-2";
          frischeEl.textContent = "Aktualisiert: " + stand;
          root.prepend(frischeEl);
        }

        const resources = data.result.resources;
        // TK-B5: Ressourcen ohne URL erzeugen sonst einen Dropdown-Eintrag mit
        // value="undefined", der beim Auswaehlen zwangslaeufig scheitert.
        state.calendarData = resources.filter(
          (resource) =>
            String((resource && resource.url) || "").trim() !== "" &&
            String((resource && resource.format) || "")
              .toLowerCase()
              .includes("ics"),
        );

        if (state.calendarData.length > 0) {
          createCalendarDropdown(state, state.calendarData, configData, root);
          loadCalendar(state, state.calendarData[0].url, configData, root);
        } else {
          setTkStatus(
            state,
            "info",
            "Keine Kalender im passenden Format (ICS) gefunden.",
          );
        }

        // TK-B6: Die Schale-4-Bereiche gehoeren zur Seite, nicht zum Kalender —
        // vorher fehlten sie, wenn der Datensatz keine ICS-Ressource hatte.
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
          "danger",
          "Die Kalenderdaten konnten nicht geladen werden (fehlerhafte API-Antwort).",
        );
      }
    })
    .catch((err) => {
      if (err && err.name === "AbortError") return;
      if (state.disposed) return;
      console.error("Fehler beim Laden der Kalenderdaten:", err);
      renderOdasFehler(root.querySelector(`#tk-status-${state.uid}`), err, {
        url: quelle,
        label: "Termine-API",
        typLabel: "Datensatz-API",
        erwarteterTyp: "ckan-ps",
      });
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
  if (state.disposed) return;
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
  fetchOdasResource(calendarUrl, configData, {
    signal: state.controller.signal,
  })
    .then(async (icsData) => {
      await ensureCalendarAssets();
      // Veralteter Erfolg / Disposed: weder Kalenderinstanz/DOM noch Status des
      // neueren Ladevorgangs veraendern.
      if (state.disposed || state.calendarLadeToken !== ladeToken) {
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
      // Veralteter Fehler / Disposed: Instanz/DOM/Status des neueren Ladevorgangs
      // unangetastet lassen.
      if (state.disposed || state.calendarLadeToken !== ladeToken) {
        return;
      }
      if (err && err.name === "AbortError") return;
      console.error("Fehler beim Laden der Kalenderdaten:", err);
      // Auch eine frisch angelegte, fehlgeschlagene Instanz raeumen, damit
      // kein halb gerendertes Kalender-DOM zurueckbleibt.
      destroyCalendarInstance(calendarElement);
      // TK-B2: Fehler ins Status-Element statt nach `root` — sonst verschwinden
      // Kalenderauswahl und Schale-4-Bereiche und ein Wechsel auf einen anderen
      // Kalender ist nicht mehr moeglich.
      renderOdasFehler(root.querySelector(`#tk-status-${state.uid}`), err, {
        url: calendarUrl,
        label: "Kalender (Ressource)",
      });
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
