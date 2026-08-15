import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

/*
  Productie-server voor Truck & Trailer.

  1. Serveert de gebouwde frontend uit dist/.
  2. Biedt POST /api/ai: een veilige proxy naar de Anthropic Messages API.
     De API-key staat alleen hier (ANTHROPIC_API_KEY) en komt nooit in de browser.

  Environment variables:
  - PORT              (Railway zet deze automatisch)
  - ANTHROPIC_API_KEY (nodig voor de AI-functies; zonder key werkt de rest van de app gewoon)
  - ANTHROPIC_MODEL   (optioneel, standaard "claude-opus-4-8")
*/

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, "..", "dist");
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

const apiKeyConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
const anthropic = apiKeyConfigured ? new Anthropic() : null;

const app = express();
app.set("trust proxy", 1); // achter een reverse proxy: gebruik X-Forwarded-For voor req.ip
// Grote body (base64-foto's) mag ALLEEN op /api/ai; overal elders een kleine
// limiet zodat publieke endpoints (bv. /api/contact) geen geheugen-DoS zijn.
app.use("/api/ai", express.json({ limit: "25mb" }));
app.use(express.json({ limit: "200kb" }));

// HTML-escape voor waarden die we in e-mail-HTML interpoleren (voorkomt injectie).
const esc = (s) => String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])).slice(0, 2000);

// Eenvoudige in-memory rate-limiting op /api/ai zodat een publieke deployment
// de Anthropic-key (en kosten) niet kan laten misbruiken.
const RL_WINDOW = 60_000, RL_MAX = Number(process.env.AI_RATE_LIMIT) || 30;
const rlHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (rlHits.get(ip) || []).filter((t) => now - t < RL_WINDOW);
  arr.push(now);
  rlHits.set(ip, arr);
  if (rlHits.size > 5000) { for (const [k, v] of rlHits) if (!v.some((t) => now - t < RL_WINDOW)) rlHits.delete(k); }
  return arr.length > RL_MAX;
}

// --- Supabase admin (service_role): alleen op de server, nooit in de browser ---
const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const adminAuthConfigured = Boolean(SUPA_URL && SERVICE_ROLE);
const supaAdmin = adminAuthConfigured
  ? createClient(SUPA_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

// --- Web-push (VAPID): notificaties ook als de app dicht is ---
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:noreply@truckandtrailer.nl";
const pushConfigured = Boolean(VAPID_PUBLIC && VAPID_PRIVATE && supaAdmin);
if (pushConfigured) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); }
  catch (e) { console.error("VAPID-config ongeldig:", e?.message || e); }
}

const bearer = (req) => (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
// Verifieer de sessie en haal het profiel op (bedrijf + rol). null = ongeldig.
async function verifyUser(token) {
  if (!supaAdmin || !token) return null;
  try {
    const { data: who, error } = await supaAdmin.auth.getUser(token);
    if (error || !who?.user) return null;
    const { data: prof } = await supaAdmin.from("profiles").select("company_id, rol, naam").eq("id", who.user.id).single();
    if (!prof) return null;
    return { userId: who.user.id, company_id: prof.company_id, rol: prof.rol, naam: prof.naam };
  } catch { return null; }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ai: apiKeyConfigured, adminAuth: adminAuthConfigured, push: pushConfigured, resend: Boolean(process.env.RESEND_API_KEY), reminders: Boolean(process.env.CRON_SECRET) });
});

// Beheerder maakt een echt inlogaccount voor een medewerker aan. De service_role
// staat alleen hier. We verifiëren dat de aanvrager écht admin is van zijn bedrijf
// en koppelen de nieuwe gebruiker altijd aan datzelfde bedrijf.
app.post("/api/admin/create-user", async (req, res) => {
  if (rateLimited("mkuser:" + (req.ip || "onbekend"))) {
    return res.status(429).json({ error: "Te veel aanvragen. Wacht even en probeer opnieuw." });
  }
  if (!supaAdmin) {
    return res.status(503).json({ error: "Accounts aanmaken is niet geconfigureerd. Zet SUPABASE_SERVICE_ROLE_KEY (en SUPABASE_URL) op de server." });
  }
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "Niet ingelogd." });

  const { naam, email, wachtwoord, rol, telefoon } = req.body || {};
  const validRol = ["admin", "garage", "chauffeur"].includes(rol) ? rol : "chauffeur";
  if (!naam || !String(naam).trim()) return res.status(400).json({ error: "Naam is verplicht." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) return res.status(400).json({ error: "Geldig e-mailadres is verplicht." });
  if (!wachtwoord || String(wachtwoord).length < 6) return res.status(400).json({ error: "Wachtwoord van minstens 6 tekens is verplicht." });

  try {
    // 1. Wie vraagt dit aan? Verifieer het access-token.
    const { data: who, error: whoErr } = await supaAdmin.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ error: "Sessie ongeldig, log opnieuw in." });

    // 2. Is de aanvrager admin? Haal zijn profiel/bedrijf op.
    const { data: prof, error: profErr } = await supaAdmin
      .from("profiles").select("company_id, rol").eq("id", who.user.id).single();
    if (profErr || !prof) return res.status(403).json({ error: "Geen profiel gevonden." });
    if (prof.rol !== "admin") return res.status(403).json({ error: "Alleen een beheerder mag accounts aanmaken." });

    // 3. Maak het auth-account (meteen bevestigd, zodat de medewerker direct kan inloggen).
    const { data: created, error: cErr } = await supaAdmin.auth.admin.createUser({
      email, password: wachtwoord, email_confirm: true, user_metadata: { naam },
    });
    if (cErr) {
      const dup = /registered|exists|duplicate/i.test(cErr.message || "");
      return res.status(dup ? 409 : 400).json({ error: dup ? "Dit e-mailadres heeft al een account." : cErr.message });
    }

    // 4. Koppel het profiel aan HETZELFDE bedrijf als de beheerder.
    const { error: insErr } = await supaAdmin.from("profiles").insert({
      id: created.user.id, company_id: prof.company_id, naam: String(naam).trim(),
      email, telefoon: telefoon || "", rol: validRol, status: "actief",
    });
    if (insErr) {
      // rol-back: verwijder het net aangemaakte auth-account zodat er geen wees ontstaat
      try { await supaAdmin.auth.admin.deleteUser(created.user.id); } catch {}
      return res.status(500).json({ error: "Account gemaakt maar profiel koppelen mislukte: " + insErr.message });
    }
    res.json({ ok: true, id: created.user.id, rol: validRol });
  } catch (err) {
    console.error("create-user fout:", err);
    res.status(500).json({ error: "Onverwachte serverfout bij het aanmaken van het account." });
  }
});

