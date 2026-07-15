import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

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
app.use(express.json({ limit: "25mb" })); // foto's gaan als base64 mee

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ai: apiKeyConfigured });
});

app.post("/api/ai", async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({
      error: "AI is niet geconfigureerd. Zet ANTHROPIC_API_KEY in de server-omgeving (Railway → Variables).",
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
