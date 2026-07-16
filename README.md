# Truck & Trailer

Multi-tenant fleet & garage management. React (Vite) frontend + een kleine
Node/Express-server + Supabase (Auth + Postgres). Elk bedrijf heeft een
geïsoleerde omgeving; echte e-mail + wachtwoord-login voor iedereen.

De server doet twee dingen: hij serveert de gebouwde frontend én biedt een
veilige AI-proxy (`POST /api/ai`) zodat de Anthropic-key nooit in de browser
staat.

## Functies

- **Rollen:** platformbeheerder, bedrijfsbeheerder, werkplaats, chauffeur — elk met een eigen weergave.
- **Vloot:** voertuigen (zoeken/filteren, notities, APK/tacho/verzekering-compliance, CSV-export), trailers, 360°-inspectie.
- **Werkplaats:** meldingen-kanban (met verwijderen), planning-kalender, voorspellend onderhoud, voorraad met +/- afboeken.
- **Kosten:** overzicht per categorie en per voertuig, jaarfilter en CSV-export.
- **Mobiel:** eigen bottom-navigatie + installeerbaar als app (PWA) op telefoon/tablet.
- **AI (optioneel):** kenteken-lookup, fotoschade-herkenning, voorspellend onderhoud, een 360°-inspectie die schade op foto's herkent, en een assistent die ook acties uitvoert — allemaal via de server-proxy.
- **Dataveiligheid:** elke wijziging wordt automatisch opgeslagen in Supabase; de app toont live of het bewaard is ("Opgeslagen" / "Niet opgeslagen").

---

## Klaar voor de eerste pilot — checklist

1. **Supabase** aangemaakt en `schema.sql` gedraaid (stap 1 hieronder). RLS staat aan, dus bedrijven zien elkaars data nooit.
2. **"Confirm email" UIT** in Supabase (Authentication → Providers → Email) voor de soepelste start — anders moeten gebruikers eerst hun mail bevestigen.
3. **Deployen** (Docker of een Node-host, stap 4) met de environment variables:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (build-time)
   - `ANTHROPIC_API_KEY` (server, optioneel — voor de AI-functies)
   - eventueel `AI_RATE_LIMIT` (max AI-aanvragen per minuut per gebruiker, standaard 30)
4. Open de publieke URL → **Bedrijf aanmelden** → voertuigen, monteurs (rol Werkplaats) en chauffeurs toevoegen.
5. Op de telefoon: **"Zet op beginscherm"** installeert de app met eigen icoon.
6. Wil je meekijken over alle bedrijven heen? Zet jezelf als platformbeheerder (zie stap 5 onderaan).

---

## 1. Supabase opzetten (eenmalig)

