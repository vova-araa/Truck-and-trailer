# Truck & Trailer

Multi-tenant fleet & garage management. React (Vite) frontend + een kleine
Node/Express-server + Supabase (Auth + Postgres). Elk bedrijf heeft een
geïsoleerde omgeving; echte e-mail + wachtwoord-login voor iedereen.

De server doet twee dingen: hij serveert de gebouwde frontend én biedt een
veilige AI-proxy (`POST /api/ai`) zodat de Anthropic-key nooit in de browser
staat.

## Functies

- **Rollen:** platformbeheerder, bedrijfsbeheerder, werkplaats, chauffeur — elk met een eigen weergave.
- **Vloot:** voertuigen (zoeken/filteren, APK/tacho/verzekering-compliance), trailers, 360°-inspectie.
- **Werkplaats:** meldingen-kanban, planning-kalender, voorspellend onderhoud, voorraad met +/- afboeken.
- **Kosten:** overzicht per categorie en per voertuig, met jaarfilter.
- **AI (optioneel):** kenteken-lookup, fotoschade-herkenning, voorspellend onderhoud en een assistent die ook acties uitvoert — allemaal via de server-proxy.

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

## 4. Deployen op Railway

1. Ga naar [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
   → kies je repo.
2. Railway leest `railway.json` automatisch (build: `npm ci && npm run build`,
   start: `npm start` — de Node-server die `dist/` én de AI-proxy serveert).
3. Ga naar het project → **Variables** en voeg toe:
   - `VITE_SUPABASE_URL` = je Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = je anon public key
   - `ANTHROPIC_API_KEY` = je Anthropic-key **(optioneel — alleen nodig voor de AI-functies)**
4. **Belangrijk:** variabelen met `VITE_` worden tijdens de **build** ingebakken. Als je ze
   later wijzigt, klik **Redeploy** zodat de build ze meepakt. `ANTHROPIC_API_KEY` wordt
   op de server gelezen en hoeft geen rebuild.
5. Open **Settings → Networking → Generate Domain** voor een publieke URL.

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
