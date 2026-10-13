process.env.TZ = 'Europe/Berlin';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const lib = require('../app/vendor/icaljs/ical.min.js');
const app = vm.createContext({ ICAL: lib, console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8'), app);
const year = new Date().getFullYear();
const wrap = content => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Audit//DE\r\n' + content + '\r\nEND:VCALENDAR';
const event = content => 'BEGIN:VEVENT\r\nUID:alpha\r\nSUMMARY:Bio Alpha\r\n' + content + '\r\nEND:VEVENT';
test('F-130 DATE-Ende ist exklusiv, Calendar.js bekommt genau einen Ganztag', () => {
  const [entry] = app.parseIcsToEvents(wrap(event(`DTSTART;VALUE=DATE:${year}0922\r\nDTEND;VALUE=DATE:${year}0923`)));
  assert.equal(entry.isAllDay, true);
  assert.equal(entry.from.getDate(), 22);
  assert.equal(entry.to.getDate(), 22);
});
test('F-130 drei tägliche Vorkommen statt nur des ersten Termins', () => {
  const entries = app.parseIcsToEvents(wrap(event(`DTSTART:${year}0922T100000Z\r\nDTEND:${year}0922T110000Z\r\nRRULE:FREQ=DAILY;COUNT=3`)));
  assert.deepEqual(Array.from(entries, e => e.from.toISOString()), [
    `${year}-09-22T10:00:00.000Z`, `${year}-09-23T10:00:00.000Z`, `${year}-09-24T10:00:00.000Z`,
  ]);
  assert.match(entries.hinweis || '', /Wiederholungen/);
});
test('F-130 EXDATE und verschobene RECURRENCE-ID werden nicht doppelt/zusätzlich gezählt', () => {
  const master = event(`DTSTART:${year}0922T100000Z\r\nDTEND:${year}0922T110000Z\r\nRRULE:FREQ=DAILY;COUNT=4\r\nEXDATE:${year}0923T100000Z`);
  const exception = event(`RECURRENCE-ID:${year}0924T100000Z\r\nDTSTART:${year}0924T130000Z\r\nDTEND:${year}0924T140000Z`);
  const entries = app.parseIcsToEvents(wrap(master + '\r\n' + exception));
  assert.deepEqual(Array.from(entries, e => e.from.toISOString()), [`${year}-09-22T10:00:00.000Z`, `${year}-09-24T13:00:00.000Z`, `${year}-09-25T10:00:00.000Z`]);
});
test('F-130 eingebettete VTIMEZONE gilt kalenderlokal, nicht als globale Nebenwirkung', () => {
  const timezone = 'BEGIN:VTIMEZONE\r\nTZID:Audit/PlusFive\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0500\r\nTZOFFSETTO:+0500\r\nEND:STANDARD\r\nEND:VTIMEZONE';
  const before = lib.TimezoneService.get('Audit/PlusFive');
  const [entry] = app.parseIcsToEvents(wrap(timezone + '\r\n' + event(`DTSTART;TZID=Audit/PlusFive:${year}0922T093000\r\nDTEND;TZID=Audit/PlusFive:${year}0922T103000`)));
  assert.equal(entry.from.toISOString(), `${year}-09-22T04:30:00.000Z`);
  assert.equal(lib.TimezoneService.get('Audit/PlusFive'), before);
});
test('F-130 unendliche Wiederholung ist begrenzt und die Darstellungsgrenze wird genannt', () => {
  const entries = app.parseIcsToEvents(wrap(event(`DTSTART:${year}0101T100000Z\r\nDTEND:${year}0101T110000Z\r\nRRULE:FREQ=DAILY`)));
  assert.ok(entries.length > 365 && entries.length < 1100);
  assert.match(entries.hinweis || '', /Wiederholungen/);
  assert.ok(entries.every(e => e.from.getFullYear() < year + 2));
});
test('F-130 mehrtägiger Ganztag bleibt bis zum letzten belegten Tag sichtbar', () => {
  const [entry] = app.parseIcsToEvents(wrap(event(`DTSTART;VALUE=DATE:${year}1022\r\nDTEND;VALUE=DATE:${year}1025`)));
  // Calendar.js kürzt isAllDay-Termine auf den Starttag; mehrtägige Spannen daher nicht als isAllDay.
  assert.equal(entry.isAllDay, false);
  assert.equal(entry.from.getDate(), 22);
  assert.equal(entry.from.getHours(), 0);
  assert.equal(entry.to.getDate(), 24);
  assert.equal(entry.to.getHours(), 23);
  assert.equal(entry.to.getMinutes(), 59);
});
test('F-130 doppelte VTIMEZONE bleibt kalenderlokal', () => {
  const timezone = 'BEGIN:VTIMEZONE\r\nTZID:Audit/Doppelt\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0300\r\nTZOFFSETTO:+0300\r\nEND:STANDARD\r\nEND:VTIMEZONE';
  const before = lib.TimezoneService.get('Audit/Doppelt');
  app.parseIcsToEvents(wrap(timezone + '\r\n' + timezone + '\r\n' + event(`DTSTART;TZID=Audit/Doppelt:${year}0922T093000\r\nDTEND;TZID=Audit/Doppelt:${year}0922T103000`)));
  assert.equal(lib.TimezoneService.get('Audit/Doppelt'), before);
});