// Beheerder nodigt een medewerker uit per e-mail. We maken het auth-account
// (nog zonder wachtwoord) en Supabase stuurt een uitnodigingsmail met een link
// waarmee de medewerker zelf een wachtwoord instelt en daarna direct inlogt.
app.post("/api/admin/invite-user", async (req, res) => {
  if (rateLimited("invuser:" + (req.ip || "onbekend"))) {
    return res.status(429).json({ error: "Te veel aanvragen. Wacht even en probeer opnieuw." });
  }
  if (!supaAdmin) {
    return res.status(503).json({ error: "Uitnodigen is niet geconfigureerd. Zet SUPABASE_SERVICE_ROLE_KEY (en SUPABASE_URL) op de server." });
  }
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "Niet ingelogd." });

  const { naam, email, rol, telefoon } = req.body || {};
  const validRol = ["admin", "garage", "chauffeur"].includes(rol) ? rol : "chauffeur";
  if (!naam || !String(naam).trim()) return res.status(400).json({ error: "Naam is verplicht." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) return res.status(400).json({ error: "Geldig e-mailadres is verplicht." });

  try {
    const { data: who, error: whoErr } = await supaAdmin.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ error: "Sessie ongeldig, log opnieuw in." });
    const { data: prof, error: profErr } = await supaAdmin
      .from("profiles").select("company_id, rol").eq("id", who.user.id).single();
    if (profErr || !prof) return res.status(403).json({ error: "Geen profiel gevonden." });
    if (prof.rol !== "admin") return res.status(403).json({ error: "Alleen een beheerder mag uitnodigen." });

    // Link waar de medewerker na het klikken landt (om een wachtwoord te kiezen).
    // ALLEEN een vaste, geconfigureerde URL — nooit de (spoofbare) Origin-header,
    // anders kan een uitnodigings-magic-link naar een vreemd domein wijzen.
    const base = process.env.APP_URL || "https://truckandtrailer.nl";
    const redirectTo = base ? `${base.replace(/\/+$/, "")}/?welkom=1` : undefined;

    const { data: invited, error: invErr } = await supaAdmin.auth.admin.inviteUserByEmail(
      email, { data: { naam }, ...(redirectTo ? { redirectTo } : {}) }
    );
    if (invErr) {
      const dup = /registered|exists|duplicate/i.test(invErr.message || "");
      return res.status(dup ? 409 : 400).json({ error: dup ? "Dit e-mailadres heeft al een account." : invErr.message });
    }

    // Koppel het profiel aan HETZELFDE bedrijf als de beheerder.
    const { error: insErr } = await supaAdmin.from("profiles").insert({
      id: invited.user.id, company_id: prof.company_id, naam: String(naam).trim(),
      email, telefoon: telefoon || "", rol: validRol, status: "uitgenodigd",
    });
    if (insErr) {
      try { await supaAdmin.auth.admin.deleteUser(invited.user.id); } catch {}
      return res.status(500).json({ error: "Uitnodiging verstuurd maar profiel koppelen mislukte: " + insErr.message });
    }
    res.json({ ok: true, id: invited.user.id, rol: validRol });
  } catch (err) {
    console.error("invite-user fout:", err);
    res.status(500).json({ error: "Onverwachte serverfout bij het uitnodigen." });
  }
});

// Beheerder verwijdert een medewerker ECHT (login intrekken), niet alleen uit de
// lijst. Alleen een beheerder, alleen binnen zijn eigen bedrijf, nooit zichzelf
// of een superadmin.
app.post("/api/admin/delete-employee", async (req, res) => {
  if (rateLimited("deluser:" + (req.ip || "onbekend"))) {
    return res.status(429).json({ error: "Te veel aanvragen. Wacht even en probeer opnieuw." });
  }
  if (!supaAdmin) return res.status(503).json({ error: "Niet geconfigureerd (SUPABASE_SERVICE_ROLE_KEY ontbreekt)." });
  const me = await verifyUser(bearer(req));
  if (!me) return res.status(401).json({ error: "Sessie ongeldig, log opnieuw in." });
  if (me.rol !== "admin") return res.status(403).json({ error: "Alleen een beheerder mag medewerkers verwijderen." });
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: "id is verplicht." });
  if (id === me.userId) return res.status(400).json({ error: "Je kunt jezelf niet verwijderen." });
  try {
    const { data: target } = await supaAdmin.from("profiles").select("company_id, is_superadmin").eq("id", id).single();
    if (!target || target.company_id !== me.company_id) return res.status(403).json({ error: "Deze gebruiker hoort niet bij jouw bedrijf." });
    if (target.is_superadmin) return res.status(403).json({ error: "Niet toegestaan." });
    try { await supaAdmin.auth.admin.deleteUser(id); }   // cascade ruimt het profiel op
    catch { await supaAdmin.from("profiles").delete().eq("id", id); }
    res.json({ ok: true });
  } catch (err) {
    console.error("delete-employee fout:", err);
    res.status(500).json({ error: "Onverwachte serverfout bij het verwijderen." });
  }
});

