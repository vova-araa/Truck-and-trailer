import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

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
app.use(express.json({ limit: "25mb" })); // foto's gaan als base64 mee

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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ai: apiKeyConfigured, adminAuth: adminAuthConfigured });
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

app.post("/api/ai", async (req, res) => {
  if (rateLimited(req.ip || "onbekend")) {
    return res.status(429).json({ error: `Te veel AI-aanvragen (max ${RL_MAX}/min). Wacht even en probeer opnieuw.` });
  }
  // Als we sessies kunnen verifiëren (service_role gezet), eisen we een geldig
  // ingelogde gebruiker — zo kan niemand van buitenaf de AI-credits verbruiken.
  if (supaAdmin) {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ error: "Log in om de AI te gebruiken." });
    try {
      const { data: who, error } = await supaAdmin.auth.getUser(token);
      if (error || !who?.user) return res.status(401).json({ error: "Sessie ongeldig, log opnieuw in." });
    } catch {
      return res.status(401).json({ error: "Kon sessie niet verifiëren." });
    }
  }
  if (!anthropic) {
    return res.status(503).json({
      error: "AI is niet geconfigureerd. Zet ANTHROPIC_API_KEY in de server-omgeving.",
    });
  }
  const { messages, system, max_tokens: maxTokens } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages is verplicht." });
  }
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: Math.min(Number(maxTokens) || 1000, 4096),
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
