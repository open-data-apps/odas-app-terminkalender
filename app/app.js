/*
 * Diese Funktion ist für die Inhalte der Startseite
 * zuständig.
 *
 * @param {Object} configdata - Alle Konfigurationsdaten der App
 * @returns {string} - darzustellendes HTML
 */
let calendarData = {};

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
        const resources = data.result.resources;
        calendarData = resources.filter((resource) =>
          resource.format.toLowerCase().includes("ics")
        );

        if (calendarData.length > 0) {
          createCalendarDropdown(calendarData);
          loadCalendar(calendarData[0].url);
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
    .then((proxyData) => {
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
        __TRANSLATION_OPTIONS,
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
  const currentUrl = window.location.href;

  // Stylesheet
  const stylesheet = "dist/calendar.js.min.css";
  const styleSheetUrl = currentUrl + stylesheet;

  const stylesheetLink = document.createElement("link");
  stylesheetLink.rel = "stylesheet";
  stylesheetLink.href = styleSheetUrl;
  stylesheetLink.type = "text/css";

  document.head.appendChild(stylesheetLink);

  // Translations
  const translation = "dist/translations/calendar.translations.de.js";
  const translationUrl = currentUrl + translation;

  const translationScript = document.createElement("script");
  translationScript.src = translationUrl;

  document.head.appendChild(translationScript);

  // Calendar.js
  const calender = "dist/calendar.js";
  const calenderUrl = currentUrl + calender;

  const calenderScript = document.createElement("script");
  calenderScript.src = calenderUrl;

  document.head.appendChild(calenderScript);

  // ICal
  const icalUrl =
    "https://cdnjs.cloudflare.com/ajax/libs/ical.js/1.4.0/ical.min.js";

  const icalScript = document.createElement("script");
  icalScript.src = icalUrl;

  document.head.appendChild(icalScript);
}
