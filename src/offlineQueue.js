// Offline-wachtrij voor chauffeursmeldingen.
//
// Chauffeurs werken vaak onderweg met een wisselende verbinding. Als een
// melding niet direct verstuurd kan worden (geen netwerk), bewaren we hem
// lokaal in localStorage en versturen we hem automatisch zodra er weer
// verbinding is. Zo gaat er niets verloren.
import { supabase } from "./supabaseClient.js";

const KEY = "tt_offline_reports_v1";
// Zelfde principe voor de dagelijkse voertuigcheck en het afronden van een rit
// (POD): precies de handelingen die een chauffeur vaak op plekken zónder
// bereik doet (terrein, loods, kelder) en die dus nooit hard mogen falen.
const CHECK_KEY = "tt_offline_checks_v1";
const RIDE_KEY = "tt_offline_rides_v1";
const FUEL_KEY = "tt_offline_fuel_v1";

function readKey(key) {
  try { const a = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
function writeKey(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch { /* opslag vol/geblokkeerd */ }
}
const read = () => readKey(KEY);
const write = (arr) => writeKey(KEY, arr);

// Totaal aantal wachtende items (meldingen + checks + afleveringen) — voor de
// "wacht op verbinding"-banner bij de chauffeur.
export function queuedCount() {
  return read().length + readKey(CHECK_KEY).length + readKey(RIDE_KEY).length + readKey(FUEL_KEY).length;
}

export function enqueueCheck(check, uid = null) {
  const arr = readKey(CHECK_KEY);
  if (check?.id && !arr.some((it) => it.check && it.check.id === check.id)) {
    arr.push({ check, uid });
    writeKey(CHECK_KEY, arr);
  }
  notify();
}

export function enqueueRideCompletion(rideId, pod, uid = null) {
  const arr = readKey(RIDE_KEY);
  if (rideId && !arr.some((it) => it.rideId === rideId)) {
    arr.push({ rideId, pod, uid });
    writeKey(RIDE_KEY, arr);
  }
  notify();
}

export function enqueueFuel(entry, uid = null) {
  const arr = readKey(FUEL_KEY);
  if (entry?.id && !arr.some((it) => it.entry && it.entry.id === entry.id)) {
    arr.push({ entry, uid });
    writeKey(FUEL_KEY, arr);
  }
  notify();
}

// Netwerkfout herkennen: dan queuen we. Echte (server)fouten gooien we door.
export function isNetworkError(e) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = (e && (e.message || e.error_description || "")) + "";
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg);
}

export function enqueueReport(report, uid = null) {
  const arr = read();
  // Dubbele meldingen (zelfde id) niet nog eens toevoegen.
  if (!arr.some((it) => it.report && it.report.id === report.id)) {
    // 'uid' legt vast wíé de melding maakte: op een gedeeld apparaat mag een
    // achtergebleven melding nooit onder een andere login verstuurd worden.
    arr.push({ report, uid, queuedAt: null });
    write(arr);
  }
  notify();
}

const MAX_ATTEMPTS = 6; // na zoveel mislukte (niet-netwerk) pogingen: opgeven
// Definitief mislukte meldingen: apart bewaard zodat de app het de gebruiker
// kan laten zien in plaats van ze stilletjes weg te gooien.
const FAILED_KEY = "tt_failed_reports_v1";
export function failedCount() {
  try { const a = JSON.parse(localStorage.getItem(FAILED_KEY) || "[]"); return Array.isArray(a) ? a.length : 0; } catch { return 0; }
}
export function clearFailed() {
  try { localStorage.removeItem(FAILED_KEY); } catch { /* noop */ }
  notify();
}
// Definitief mislukte meldingen terug in de wachtrij zetten voor een nieuwe
// ronde pogingen (bv. nadat de storing bij de server voorbij is).
export function retryFailed() {
  try {
    const a = JSON.parse(localStorage.getItem(FAILED_KEY) || "[]");
    if (!Array.isArray(a) || !a.length) return 0;
    const arr = read();
    let n = 0;
    for (const it of a) {
      if (it?.report?.id && !arr.some((x) => x.report && x.report.id === it.report.id)) { arr.push({ ...it, attempts: 0 }); n++; }
    }
    write(arr);
    localStorage.removeItem(FAILED_KEY);
    notify();
    flushQueue();
    return n;
  } catch { return 0; }
}
function addFailed(item) {
  try {
    const a = JSON.parse(localStorage.getItem(FAILED_KEY) || "[]");
    (Array.isArray(a) ? a : []).push(item);
    localStorage.setItem(FAILED_KEY, JSON.stringify((Array.isArray(a) ? a : [item]).slice(-20)));
  } catch { /* noop */ }
}

