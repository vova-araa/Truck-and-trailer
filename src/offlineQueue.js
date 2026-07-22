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
  const remaining = [];
  let sent = 0;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    // Melding van een ándere gebruiker (of zonder eigenaar uit een oudere
    // versie): bewaren, niet onder deze login versturen.
    if (item.uid !== uid) { remaining.push(item); continue; }
    try {
      const { error } = await supabase.rpc("driver_add_report", { p_report: item.report });
      if (error) throw error;
      sent++;
    } catch (e) {
      if (isNetworkError(e)) {
        // Verbinding weg: dit én de rest bewaren en later opnieuw proberen.
        remaining.push(item, ...arr.slice(i + 1));
        break;
      }
      // Echte (server)fout: teller ophogen; na te veel pogingen droppen zodat
      // één kapotte melding de wachtrij niet blokkeert.
      const attempts = (item.attempts || 0) + 1;
      if (attempts < MAX_ATTEMPTS) remaining.push({ ...item, attempts });
      else console.error("Melding definitief niet verstuurd (opgegeven):", item.report?.id);
    }
  }
  write(remaining);
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
