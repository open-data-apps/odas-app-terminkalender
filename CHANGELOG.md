# Changelog

## 1.25.0 - 2026-08-21
- **CHG:** Skalares `apiurl` durch das Array-Feld `apiurls` ersetzt (`typ: "array"`, Eintrag `termine`). Neuer Standard portfolioweit; `apiurl` entfällt. `app.js` liest die Datenquelle jetzt über `getOdasApiUrl(configdata, "termine")`.

## 1.24.0 - 2026-08-20
- Markdown-Metadaten: Paketbeschreibungen auf echtes Markdown umgestellt, exakte Identität Top-Level/Instanz hergestellt, lokale HTML-Fixture semantisch gespiegelt.

## 1.23.0 - 2026-08-20
- FIX: `onPageLeave(page)` ergänzt und über `tkCleanups`-Map registriert (das CHANGELOG behauptete dies bereits bei der F-42-Welle, ohne dass es tatsächlich implementiert wurde); zusätzlich der bestehende Latest-Load-Token-Mechanismus um einen `disposed`-Check ergänzt (F-74)

## 1.22.0 - 2026-08-17
- `urlDaten.default` nutzte keinen Auto-Fill-Platzhalter, obwohl `apiurl.default` bereits `{{appconfig.datensatz-apiurl}}` verwendet; jetzt mit dem fehlenden Gegenstück `{{appconfig.datensatz-url}}` (Muster: `odas-app-parkflaechen`/`odas-app-poi`), `beispiel` auf die bereits verifizierte Datensatzseite gesetzt (F-68)
- `apiurl.hilfe` verwendete das Wort „Datensatz" für das Feld, das explizit NICHT die Datensatzseite sein soll (plus Tippfehler „Ressoucen"); jetzt mit expliziter Abgrenzung zu `urlDaten` formuliert (F-68)

## 1.21.0 - 2026-08-17
- `fetchOdasJson()` wirft jetzt bei nicht-JSON-Antworten (CSV, HTML, leerer Body) eine sprechende Konfigurationsfehlermeldung statt der rohen `JSON.parse`-Parserfehlermeldung (F-66)
- `urlDaten` zeigte auf einen nicht mehr existierenden Host (`offenedaten.esslingen.de`/`open-data-esslingen.de`, NXDOMAIN) bzw. auf den Platzhalter `.../testdaten` (HTTP 404) — jetzt auf die reale Datensatz-Landingpage der tatsächlich konfigurierten `apiurl`-Quelle verweisend, live per HTTP-Abruf verifiziert (F-67)

## 1.20.0 - 2026-08-17
- **CHG:** `instanz-config`-`category`-Vokabular auf Deutsch umgestellt (`allgemein`, `beschreibung`, `datenherkunft`, `kontakt-rechtliches`, `sonstiges`); die entfallenen Kategorien `metrics` und `advanced` wurden auf `beschreibung` bzw. `sonstiges` verteilt

## 1.19.0 - 2026-08-12
- FIX: `app/index.html` auf den Template-Stand (F-47): Datei byte-gleich aus `oda-generic` übernommen — gültiges HTML, deutsche ARIA-Labels, Footer im Body; Titel und Fußzeile bleiben Platzhalter und werden zur Laufzeit aus der Instanz-Config überschrieben

## 1.18.0 - 2026-08-11
- FIX: Stale-Kalender-DOM beim Ressourcenwechsel beseitigt (F-45-Rest): `loadCalendar` zerstört vor jedem neuen Ladevorgang die vorherige `calendarJs`-Instanz (`calendarElement.__calendarInstance.destroy()`) und leert den root-lokalen Kalendercontainer `#tk-calendar-<uid>`; schlägt der Aufbau nach Anlage der neuen Instanz fehl (z. B. `setEvents` wirft), wird auch diese Instanz zerstört und der Container geleert — der danger-Status bleibt sichtbar, andere F-45-Zustände bleiben unverändert
- FIX: Latest-Load-Token gegen veraltete Ladevorgänge (F-45-Rest, Review-Nachzug): Jeder `loadCalendar`-Aufruf erhält ein pro-Instanz-`state`-Token (`state.calendarLadeToken`); ein veralteter Erfolg oder Fehler (Request A schlägt spät fehl, nachdem Request B bereits erfolgreich neu geladen hat) verwirft seine Fortsetzung, statt die neuere Instanz samt DOM und Status zu verändern — der Guard sitzt direkt nach dem einzigen `await` im `then` und am Beginn des `catch`

