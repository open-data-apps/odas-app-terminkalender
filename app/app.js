/*
 * Diese Funktion ist für die Inhalte der Startseite
 * zuständig.
 *
 * @param {Object} configdata - Alle Konfigurationsdaten der App
 * @returns {string} - darzustellendes HTML
 */
let calendarData = {};
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
      "https://cdnjs.cloudflare.com/ajax/libs/ical.js/1.4.0/ical.min.js",
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
  enclosingHtmlDivElement.innerHTML = `<div class="row">
      <div class="col-12" id="calendarOptions">
      </div>
      </div>
    </div>
    <div id="calendar">
    </div>`;
  loadAvailableCalendars(configData);
}

// Hilfsfunktion: Nur Pfad aus vollständiger URL extrahieren
function extractPathFromUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch (e) {
    return url;
  }
}

// Lade Kalender von der API über Proxy
function loadAvailableCalendars(configData) {
  const fullPath = window.location.pathname.replace(/\/+$/, "");
  const resourcePath = extractPathFromUrl(configData.apiurl);
  const proxyEndpoint = `${fullPath}/odp-data?path=${resourcePath}`;

  fetch(proxyEndpoint, { method: "POST" })
    .then((response) => response.json())
    .then((proxyData) => {
      let data;
      try {
        data = JSON.parse(proxyData.content);
      } catch (e) {
        console.error("Fehler beim Parsen der Kalenderdaten:", e);
        return;
      }
      if (data.success && data.result.resources) {
        const stand = extractDatenStand(data);
        if (stand) {
          const mainContent = document.getElementById("main-content");
          if (mainContent) {
            const frischeEl = document.createElement("div");
            frischeEl.className = "text-muted small text-end mb-2";
            frischeEl.textContent = "Aktualisiert: " + stand;
            mainContent.insertBefore(frischeEl, mainContent.firstChild);
          }
        }

        const resources = data.result.resources;
        calendarData = resources.filter((resource) =>
          resource.format.toLowerCase().includes("ics")
        );

        if (calendarData.length > 0) {
          createCalendarDropdown(calendarData);
          loadCalendar(calendarData[0].url);

          const methodikHTML = renderMethodikbox(configData, stand);
          if (methodikHTML) {
            const mainContent = document.getElementById("main-content");
            if (mainContent) {
              const methodikEl = document.createElement("div");
              methodikEl.innerHTML = methodikHTML;
              mainContent.appendChild(methodikEl);
            }
          }

          const weitereHTML = renderWeitereInfos(configData);
          if (weitereHTML) {
            const mainContent = document.getElementById("main-content");
            if (mainContent) {
              const weitereEl = document.createElement("div");
              weitereEl.innerHTML = weitereHTML;
              mainContent.appendChild(weitereEl);
            }
          }
        } else {
          console.error("Keine Kalender im passenden Format gefunden.");
        }
      } else {
        console.error("Fehlerhafte API-Antwort:", data);
      }
    })
    .catch((err) => console.error("Fehler beim Laden der Kalenderdaten:", err));
}

// Dropdown-Menü erstellen
function createCalendarDropdown(resources) {
  const mainContent = document.getElementById("calendarOptions");
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
    loadCalendar(event.target.value); // Lade den ausgewählten Kalender
  });

  dropdownContainer.appendChild(dropdown);
  mainContent.prepend(dropdownContainer);
}

// Kalender laden und anzeigen (ICS über Proxy laden)
function loadCalendar(calendarUrl) {
  if (!calendarUrl) {
    console.error("Keine URL für den Kalender angegeben.");
    return;
  }
  const fullPath = window.location.pathname.replace(/\/+$/, "");
  const resourcePath = extractPathFromUrl(calendarUrl);
  const proxyEndpoint = `${fullPath}/odp-data?path=${resourcePath}`;

  fetch(proxyEndpoint, { method: "POST" })
    .then((response) => response.json())
    .then(async (proxyData) => {
      await ensureCalendarAssets();

      let icsData;
      try {
        icsData = proxyData.content;
      } catch (e) {
        console.error("Fehler beim Parsen der ICS-Daten:", e);
        return;
      }
      const events = parseIcsToEvents(icsData);
      const calendarElement = document.getElementById("calendar");

      const calendarInstance = new calendarJs(
        "calendar",
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
      calendarInstance.setEvents(events);
      calendarElement.__calendarInstance = calendarInstance;
    })
    .catch((err) => console.error("Fehler beim Laden der Kalenderdaten:", err));
}

// Termine aus ICS-Daten extrahieren
// Objekt zur Farbzuteilung
const eventColors = {};
const predefinedColors = [
  "#FF5733",
  "#33FF57",
  "#3357FF",
  "#FF33A1",
  "#33FFF5",
  "#A133FF",
  "#FFC733",
];

// Zufällige Farbe generieren
function getRandomColor() {
  return predefinedColors[Math.floor(Math.random() * predefinedColors.length)];
}

// Termine aus ICS-Daten extrahieren
function parseIcsToEvents(icsData) {
  const events = [];
  try {
    const jcalData = ICAL.parse(icsData);
    const component = new ICAL.Component(jcalData);
    const vevents = component.getAllSubcomponents("vevent");

    vevents.forEach((vevent) => {
      const event = new ICAL.Event(vevent);

      const title = event.summary || "Kein Titel";

      // Farbe für den Termin bestimmen
      let color;
      if (eventColors[title]) {
        color = eventColors[title]; // Existierende Farbe nutzen
      } else {
        color = getRandomColor(); // Neue Farbe generieren
        eventColors[title] = color; // Farbe speichern
      }

      // Ereignis hinzufügen
      events.push({
        from: new Date(event.startDate.toJSDate()),
        to: new Date(event.endDate.toJSDate()),
        title: title,
        description: event.description || "Keine Beschreibung verfügbar",
        color: color, // Farbe setzen
      });
    });
  } catch (error) {
    console.error("Fehler beim Parsen der ICS-Daten:", error);
  }
  return events;
}

function addToHead() {
  ensureCalendarAssets().catch((err) =>
    console.error("Kalender-Bibliotheken konnten nicht vorgeladen werden:", err),
  );

  return ``;
}
