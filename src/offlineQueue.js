// Offline-wachtrij voor chauffeursmeldingen.
//
// Chauffeurs werken vaak onderweg met een wisselende verbinding. Als een
// melding niet direct verstuurd kan worden (geen netwerk), bewaren we hem
// lokaal in localStorage en versturen we hem automatisch zodra er weer
// verbinding is. Zo gaat er niets verloren.
import { supabase } from "./supabaseClient.js";

const KEY = "tt_offline_reports_v1";

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(arr) {
  try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch { /* opslag vol/geblokkeerd */ }
}

export function queuedCount() {
  return read().length;
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
// Probeer de wachtrij te legen. Geeft het aantal succesvol verstuurde meldingen terug.
export async function flushQueue() {
  if (flushing) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  const arr = read();
  if (!arr.length) return 0;
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