// Platformbeheerder mailt een nieuw bedrijf de activatiecode (bij het aanmaken
// van een gratis/betaald bedrijf). Verstuurd via Resend (RESEND_API_KEY).
app.post("/api/admin/send-activation-email", async (req, res) => {
  if (rateLimited("sendcode:" + (req.ip || "onbekend"))) {
    return res.status(429).json({ error: "Te veel aanvragen. Wacht even en probeer opnieuw." });
  }
  const RESEND = process.env.RESEND_API_KEY || "";
  if (!supaAdmin) return res.status(503).json({ error: "Niet geconfigureerd (SUPABASE_SERVICE_ROLE_KEY ontbreekt)." });
  if (!RESEND) return res.status(503).json({ error: "E-mailen is niet geconfigureerd (RESEND_API_KEY ontbreekt op de server)." });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "Niet ingelogd." });
  try {
    const { data: who, error: whoErr } = await supaAdmin.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ error: "Sessie ongeldig, log opnieuw in." });
    const { data: prof, error: pErr } = await supaAdmin.from("profiles").select("is_superadmin").eq("id", who.user.id).single();
    if (pErr || !prof?.is_superadmin) return res.status(403).json({ error: "Alleen de platformbeheerder mag dit." });

    const { email, code, companyName, adminNaam } = req.body || {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) return res.status(400).json({ error: "Geldig e-mailadres is verplicht." });
    if (!code || !/^\d{6,}$/.test(String(code))) return res.status(400).json({ error: "Geldige code is verplicht." });

    const appUrl = (process.env.APP_URL || "https://truckandtrailer.nl").replace(/\/+$/, "");
    const naam = esc((adminNaam || "").trim());
    const bedrijf = esc((companyName || "je bedrijf").trim());
    const pretty = String(code).replace(/(\d{4})(?=\d)/g, "$1 ");
    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a2129">
  <h1 style="font-size:20px;margin:0 0 8px">TRUCK &amp; TRAILER</h1>
  <p style="font-size:15px;line-height:1.5;margin:16px 0">${naam ? "Hallo " + naam + "," : "Hallo,"}</p>
  <p style="font-size:15px;line-height:1.5;margin:16px 0">Je bent uitgenodigd om <b>${bedrijf}</b> te activeren op Truck &amp; Trailer — vloot- en werkplaatsbeheer voor transportbedrijven.</p>
  <p style="font-size:14px;line-height:1.5;margin:16px 0">Je activatiecode:</p>
  <div style="font-family:'Courier New',monospace;font-size:26px;font-weight:bold;letter-spacing:3px;background:#f2f5f9;border:1px solid #d7dee7;border-radius:10px;padding:16px;text-align:center;color:#0A0E14">${pretty}</div>
  <p style="margin:24px 0">
    <a href="${appUrl}/" style="background:#3B82F6;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block">Bedrijf activeren</a>
  </p>
  <p style="font-size:12.5px;color:#667085;line-height:1.5;margin:16px 0 0">Ga naar <a href="${appUrl}/" style="color:#3B82F6">${appUrl.replace(/^https?:\/\//, "")}</a>, kies <b>"Bedrijf activeren"</b> en voer de code hierboven in. Daarna maak je je beheerdersaccount aan en kun je meteen aan de slag.</p>
  <p style="font-size:12px;color:#98a1b0;margin-top:24px">Niet verwacht? Dan kun je deze mail negeren.</p>
</div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Truck & Trailer <noreply@truckandtrailer.nl>", to: [email], subject: `Activeer ${bedrijf} op Truck & Trailer`, html }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return res.status(502).json({ error: "Kon de mail niet versturen via Resend: " + t.slice(0, 200) });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("send-activation-email fout:", err);
    res.status(500).json({ error: "Onverwachte serverfout bij het mailen van de code." });
  }
});

app.post("/api/ai", async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: "AI is niet geconfigureerd. Zet ANTHROPIC_API_KEY in de server-omgeving." });
  }
  // AI vereist een geverifieerde, ingelogde gebruiker met een profiel. Kunnen we
  // sessies niet verifiëren (geen service_role), dan sluiten we AI AF (fail
  // closed) i.p.v. 'm open te zetten voor de hele wereld — zo kan niemand van
  // buitenaf de AI-credits verbruiken.
  if (!supaAdmin) {
    return res.status(503).json({ error: "AI is niet volledig geconfigureerd (SUPABASE_SERVICE_ROLE_KEY ontbreekt op de server)." });
  }
  // Per-IP-limiet VÓÓR de sessie-verificatie: anders kan een niet-ingelogde
  // aanvaller met nep-tokens onbeperkt (dure) Supabase-Auth-calls uitlokken.
  if (rateLimited("aiip:" + (req.ip || "?"))) {
    return res.status(429).json({ error: "Te veel aanvragen, wacht even." });
  }
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "Log in om de AI te gebruiken." });
  let userId;
  try {
    const { data: who, error } = await supaAdmin.auth.getUser(token);
    if (error || !who?.user) return res.status(401).json({ error: "Sessie ongeldig, log opnieuw in." });
    userId = who.user.id;
    // Alleen echte app-gebruikers (met een profiel bij een bedrijf) mogen de AI
    // gebruiken — niet zomaar elke auth-gebruiker.
    const { data: prof, error: pErr } = await supaAdmin.from("profiles").select("company_id").eq("id", userId).single();
    if (pErr || !prof) return res.status(403).json({ error: "Geen profiel gevonden voor deze gebruiker." });
  } catch {
    return res.status(401).json({ error: "Kon sessie niet verifiëren." });
  }
  // Rate limit per gebruiker (naast/i.p.v. per-IP), zodat één account de credits
  // niet kan leegtrekken.
  if (rateLimited("ai:" + userId)) {
    return res.status(429).json({ error: `Te veel AI-aanvragen (max ${RL_MAX}/min). Wacht even en probeer opnieuw.` });
  }
  const { messages, system, max_tokens: maxTokens } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages is verplicht." });
  }
  // Input begrenzen: de app stuurt korte prompts plus hooguit één foto
  // (base64 ≤ ~7 MB, de AI-API accepteert toch niet meer). Zonder cap kan één
  // account requests tot de 25MB-bodylimiet sturen en de AI-kosten opdrijven.
  if (messages.length > 40) {
    return res.status(400).json({ error: "Te veel berichten in één aanvraag." });
  }
  let inputSize = 0;
  try { inputSize = JSON.stringify(messages).length + (system ? JSON.stringify(system).length : 0); } catch { inputSize = Infinity; }
  if (inputSize > 8000000) {
    return res.status(400).json({ error: "Aanvraag te groot." });
  }
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: Math.min(Math.max(1, Number(maxTokens) || 1000), 4096),
      ...(system ? { system } : {}),
      messages,
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    res.json({ text, model: response.model, stop_reason: response.stop_reason });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "AI is even overbelast, probeer het zo opnieuw." });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: "AI-key is ongeldig. Controleer ANTHROPIC_API_KEY." });
    }
    if (err instanceof Anthropic.APIError) {
      return res.status(502).json({ error: `AI-fout (${err.status}): ${err.message}` });
    }
    console.error("AI-proxy fout:", err);
    res.status(500).json({ error: "Onverwachte serverfout bij de AI-aanvraag." });
  }
});

