// Web-push aan de clientkant.
//
// Beheer/werkplaats kan push-meldingen aanzetten zodat ze een melding krijgen
// bij een nieuwe chauffeursmelding — óók als de app dicht is. De publieke
// VAPID-sleutel komt van de server; de private sleutel blijft op de server.
import { supabase } from "./supabaseClient.js";

const urlB64ToUint8 = (base64) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getPushConfig() {
  try { const r = await fetch("/api/push/config"); return await r.json(); }
  catch { return { enabled: false, publicKey: null }; }
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js"); }
  catch { return null; }
}

export async function isPushSubscribed() {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    return !!(await reg.pushManager.getSubscription());
  } catch { return false; }
}

// Zet push aan: vraag toestemming, registreer de service worker, abonneer en
// meld de subscription aan bij de server. Gooit een Error met nette tekst.
export async function subscribeToPush() {
  if (!pushSupported()) throw new Error("Push wordt niet ondersteund op dit apparaat of deze browser.");
  const cfg = await getPushConfig();
  if (!cfg.enabled || !cfg.publicKey) throw new Error("Push is nog niet geconfigureerd op de server.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Je hebt geen toestemming gegeven voor meldingen.");
  const reg = await registerSW();
  if (!reg) throw new Error("De service worker kon niet starten.");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(cfg.publicKey) });
  }
  const r = await fetch("/api/push/subscribe", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ subscription: sub.toJSON() }) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Kon niet aanmelden op de server."); }
  return true;
}

export async function unsubscribeFromPush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      await fetch("/api/push/unsubscribe", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
  } catch { /* stil */ }
  return true;
}

// Meld het bedrijf (beheer/werkplaats) dat er iets is — best effort.
export async function notifyCompany(payload) {
  try {
    await fetch("/api/push/notify", { method: "POST", headers: await authHeaders(), body: JSON.stringify(payload) });
  } catch { /* stil: push is nooit blokkerend */ }
}
