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

export function enqueueReport(report) {
  const arr = read();
  // Dubbele meldingen (zelfde id) niet nog eens toevoegen.
  if (!arr.some((it) => it.report && it.report.id === report.id)) {
    arr.push({ report, queuedAt: null });
    write(arr);
  }
  notify();
}

let flushing = false;
// Probeer de wachtrij te legen. Geeft het aantal succesvol verstuurde meldingen terug.
export async function flushQueue() {
  if (flushing) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  const arr = read();
  if (!arr.length) return 0;
  flushing = true;
  const remaining = [];
  let sent = 0;
  for (const item of arr) {
    try {
      const { error } = await supabase.rpc("driver_add_report", { p_report: item.report });
      if (error) throw error;
      sent++;
    } catch (e) {
      // Nog steeds netwerkprobleem -> laten staan. Echte fout -> ook laten staan
      // maar niet eindeloos blijven proberen binnen deze ronde.
      remaining.push(item);
      if (isNetworkError(e)) break; // verbinding weg: stop, probeer later opnieuw
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