// ---------- CONTACT / TOEGANG AANVRAGEN (landingspagina) ----------
// Bezoekers vragen via het formulier op de landingspagina toegang aan. We mailen
// dit naar CONTACT_EMAIL (val terug op info@truckandtrailer.nl). Openbaar
// endpoint, dus rate-limited + simpele validatie tegen misbruik.
app.post("/api/contact", async (req, res) => {
  if (rateLimited("contact:" + (req.ip || "onbekend"))) {
    return res.status(429).json({ error: "Te veel aanvragen. Wacht even en probeer opnieuw." });
  }
  const RESEND = process.env.RESEND_API_KEY || "";
  if (!RESEND) return res.status(503).json({ error: "E-mailen is niet geconfigureerd (RESEND_API_KEY ontbreekt)." });
  const to = process.env.CONTACT_EMAIL || "info@truckandtrailer.nl";
  const { naam, bedrijf, email, telefoon, bericht } = req.body || {};
  if (!naam || !String(naam).trim()) return res.status(400).json({ error: "Naam is verplicht." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) return res.status(400).json({ error: "Geldig e-mailadres is verplicht." });
  try {
    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#1a2129">
  <h2 style="font-size:18px;margin:0 0 12px">Nieuwe toegangsaanvraag — Truck &amp; Trailer</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;color:#667085;width:110px">Naam</td><td style="padding:6px 0;font-weight:bold">${esc(naam)}</td></tr>
    <tr><td style="padding:6px 0;color:#667085">Bedrijf</td><td style="padding:6px 0">${esc(bedrijf) || "—"}</td></tr>
    <tr><td style="padding:6px 0;color:#667085">E-mail</td><td style="padding:6px 0">${esc(email)}</td></tr>
    <tr><td style="padding:6px 0;color:#667085">Telefoon</td><td style="padding:6px 0">${esc(telefoon) || "—"}</td></tr>
  </table>
  <p style="font-size:14px;margin:14px 0 4px;color:#667085">Bericht</p>
  <div style="font-size:14px;background:#f2f5f9;border:1px solid #d7dee7;border-radius:8px;padding:12px;white-space:pre-wrap">${esc(bericht) || "—"}</div>
</div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Truck & Trailer <noreply@truckandtrailer.nl>", to: [to], reply_to: email, subject: `Toegangsaanvraag: ${String(naam).trim()}${bedrijf ? " — " + String(bedrijf).trim() : ""}`, html }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ""); return res.status(502).json({ error: "Kon de aanvraag niet versturen: " + t.slice(0, 160) }); }
    res.json({ ok: true });
  } catch (err) {
    console.error("contact fout:", err);
    res.status(500).json({ error: "Onverwachte serverfout bij het versturen." });
  }
});

// ---------- HERINNERINGEN: APK / verzekering / tacho verloopt ----------
// Een dagelijkse cron (bv. cron-job.org of een Render Cron Job) roept deze
// endpoint aan met ?key=CRON_SECRET. We kijken per bedrijf welke voertuigen
// binnenkort een verlopende keuring/verzekering hebben en mailen de beheerder.
// Stateless: we mailen alleen op vaste mijlpalen (30/14/7/3/1/0 dagen) zodat er
// niet elke dag een mail uitgaat.
const REMINDER_MILESTONES = [30, 14, 7, 3, 1, 0];

async function sendResendEmail(to, subject, html) {
  const RESEND = process.env.RESEND_API_KEY || "";
  if (!RESEND) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Truck & Trailer <noreply@truckandtrailer.nl>", to: [to], subject, html }),
  });
  return r.ok;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b - a) / 86400000);
}

// ---------- RDW-AUTOSYNC: APK-datums automatisch actueel houden ----------
// Gratis open data van de RDW (geen key nodig). De cron haalt per bedrijf de
// APK-vervaldatums op voor alle kentekens en werkt ze bij in company_state —
// niemand hoeft ooit nog een APK-datum over te typen of te missen. Draait
// VOOR de herinneringen, zodat die meteen op de verse datums werken.

const RDW_URL = "https://opendata.rdw.nl/resource/m9d7-ebf2.json";
const rdwPlate = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const rdwYmd = (s) => (s && s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "");

// Haal RDW-records op voor een lijst kentekens (in blokken van 50).
async function rdwFetchPlates(plates) {
  const map = {};
  for (let i = 0; i < plates.length; i += 50) {
    const chunk = plates.slice(i, i + 50);
    const where = `kenteken in(${chunk.map((p) => `'${p}'`).join(",")})`;
    const url = `${RDW_URL}?$select=kenteken,vervaldatum_apk,merk,handelsbenaming,datum_eerste_toelating&$where=${encodeURIComponent(where)}`;
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) continue; // RDW even niet bereikbaar: sla dit blok over
      const rows = await r.json();
      if (Array.isArray(rows)) rows.forEach((row) => { if (row.kenteken) map[row.kenteken] = row; });
    } catch { /* netwerk: overslaan, volgende run opnieuw */ }
  }
  return map;
}

// ---------- PUBLIEKE RDW VLOOT-CHECK (leadmagneet) ----------
// Zonder account: plak je kentekens en zie direct welke APK's (bijna) verlopen.
// Gebruikt dezelfde gratis RDW open data als de nachtelijke sync. Publiek maar
// begrensd: per-IP rate limit en maximaal 50 kentekens per aanvraag.
app.post("/api/vloot-check", async (req, res) => {
  if (rateLimited("vc:" + (req.ip || "?"))) {
    return res.status(429).json({ error: "Te veel aanvragen — probeer het over een minuut opnieuw." });
  }
  const raw = req.body?.kentekens;
  if (!Array.isArray(raw) || raw.length === 0) {
    return res.status(400).json({ error: "Geef een lijst kentekens mee." });
  }
  const plates = [...new Set(raw.map((p) => rdwPlate(p)).filter((p) => p.length >= 4 && p.length <= 8))].slice(0, 50);
  if (!plates.length) return res.status(400).json({ error: "Geen geldige kentekens gevonden." });
  try {
    const map = await rdwFetchPlates(plates);
    const results = plates.map((p) => {
      const rec = map[p];
      if (!rec) return { kenteken: p, gevonden: false };
      const apk = rdwYmd(rec.vervaldatum_apk || "");
      return {
        kenteken: p,
        gevonden: true,
        merk: [rec.merk, rec.handelsbenaming].filter(Boolean).join(" "),
        apk,
        dagen: apk ? daysUntil(apk) : null,
      };
    });
    res.json({ results });
  } catch (e) {
    console.error("vloot-check fout:", e?.message || e);
    res.status(502).json({ error: "RDW is even niet bereikbaar — probeer het later opnieuw." });
  }
});