## 1.17.0 - 2026-08-11
- FIX: Kalender-Zustände getrennt darstellen (F-45): Root-lokaler Statusbereich `#tk-status-<uid>` mit `setTkStatus(state, typ, html)` ersetzt stumme `console.error`-Pfade; vier Zustände werden unterschieden — Quelle fehlt/nicht erreichbar/ungültige API-Antwort und Parserfehler zeigen einen sichtbaren Fehler (danger) statt eines leeren Kalenders, gültig aber ohne ICS-Ressourcen oder ohne Termine zeigt einen Leer-Hinweis (info), gültig mit Ereignissen rendert normal; Format-Guard `String((resource && resource.format) || "").toLowerCase()` verhindert den TypeError bei Ressourcen ohne `format`; `parseIcsToEvents` wirft Parse-Fehler statt still ein leeres Array zu liefern, der Aufrufer setzt den Fehlerstatus

## 1.16.0 - 2026-08-11
- FIX: Laufzeitzustand pro App-Instanz isoliert (F-42): Instanzzähler `tkInstanzZaehler` ergänzt, Modul-Global `calendarData` in ein pro `app()`-Aufruf geschlossenes `state`-Objekt (uid, root, config, calendarData) gezogen; Kalender- und Options-Container tragen instanzeindeutige IDs (`tk-calendar-<uid>`, `tk-calendarOptions-<uid>`), `new calendarJs("tk-calendar-<uid>", …)` zielt auf die eigene Instanz; Datenfrische-, Methodik- und Weitere-Infos-Block werden in den Root-Container gerendert statt ins globale `#main-content`

## 1.15.0 - 2026-08-11
- FIX: XSS- und URL-Vertrag geschlossen (F-35): Vendor-Patch `dist/calendar.js`/`dist/calendar.min.js` — Kalender-Titel werden per `textContent` statt `innerHTML` + `rc()` gesetzt; damit endet die Entity-Doppeldekodierung (ICAL + `rc()`) am Titel-Sink, aus `&lt;img …&gt;` im ICS-Titel wird wörtlicher Text statt ausführbares Markup

## 1.14.0 - 2026-08-06
- FIX: DOM-Zugriffe auf den App-Container gescopt; Kalender-IDs mit App-Praefix versehen (F-25)

## 1.13.0 - 2026-08-06
- FIX: Datenschutzangabe beschreibt den tatsaechlichen Stand nach dem Vendoring (Welle G)

## 1.12.0 - 2026-08-06
- FIX: Drittanbieterliste "Beim Aufruf kontaktierte Drittanbieter" entfernt — alle Programmbibliotheken liegen jetzt lokal in `app/vendor/`, beim Aufruf werden keine externen Bibliotheksserver mehr kontaktiert

## 1.11.0 - 2026-08-06
- FIX: ical.js vendored in `app/vendor/` statt von CDN geladen (Vendoring Teil 3) — Standalone-Betrieb laedt die Zusatzbibliotheken nicht mehr extern

## 1.10.0 - 2026-08-06
- FIX: Base auf Template oda-generic 1.6.0 vereinheitlicht (Hook renderPageOverride)

## 1.9.0 - 2026-08-04
- FIX: Datenschutzhinweis "Beim Aufruf kontaktierte Drittanbieter" an das Vendoring angepasst — jetzt lokal ausgelieferte Bibliotheken (Bootstrap/Leaflet/Chart.js) sind aus der Liste entfernt, weiterhin extern geladene Dienste (Kartenkacheln, Zusatzbibliotheken) bleiben genannt

## 1.8.0 - 2026-08-04
- FIX: Bootstrap vendored in `app/vendor/` statt von CDN geladen (F-07 Teil 2) — Standalone-Betrieb laedt diese Bibliotheken nicht mehr extern

## 1.7.0 - 2026-08-04
- FIX: Drittanbieter (CDN, Kartendienste) in `datenschutz`-Default und README dokumentiert (F-07 Teil 1)
- FIX: Bootstrap CSS/JS auf einheitlich 5.3.8 gezogen (vorher gemischt 5.3.0/5.3.1 bzw. 5.3.0/5.3.0) (F-31)
- FIX: lokale `odas-config/config.json`: leeres Pflichtfeld `datenschutz` mit dem App-Paket-Default befuellt