1. Maak een project op [supabase.com](https://supabase.com).
2. Ga naar **SQL Editor** → plak de inhoud van [`schema.sql`](./schema.sql) → **Run**.
   Dit maakt de tabellen (`companies`, `profiles`, `company_state`) en zet **Row Level
   Security** aan, zodat bedrijven elkaars data nooit kunnen zien.
3. Ga naar **Authentication → Providers → Email** en zet **"Confirm email"** UIT als je
   wil dat mensen direct kunnen inloggen na aanmelden. (Laat je 'm aan, dan moeten
   gebruikers eerst hun e-mail bevestigen — de app toont daar een nette melding over.)
4. Ga naar **Project Settings → API** en kopieer:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

> De anon key mag in de browser staan — dat is veilig **zolang RLS aanstaat** (stap 2).

---

## 2. Lokaal draaien (optioneel)

```bash
cp .env.example .env      # vul je Supabase URL + anon key (+ evt. ANTHROPIC_API_KEY) in
npm install

# Twee processen: de Vite dev-server (frontend) en de AI-proxy (server).
npm run dev               # http://localhost:5173  (Vite proxy't /api naar poort 8787)
npm run dev:server        # in een tweede terminal — de AI-proxy op poort 8787
```

De frontend werkt zonder de server; alleen de AI-knoppen hebben de proxy nodig.
Draai je liever één proces zoals in productie? Dan: `npm run build && npm start`
(server serveert dan de gebouwde `dist/` én `/api` op poort 8787).

### Demo bekijken (zonder Supabase)

Er is een publieke demo op **seed-data** die geen login of Supabase nodig heeft:

- **In de app:** open `/demo.html` (ook bereikbaar via de "Bekijk de demo →"-link op
  het inlogscherm). Kies een rol en klik rond; data wordt niet bewaard.
- **Los, draagbaar bestand:** `npm run build:standalone` maakt
  `dist-standalone/demo.html` — één self-contained HTML-bestand (alle JS + CSS
  inline, geen externe requests) dat je lokaal kunt openen, mailen of op elke
  statische host kunt zetten.

---

## 3. Naar GitHub

```bash
git init
git add .
git commit -m "Truck & Trailer"
git branch -M main
git remote add origin https://github.com/JOUW-USER/truck-trailer.git
git push -u origin main
```

---

## 4. Deployen

> 📘 **Uitgebreide stap-voor-stap gids:** zie [`DEPLOY.md`](./DEPLOY.md) — met
> een kant-en-klare [`render.yaml`](./render.yaml) (Render, één klik) en
> [`docker-compose.yml`](./docker-compose.yml) (eigen server). Hieronder de korte versie.

De app is één Node-server (`server/index.js`) die de gebouwde frontend én de
AI-proxy serveert. Je hebt dus geen speciaal platform nodig — het draait op elke
host met Node 20+ of met Docker.

### Environment variables (op elke host hetzelfde)

| Variabele | Nodig? | Waar gebruikt |
|---|---|---|
| `VITE_SUPABASE_URL` | ja | ingebakken tijdens **build** (frontend) |
| `VITE_SUPABASE_ANON_KEY` | ja | ingebakken tijdens **build** (frontend) |
| `ANTHROPIC_API_KEY` | optioneel | gelezen op de **server** (AI-functies) |
| `ANTHROPIC_MODEL` | optioneel | server, standaard `claude-opus-4-8` |
| `PORT` | optioneel | server-poort, standaard `8787` |

> De twee `VITE_`-variabelen worden tijdens `npm run build` in de frontend
> gebakken — wijzig je ze, bouw dan opnieuw. `ANTHROPIC_API_KEY` wordt op runtime
> door de server gelezen en heeft geen rebuild nodig.

### Optie A — Docker (draait overal identiek)

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://JOUW-PROJECT.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=JOUW-ANON-KEY \
  -t truck-trailer .

docker run -p 8787:8787 -e ANTHROPIC_API_KEY=sk-ant-... truck-trailer
```

Open daarna `http://localhost:8787`.

### Optie B — Kale Node-host / VPS

```bash
npm ci
npm run build            # bouwt dist/ (VITE_-vars moeten dan gezet zijn)
npm start                # start de server op poort $PORT (standaard 8787)
```

Zet dit onder een procesmanager zoals **pm2** (`pm2 start npm --name truck -- start`)
of een **systemd**-service zodat hij automatisch herstart. Draai een reverse proxy
(nginx/Caddy) ervoor voor TLS + een eigen domein.

### Optie C — Managed platform (Render, Fly.io, Railway, …)

Elk platform dat een Node-app kan draaien werkt. Configureer:
- **Build:** `npm ci && npm run build`
- **Start:** `npm start`
- Zet de environment variables uit de tabel hierboven.

`railway.json` staat in de repo als kant-en-klaar voorbeeld voor Railway, maar is
niet vereist.

---

## 5. Eerste gebruik

1. Open je Railway-URL → **Bedrijf aanmelden** → vul bedrijfsnaam + jouw
   beheerdersaccount in. Je krijgt een lege, eigen omgeving en wordt direct ingelogd.
2. Voeg voertuigen, monteurs (rol Werkplaats) en chauffeurs toe.
3. Wil jij als platformbeheerder álle bedrijven kunnen zien? Draai in Supabase:
   ```sql
   update public.profiles set is_superadmin = true where email = 'jij@bedrijf.nl';
   ```

---

## Hoe data wordt opgeslagen

De volledige dataset van een bedrijf (voertuigen, meldingen, planning, enz.) wordt
bewaard als één JSON-document in `company_state.data`, gekoppeld aan de `company_id`.
Auth en het bedrijfsprofiel staan in `profiles`. Dit houdt de bestaande UI intact en
geeft echte persistentie + isolatie. Wil je later per onderdeel losse tabellen en
queries? Dan kun je `company_state` stap voor stap normaliseren zonder de UI te breken.

## AI-functies

De AI-functies (voorspellend onderhoud, fotoherkenning, kenteken-lookup, assistent)
lopen via de ingebouwde server-proxy in [`server/index.js`](./server/index.js). De
browser praat met `POST /api/ai`; de server roept de Anthropic Messages API aan met
`ANTHROPIC_API_KEY`. Zo staat de key **nooit** in de browser.

Zet `ANTHROPIC_API_KEY` in je environment (Railway → Variables of lokaal in `.env`) om
de AI aan te zetten. Zonder key blijft de rest van de app gewoon werken en tonen de
AI-knoppen een nette melding.