// Werk één lijst voertuigen/trailers bij met RDW-data. Muteert niets: geeft
// een nieuwe lijst + het aantal wijzigingen terug. APK-datum is leidend
// (de RDW wéét het); merk/bouwjaar alleen invullen als ze nog leeg zijn.
function rdwApplyTo(list, rdwMap, todayIso) {
  if (!Array.isArray(list)) return { list, changed: 0 };
  let changed = 0;
  const out = list.map((v) => {
    const rec = rdwMap[rdwPlate(v?.kenteken)];
    if (!rec) return v;
    let nv = v;
    const apk = rdwYmd(rec.vervaldatum_apk);
    if (apk && apk !== (v.apkTot || "")) { nv = { ...nv, apkTot: apk }; }
    if (!v.merk && (rec.merk || rec.handelsbenaming)) {
      nv = nv === v ? { ...nv } : nv;
      nv.merk = [rec.merk, rec.handelsbenaming].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    }
    if (!v.bouwjaar && rec.datum_eerste_toelating) {
      nv = nv === v ? { ...nv } : nv;
      nv.bouwjaar = Number(String(rec.datum_eerste_toelating).slice(0, 4)) || v.bouwjaar;
    }
    if (nv !== v) { changed++; return { ...nv, rdwSync: todayIso }; }
    return v;
  });
  return { list: out, changed };
}