let flushing = false;
// Generieke flush voor de check- en rit-wachtrijen: per item versturen, bij
// netwerkfout stoppen (rest blijft staan), bij een blijvende serverfout een
// paar keer proberen en daarna opgeven. Merge tegen een verse read.
async function flushAux(key, uid, send, label) {
  const arr = readKey(key);
  if (!arr.length) return;
  const outcome = new Map(); // index-key -> "sent" | "failed" | { attempts }
  const idOf = (it) => it.check?.id || it.rideId || it.entry?.id;
  for (const item of arr) {
    const id = idOf(item);
    if (item.uid !== uid || !id) continue; // andermans item: laten staan
    try {
      await send(item);
      outcome.set(id, "sent");
    } catch (e) {
      if (isNetworkError(e)) break;
      const attempts = (item.attempts || 0) + 1;
      if (attempts < MAX_ATTEMPTS) outcome.set(id, { attempts });
      else { outcome.set(id, "failed"); console.error(`${label} definitief niet verstuurd:`, id, e?.message || e); }
    }
  }
  const merged = readKey(key)
    .filter((it) => { const o = outcome.get(idOf(it)); return o !== "sent" && o !== "failed"; })
    .map((it) => { const o = outcome.get(idOf(it)); return o && typeof o === "object" ? { ...it, attempts: o.attempts } : it; });
  writeKey(key, merged);
}

// Probeer de wachtrij te legen. Geeft het aantal succesvol verstuurde meldingen terug.
export async function flushQueue() {
  if (flushing) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  const arr = read();
  if (!arr.length && !readKey(CHECK_KEY).length && !readKey(RIDE_KEY).length && !readKey(FUEL_KEY).length) return 0;
  // Zonder geldige sessie niets proberen (en zeker niets als "poging" tellen):
  // de meldingen blijven staan tot de juiste gebruiker weer ingelogd is.
  let uid = null;
  try {
    const { data } = await supabase.auth.getSession();
    uid = data?.session?.user?.id || null;
  } catch { /* auth even niet bereikbaar */ }
  if (!uid) return 0;
  flushing = true;
  // Per melding bijhouden wat ermee gebeurde; aan het einde mergen we dat
  // tegen een VERSE read, zodat meldingen die tijdens deze (trage) flush
  // werden toegevoegd nooit worden overschreven.
  const outcome = new Map(); // id -> "sent" | "failed" | { attempts }
  let sent = 0;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const id = item.report?.id;
    if (item.uid !== uid || !id) continue; // andermans/onbekende melding: laten staan
    try {
      const { error } = await supabase.rpc("driver_add_report", { p_report: item.report });
      if (error) throw error;
      outcome.set(id, "sent");
      sent++;
    } catch (e) {
      if (isNetworkError(e)) break; // verbinding weg: rest later opnieuw
      const attempts = (item.attempts || 0) + 1;
      if (attempts < MAX_ATTEMPTS) outcome.set(id, { attempts });
      else { outcome.set(id, "failed"); addFailed(item); console.error("Melding definitief niet verstuurd:", id); }
    }
  }
  const fresh = read();
  const merged = fresh
    .filter((it) => { const o = outcome.get(it.report?.id); return o !== "sent" && o !== "failed"; })
    .map((it) => { const o = outcome.get(it.report?.id); return o && typeof o === "object" ? { ...it, attempts: o.attempts } : it; });
  write(merged);
  // Daarna de checks en afleveringen (zelfde sessie, zelfde spelregels).
  try {
    await flushAux(CHECK_KEY, uid, async (it) => {
      const { error } = await supabase.rpc("driver_add_check", { p_check: it.check });
      if (error) throw error;
    }, "Voertuigcheck");
    await flushAux(RIDE_KEY, uid, async (it) => {
      const { error } = await supabase.rpc("driver_complete_ride", { p_ride_id: it.rideId, p_pod: it.pod });
      // Rit inmiddels verwijderd door de beheerder? Dan valt er niets meer af
      // te leveren — item opruimen i.p.v. eeuwig opnieuw proberen.
      if (error && !/RIDE_NOT_FOUND/.test(error.message || "")) throw error;
    }, "Aflevering");
    await flushAux(FUEL_KEY, uid, async (it) => {
      const { error } = await supabase.rpc("driver_add_fuel", { p_entry: it.entry });
      if (error) throw error;
    }, "Tankbeurt");
  } catch { /* volgende flush pakt de rest */ }
  flushing = false;
  notify();
  return sent;
}

const listeners = new Set();
export function onQueueChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { listeners.forEach((fn) => { try { fn(queuedCount()); } catch { /* noop */ } }); }

// Automatisch legen zodra de verbinding terug is.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => { flushQueue(); });
}