## 1.6.0 - 2026-07-31
- CHG: fehlendes Pflicht-Asset assets/branding.css ergaenzt und brandingCSSFile lokal aktiviert

## 1.5.0 - 2026-07-31
- CHG: toter Konfigurationsschlüssel lizenz entfernt (F-17)
- CHG: brandingCSS und brandingCSSFile als Base-Abhängigkeiten deklariert und lokal gespiegelt (F-17)
- CHG: format.typ von "String" auf v1-sicheres "string" korrigiert (F-18)
- CHG: dropdown-Default auf Feldebene verschoben statt in format (F-18)
- CHG: Platzhalter-Entwickler mueller-gmbh durch ondics-gmbh ersetzt (F-21)
- CHG: Platzhalter Mueller GmbH aus der Fußzeile entfernt (F-21)
- FIX: defekte Icon- und Screenshot-Referenzen korrigiert (F-19)
- CHG: daten.schema auf assets/schema.json gesetzt (F-20)

## 1.4.0 - 2026-07-30

- **FIX:** Laufzeitfehler nach dem Laden der Konfiguration werden jetzt sichtbar gemeldet; `handleRouting()` wird `await`et und besitzt einen Fehlerpfad. Bisher blieb die Seite bei einem Fehler im Seitenaufbau stumm leer
- **FIX:** `getConfigUrl()` schneidet bei einer URL ohne abschliessenden Schraegstrich nicht mehr das letzte Verzeichnis ab; die Konfiguration wird auch unter `.../app` gefunden
- **FIX:** Klick auf einen Hash-Link, der bereits die aktive Seite bezeichnet, rendert die Seite neu (`setupSamePageLinks()`) - das Logo fuehrt damit aus Unteransichten zurueck zur Startseite
- **ENH:** `app/app-base.js` ist wieder byte-identisch zum Template `oda-generic` 1.4.0; app-spezifisches Aufraeumen laeuft ueber den neuen Hook `onPageLeave(page)` in `app/app.js`

## 1.3.0 - 2026-07-24

- **FIX:** Laufzeit-Fehlermeldung wird vor der Anzeige HTML-maskiert (`escapeHtmlForBase`); ein Fehlertext kann kein Markup mehr in die Seite einschleusen (XSS)
- **FIX:** Startseiten-Renderer wird nun `await`et; bei asynchronen Apps erscheint kein kurzzeitiges `[object Promise]` in `#main-content`

## 1.2.0 - 2026-07-23

- **ENH:** Datenabruf auf den Schalter `proxyAktiv` umgestellt; direkte Abrufe sind der Standard, der ODAS-Proxy wird nur noch bei `ja` verwendet
- **ENH:** Einfachen Standalone-Betrieb hinter Traefik mit derselben `odas-config/config.json` wie in der Entwicklung ergänzt
- **ENH:** Traefik-Anbindung auf das externe Netzwerk `proxynet`, den EntryPoint `websecure` und den Zertifikatsresolver `letsencrypt` festgelegt
- **FIX:** Proxy-Basispfad funktioniert jetzt auch bei URLs mit `index.html`; der Ziel-Pfad wird URL-kodiert
- **FIX:** Konfiguration wird an Kalender-Dropdown und ICS-Abruf durchgereicht
- **DOC:** Start über `STANDALONE=true make up` dokumentiert

## v1.1.0

- ENH: escapeHtml()-Hilfsfunktion für XSS-Schutz hinzugefügt
- ENH: renderWeitereInfos()-Sektion mit konfigurierbaren weiterführenden Links
- ENH: Datenfrische-Indikator aus CKAN metadata_modified
- ENH: Beschreibung aktualisiert mit „Für wen ist diese App?“-Abschnitt
- FIX: Doppelte urldaten/urlDaten-Konfigurationsschlüssel entfernt

## 06.12.2024

- ENH: Terminen werden zufällig Farben zugewiesen (Gleichnamigen Terminen wird die gleiche Farbe zugewiesen)

## 19.02.2025

- ENH: Neue App Struktur übernommen