app.all("/api/cron/reminders", async (req, res) => {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return res.status(503).json({ error: "CRON_SECRET niet ingesteld op de server." });
  const given = String(req.query.key || (req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  // Constante-tijd vergelijking tegen timing-aanvallen.
  const a = Buffer.from(given), b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Ongeldige sleutel." });
  if (!supaAdmin) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY ontbreekt." });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: "RESEND_API_KEY ontbreekt." });
  try {
    // Fouten in deze queries mogen NOOIT als "ok" doortellen: dan zou de
    // cron-dienst succes zien terwijl er nul herinneringen zijn verstuurd.
    // PostgREST capt bovendien op 1000 rijen — pagineer, anders vallen
    // bedrijven boven die grens stilletjes buiten sync én herinneringen.
    const pageAll = async (table, cols, filter) => {
      const all = [];
      for (let from = 0; ; from += 1000) {
        let q = supaAdmin.from(table).select(cols).range(from, from + 999);
        if (filter) q = filter(q);
        const { data, error } = await q;
        if (error) throw new Error(`${table}-query mislukt: ${error.message}`);
        all.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return all;
    };
    // Beheerder-e-mail per bedrijf (voorkeur: bedrijfsprofiel, anders admin-profiel).
    const admins = await pageAll("profiles", "company_id, email, naam, rol", (q) => q.eq("rol", "admin"));
    const adminByCompany = {};
    (admins || []).forEach((a) => { if (a.company_id && a.email && !adminByCompany[a.company_id]) adminByCompany[a.company_id] = a; });

    const states = await pageAll("company_state", "company_id, data");

    // STAP 1 — RDW-autosync: APK-datums (en ontbrekend merk/bouwjaar) verversen
    // vanaf de officiële open data, per bedrijf. Fouten per bedrijf breken de
    // rest niet; bij RDW-storing draait alleen de herinneringen-stap.
    let rdwVehiclesUpdated = 0, rdwCompaniesUpdated = 0;
    const todayIso = new Date().toISOString().slice(0, 10);
    for (const row of (states || [])) {
      try {
        const plates = [...(Array.isArray(row.data?.vehicles) ? row.data.vehicles : []), ...(Array.isArray(row.data?.trailers) ? row.data.trailers : [])]
          .map((v) => rdwPlate(v?.kenteken)).filter(Boolean);
        if (!plates.length) continue;
        const rdwMap = await rdwFetchPlates([...new Set(plates)]);
        if (!Object.keys(rdwMap).length) continue;
        // De RDW-fetches hierboven zijn traag; lees de rij daarom VLAK vóór het
        // schrijven opnieuw en schrijf alleen als er intussen niets veranderde
        // (voorwaarde op updated_at). Anders zouden we een net binnengekomen
        // melding/check/POD overschrijven — precies wat de merge-RPC's voorkomen.
        const { data: freshRow } = await supaAdmin.from("company_state")
          .select("data, updated_at").eq("company_id", row.company_id).single();
        if (!freshRow) continue;
        const data = freshRow.data || {};
        // Ook als de update straks niet doorgaat: stap 2 (herinneringen) hoort
        // op de meest actuele data te draaien, niet op de bulk-read van vóór
        // de trage RDW-fetches.
        row.data = data;
        const veh = rdwApplyTo(data.vehicles, rdwMap, todayIso);
        const trl = rdwApplyTo(data.trailers, rdwMap, todayIso);
        if (veh.changed + trl.changed > 0) {
          const newData = { ...data, vehicles: veh.list, trailers: trl.list };
          const { data: updated, error } = await supaAdmin.from("company_state")
            .update({ data: newData, updated_at: new Date().toISOString() })
            .eq("company_id", row.company_id)
            .eq("updated_at", freshRow.updated_at)
            .select("company_id");
          // 0 rijen geraakt = er kwam nét iets tussendoor; volgende nacht opnieuw.
          if (!error && Array.isArray(updated) && updated.length > 0) {
            row.data = newData; // de herinneringen-stap hieronder gebruikt de verse datums
            rdwVehiclesUpdated += veh.changed + trl.changed;
            rdwCompaniesUpdated++;
          }
        } else {
          row.data = data; // herinneringen op de meest actuele data
        }
      } catch (e) { console.error("RDW-sync fout voor bedrijf:", row.company_id, e?.message || e); }
    }

    // STAP 2 — herinneringen op basis van de (zojuist ververste) datums:
    // voertuigkeuringen, chauffeurspapieren én documenten met een vervaldatum.
    let companiesMailed = 0, itemsFound = 0;
    const CHECKS = [
      { veld: "apkTot", label: "APK" },
      { veld: "verzekeringTot", label: "Verzekering" },
      { veld: "tachoTot", label: "Tachograaf" },
    ];
    const DRIVER_CHECKS = [
      { veld: "rijbewijsTot", label: "Rijbewijs C/CE" },
      { veld: "code95Tot", label: "Code 95" },
      { veld: "medischTot", label: "Medische keuring", skip: (d) => d.medischNvt },
      { veld: "adrTot", label: "ADR-certificaat", skip: (d) => d.adrNvt },
    ];
    const adminEmailFor = (row, profiel) => adminByCompany[row.company_id]?.email
      || ((profiel.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profiel.email)) ? profiel.email : null);
    for (const row of (states || [])) {
      const data = row.data || {};
      const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
      const drivers = Array.isArray(data.drivers) ? data.drivers : [];
      const profiel = data.bedrijfsprofiel || {};
      // Voorkeur: het e-mailadres van het ADMIN-profiel (alleen door de beheerder
      // zelf te wijzigen). Het bedrijfsprofiel is door de werkplaats aanpasbaar
      // en dient alleen als vangnet als er geen admin-adres bekend is.
      const to = adminEmailFor(row, profiel);
      if (!to) continue;
      let items = [];
      for (const v of vehicles) {
        for (const c of CHECKS) {
          if (c.veld === "tachoTot" && !v.tachoPlicht) continue;
          const dl = daysUntil(v[c.veld]);
          if (dl != null && REMINDER_MILESTONES.includes(dl)) {
            items.push({ kenteken: v.kenteken, merk: v.merk || "", type: c.label, datum: v[c.veld], dagen: dl, key: `${v.kenteken}|${c.veld}|${v[c.veld]}|${dl}` });
          }
        }
        // Documenten met een "geldig tot"-datum (polis, vergunning, ...).
        for (const doc of (Array.isArray(v.documenten) ? v.documenten : [])) {
          if (!doc || !doc.geldigTot) continue;
          const dl = daysUntil(doc.geldigTot);
          if (dl != null && REMINDER_MILESTONES.includes(dl)) {
            items.push({ kenteken: v.kenteken, type: `Document: ${String(doc.name || "document").slice(0, 40)}`, datum: doc.geldigTot, dagen: dl, key: `doc|${v.kenteken}|${doc.path || doc.name}|${doc.geldigTot}|${dl}` });
          }
        }
      }
      // Chauffeurspapieren: rijbewijs, Code 95, medische keuring, ADR.
      for (const d of drivers) {
        for (const c of DRIVER_CHECKS) {
          if (c.skip && c.skip(d)) continue;
          const dl = daysUntil(d[c.veld]);
          if (dl != null && REMINDER_MILESTONES.includes(dl)) {
            items.push({ kenteken: d.naam || "Chauffeur", type: c.label, datum: d[c.veld], dagen: dl, key: `drv|${d.id || d.naam}|${c.veld}|${d[c.veld]}|${dl}` });
          }
        }
      }
      if (!items.length) continue;
      // Dedupe: sla over wat vandaag al gemaild is (retry van de cron-dienst of
      // een handmatige trigger mag niet nóg een mail opleveren). Als de
      // reminder_log-tabel nog niet bestaat (oudere database), mailen we gewoon.
      try {
        const { data: logged, error: logErr } = await supaAdmin
          .from("reminder_log").select("item_key")
          .eq("company_id", row.company_id)
          .eq("sent_on", new Date().toISOString().slice(0, 10));
        if (!logErr && Array.isArray(logged)) {
          const done = new Set(logged.map((l) => l.item_key));
          items = items.filter((it) => !done.has(it.key));
        }
      } catch { /* tabel ontbreekt: geen dedupe, wel mailen */ }
      if (!items.length) continue;
      itemsFound += items.length;
      const bedrijf = esc(profiel.bedrijfsnaam || adminByCompany[row.company_id]?.naam || "je vloot");
      const rows = items.map((it) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #eef1f5;font-weight:bold;color:#0A0E14">${esc(it.kenteken)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eef1f5;color:#475467">${esc(it.type)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eef1f5;color:#475467">${esc(it.datum)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eef1f5;color:${it.dagen <= 3 ? "#F0453F" : "#B54708"};font-weight:bold">${it.dagen === 0 ? "vandaag" : it.dagen + " dagen"}</td>
        </tr>`).join("");
      const appUrl = (process.env.APP_URL || "https://truckandtrailer.nl").replace(/\/+$/, "");
      const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a2129">
  <h1 style="font-size:20px;margin:0 0 4px">TRUCK &amp; TRAILER</h1>
  <p style="font-size:15px;line-height:1.5;margin:16px 0">Herinnering: bij <b>${bedrijf}</b> verlopen binnenkort keuringen, verzekeringen of papieren.</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0">
    <thead><tr>
      <th style="text-align:left;padding:8px 10px;border-bottom:2px solid #d7dee7;color:#667085">Voertuig / chauffeur</th>
      <th style="text-align:left;padding:8px 10px;border-bottom:2px solid #d7dee7;color:#667085">Type</th>
      <th style="text-align:left;padding:8px 10px;border-bottom:2px solid #d7dee7;color:#667085">Verloopt</th>
      <th style="text-align:left;padding:8px 10px;border-bottom:2px solid #d7dee7;color:#667085">Nog</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin:20px 0"><a href="${appUrl}/app/vrachtwagens" style="background:#3B82F6;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block">Bekijk je vloot</a></p>
  <p style="font-size:12px;color:#98a1b0;margin-top:20px">Je krijgt deze mail omdat je beheerder bent in Truck &amp; Trailer.</p>
</div>`;
      const ok = await sendResendEmail(to, `Herinnering: keuring of papieren verlopen binnenkort (${items.length})`, html);
      if (ok) {
        companiesMailed++;
        // Vastleggen wat verstuurd is, zodat een herhaalde aanroep vandaag niets
        // dubbel mailt. Faalt dit (tabel ontbreekt), dan is dat niet erg.
        try {
          await supaAdmin.from("reminder_log").upsert(
            items.map((it) => ({ company_id: row.company_id, item_key: it.key, sent_on: new Date().toISOString().slice(0, 10) })),
            { onConflict: "company_id,item_key,sent_on", ignoreDuplicates: true }
          );
        } catch { /* geen dedupe-log beschikbaar */ }
      }
    }
    // STAP 3 — weekoverzicht: elke maandag één samenvattingsmail per bedrijf
    // (meldingen, ritten, kosten, uren en wat er de komende maand verloopt).
    // Handmatig af te dwingen met ?weekly=1 (voor testen).
    let weeklyMailed = 0;
    const amsWeekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/Amsterdam" }).format(new Date());
    if (amsWeekday === "Mon" || String(req.query.weekly || "") === "1") {
      const todayIso2 = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const weekKey = `weekly|${todayIso2}`;
      // "HH:MM"-verschil in minuten (nachtdienst +24u, pauze 45 min eraf).
      const workedMin = (start, eind, pauze) => {
        const p = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
        const a = p(start), b = p(eind);
        if (a == null || b == null || a === b) return 0;
        let d = b - a; if (d < 0) d += 1440;
        return Math.max(0, d - (pauze ? 45 : 0));
      };
      const fmtUren = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
      for (const row of (states || [])) {
        const data = row.data || {};
        const profiel = data.bedrijfsprofiel || {};
        const to = adminEmailFor(row, profiel);
        if (!to) continue;
        const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
        const reports = Array.isArray(data.reports) ? data.reports : [];
        if (!vehicles.length && !reports.length) continue; // slapend/leeg bedrijf: geen mail
        // Dedupe: deze week al verstuurd? (retry van de cron mag niet dubbel mailen)
        try {
          const { data: logged } = await supaAdmin.from("reminder_log").select("item_key")
            .eq("company_id", row.company_id).eq("sent_on", todayIso2).eq("item_key", weekKey);
          if (Array.isArray(logged) && logged.length) continue;
        } catch { /* geen log-tabel: gewoon mailen */ }
        const rides = Array.isArray(data.rides) ? data.rides : [];
        const costs = Array.isArray(data.costs) ? data.costs : [];
        const uren = Array.isArray(data.uren) ? data.uren : [];
        const drivers = Array.isArray(data.drivers) ? data.drivers : [];
        const openMeldingen = reports.filter((r) => r.status !== "klaar").length;
        const kritiek = reports.filter((r) => r.status !== "klaar" && r.prioriteit === "kritiek").length;
        const nieuwWeek = reports.filter((r) => (r.datum || "") >= weekAgo).length;
        const afgeleverd = rides.filter((r) => r.status === "afgeleverd" && ((r.pod && r.pod.datum) || r.datum || "") >= weekAgo).length;
        const kostenWeek = costs.filter((c) => (c.datum || "") >= weekAgo).reduce((a, c) => a + (Number(c.bedrag) || 0), 0);
        const urenWeek = uren.filter((u) => (u.datum || "") >= weekAgo).reduce((a, u) => a + workedMin(u.start, u.eind, u.pauze), 0);
        // Wat verloopt er de komende 30 dagen (keuringen, papieren, documenten)?
        const expiring = [];
        for (const v of vehicles) {
          for (const c of CHECKS) {
            if (c.veld === "tachoTot" && !v.tachoPlicht) continue;
            const dl = daysUntil(v[c.veld]);
            if (dl != null && dl >= 0 && dl <= 30) expiring.push({ wat: v.kenteken, type: c.label, dagen: dl });
          }
          for (const doc of (Array.isArray(v.documenten) ? v.documenten : [])) {
            if (!doc || !doc.geldigTot) continue;
            const dl = daysUntil(doc.geldigTot);
            if (dl != null && dl >= 0 && dl <= 30) expiring.push({ wat: v.kenteken, type: `Document: ${String(doc.name || "document").slice(0, 30)}`, dagen: dl });
          }
        }
        for (const d of drivers) {
          for (const c of DRIVER_CHECKS) {
            if (c.skip && c.skip(d)) continue;
            const dl = daysUntil(d[c.veld]);
            if (dl != null && dl >= 0 && dl <= 30) expiring.push({ wat: d.naam || "Chauffeur", type: c.label, dagen: dl });
          }
        }
        expiring.sort((a, b) => a.dagen - b.dagen);
        const bedrijf = esc(profiel.bedrijfsnaam || adminByCompany[row.company_id]?.naam || "je bedrijf");
        const appUrl = (process.env.APP_URL || "https://truckandtrailer.nl").replace(/\/+$/, "");
        const stat = (label, value) => `<td style="padding:10px 12px;border:1px solid #eef1f5;border-radius:8px"><div style="font-size:20px;font-weight:bold;color:#0A0E14">${value}</div><div style="font-size:12px;color:#667085">${label}</div></td>`;
        const expRows = expiring.slice(0, 10).map((e) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eef1f5;font-weight:bold;color:#0A0E14">${esc(e.wat)}</td><td style="padding:6px 10px;border-bottom:1px solid #eef1f5;color:#475467">${esc(e.type)}</td><td style="padding:6px 10px;border-bottom:1px solid #eef1f5;color:${e.dagen <= 7 ? "#F0453F" : "#B54708"};font-weight:bold">${e.dagen === 0 ? "vandaag" : `over ${e.dagen} dagen`}</td></tr>`).join("");
        const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a2129">
  <h1 style="font-size:20px;margin:0 0 4px">TRUCK &amp; TRAILER</h1>
  <p style="font-size:15px;line-height:1.5;margin:16px 0">Je weekoverzicht voor <b>${bedrijf}</b>:</p>
  <table style="width:100%;border-collapse:separate;border-spacing:6px;font-size:13px"><tr>
    ${stat("Open meldingen", openMeldingen)}${stat("Waarvan kritiek", kritiek)}${stat("Nieuw deze week", nieuwWeek)}
  </tr><tr>
    ${stat("Ritten afgeleverd", afgeleverd)}${stat("Kosten deze week", "€ " + Math.round(kostenWeek).toLocaleString("nl-NL"))}${stat("Uren geregistreerd", fmtUren(urenWeek))}
  </tr></table>
  ${expiring.length ? `
  <p style="font-size:14px;font-weight:bold;margin:18px 0 6px">Verloopt de komende 30 dagen:</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px">${expRows}</table>
  ${expiring.length > 10 ? `<p style="font-size:12px;color:#667085">+ nog ${expiring.length - 10} andere — zie de app.</p>` : ""}` : `
  <p style="font-size:13px;color:#12B76A;margin:18px 0 6px">Er verloopt de komende 30 dagen niets — alles is op orde.</p>`}
  <p style="margin:20px 0"><a href="${appUrl}/app" style="background:#3B82F6;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block">Open het dashboard</a></p>
  <p style="font-size:12px;color:#98a1b0;margin-top:20px">Je krijgt dit weekoverzicht elke maandag omdat je beheerder bent in Truck &amp; Trailer.</p>
</div>`;
        const ok = await sendResendEmail(to, `Weekoverzicht ${profiel.bedrijfsnaam || ""}`.trim(), html);
        if (ok) {
          weeklyMailed++;
          try {
            await supaAdmin.from("reminder_log").upsert(
              [{ company_id: row.company_id, item_key: weekKey, sent_on: todayIso2 }],
              { onConflict: "company_id,item_key,sent_on", ignoreDuplicates: true }
            );
          } catch { /* geen dedupe-log */ }
        }
      }
    }
    res.json({ ok: true, companiesMailed, itemsFound, weeklyMailed, rdwCompaniesUpdated, rdwVehiclesUpdated });
  } catch (err) {
    console.error("reminders-cron fout:", err);
    res.status(500).json({ error: "Onverwachte serverfout bij herinneringen." });
  }
});

// ---------- WEB-PUSH ENDPOINTS ----------

// De browser haalt de publieke VAPID-sleutel op (die mag publiek zijn).
app.get("/api/push/config", (_req, res) => {
  res.json({ enabled: pushConfigured, publicKey: pushConfigured ? VAPID_PUBLIC : null });
});

// Een ingelogde gebruiker meldt zijn browser aan voor push. We bewaren de
// subscription (server-side, via service_role) samen met bedrijf en rol.
app.post("/api/push/subscribe", async (req, res) => {
  if (!pushConfigured) return res.status(503).json({ error: "Push is niet geconfigureerd op de server." });
  const me = await verifyUser(bearer(req));
  if (!me) return res.status(401).json({ error: "Log in om push aan te zetten." });
  const sub = req.body?.subscription;
  if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: "Ongeldige subscription." });
  // Alleen echte push-diensten accepteren: anders zou de server bij elke
  // notify blind POST'en naar een door de gebruiker gekozen (intern) adres.
  let host = "";
  try { const u = new URL(sub.endpoint); if (u.protocol !== "https:") throw new Error(); host = u.hostname; } catch { return res.status(400).json({ error: "Ongeldig endpoint." }); }
  const okHost = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(host)
    || host.endsWith(".googleapis.com") || host.endsWith(".notify.windows.com") || host.endsWith(".push.apple.com")
    || host.endsWith(".push.services.mozilla.com");
  if (!okHost) return res.status(400).json({ error: "Onbekende push-dienst." });
  // Eigendomscheck: een bestaand endpoint van een ándere gebruiker mag je niet
  // overschrijven (anders kap je andermans meldingen af).
  const { data: existing } = await supaAdmin.from("push_subscriptions").select("user_id").eq("endpoint", sub.endpoint).maybeSingle();
  if (existing && existing.user_id && existing.user_id !== me.userId) {
    return res.status(403).json({ error: "Dit endpoint is al aan een andere gebruiker gekoppeld." });
  }
  const { error } = await supaAdmin.from("push_subscriptions").upsert(
    { endpoint: sub.endpoint, user_id: me.userId, company_id: me.company_id, rol: me.rol, keys: sub.keys },
    { onConflict: "endpoint" }
  );
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Afmelden voor push (endpoint verwijderen).
app.post("/api/push/unsubscribe", async (req, res) => {
  if (!pushConfigured) return res.status(503).json({ error: "Push is niet geconfigureerd." });
  const me = await verifyUser(bearer(req));
  if (!me) return res.status(401).json({ error: "Log in om je af te melden." });
  const endpoint = req.body?.endpoint;
  if (!endpoint) return res.status(400).json({ error: "endpoint is verplicht." });
  // Alleen je eigen subscription mag je verwijderen (voorkomt IDOR/DoS).
  await supaAdmin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", me.userId);
  res.json({ ok: true });
});

// Stuur een push naar de beheerders/werkplaats van hetzelfde bedrijf (niet naar
// de afzender zelf). Gebruikt door de chauffeur-client na een nieuwe melding.
app.post("/api/push/notify", async (req, res) => {
  if (!pushConfigured) return res.status(503).json({ error: "Push is niet geconfigureerd." });
  const me = await verifyUser(bearer(req));
  if (!me) return res.status(401).json({ error: "Sessie ongeldig." });
  if (rateLimited("push:" + me.userId)) return res.status(429).json({ error: "Te veel meldingen, wacht even." });
  const { title, body, url, toUserId } = req.body || {};
  // Standaard gaat een push naar beheer/werkplaats van het eigen bedrijf.
  // Met toUserId gaat hij naar één specifieke collega (zelfde bedrijf) — bv.
  // de chauffeur die een nieuwe rit kreeg of wiens melding klaar is.
  let subs = [];
  if (toUserId && typeof toUserId === "string") {
    const { data } = await supaAdmin.from("push_subscriptions")
      .select("endpoint, keys, user_id")
      .eq("company_id", me.company_id).eq("user_id", toUserId);
    subs = data || [];
  } else {
    // De rol LIVE uit profiles halen: de rol op de subscription is een snapshot
    // van het subscribe-moment. Zonder deze join zou een naar chauffeur
    // gedegradeerde medewerker beheer-/werkplaatsnotificaties blijven ontvangen
    // (en een gepromoveerde juist alles missen).
    const { data: staff } = await supaAdmin.from("profiles")
      .select("id").eq("company_id", me.company_id).in("rol", ["admin", "garage"]);
    const ids = (staff || []).map((p) => p.id);
    if (ids.length) {
      const { data } = await supaAdmin.from("push_subscriptions")
        .select("endpoint, keys, user_id")
        .eq("company_id", me.company_id).in("user_id", ids);
      subs = data || [];
    }
  }
  // URL moet een intern pad zijn: precies één leading slash (geen "//evil.com"
  // en geen "http…"), anders kan een push naar een phishingdomein leiden.
  const safeUrl = typeof url === "string" && /^\/(?!\/)/.test(url) ? url : "/";
  const payload = JSON.stringify({
    title: String(title || "Truck & Trailer").slice(0, 120),
    body: String(body || "Nieuwe melding").slice(0, 240),
    url: safeUrl,
  });
  const targets = (subs || []).filter((s) => s.user_id !== me.userId);
  const stale = [];
  let sent = 0;
  await Promise.all(targets.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload); sent++; }
    catch (e) { if (e?.statusCode === 404 || e?.statusCode === 410) stale.push(s.endpoint); }
  }));
  if (stale.length) await supaAdmin.from("push_subscriptions").delete().in("endpoint", stale);
  res.json({ ok: true, sent });
});

// Frontend: statische bestanden + SPA-fallback naar index.html
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(distDir, "index.html"));
    }
    next();
  });
} else {
  app.get("/", (_req, res) => {
    res.status(503).send("Frontend is nog niet gebouwd. Draai eerst: npm run build");
  });
}

const port = Number(process.env.PORT) || 8787;
app.listen(port, "0.0.0.0", () => {
  console.log(`Truck & Trailer draait op poort ${port} (AI ${apiKeyConfigured ? "actief" : "uit — geen ANTHROPIC_API_KEY"})`);
});
