# Deployen — stap voor stap

De app is één Node-server die de frontend én de veilige AI-proxy serveert. Je
kunt 'm overal draaien. Hieronder twee kant-en-klare paden.

## Vooraf: Supabase (eenmalig, ~5 min)

1. Maak een project op [supabase.com](https://supabase.com).
2. **SQL Editor** → plak `schema.sql` → **Run** (maakt de tabellen + zet Row
   Level Security aan).
3. **Authentication → Providers → Email** → zet **"Confirm email" UIT** voor de
   soepelste start.
4. **Project Settings → API** → kopieer de **Project URL** en de **anon public
   key**.

## Environment variables

| Variabele | Nodig? | Waar |
|---|---|---|
| `VITE_SUPABASE_URL` | ja | build-time (frontend) |
| `VITE_SUPABASE_ANON_KEY` | ja | build-time (frontend) |
| `ANTHROPIC_API_KEY` | optioneel | server (AI-functies) |
| `ANTHROPIC_MODEL` | optioneel | server, standaard `claude-opus-4-8` |
| `AI_RATE_LIMIT` | optioneel | max AI-aanvragen/min per gebruiker (standaard 30) |
| `PORT` | optioneel | serverpoort (platforms zetten dit zelf) |

> De twee `VITE_`-waarden worden tijdens de **build** ingebakken. Wijzig je ze,
> bouw dan opnieuw. `ANTHROPIC_API_KEY` wordt op **runtime** gelezen.

---

## Optie A — Render (aanrader, met `render.yaml`)

1. Push deze repo naar GitHub (is al gebeurd).
2. Ga naar [render.com](https://render.com) → **New → Blueprint** → kies deze repo.
   Render leest `render.yaml` en maakt automatisch een Docker-webservice aan.
3. Vul bij **Environment** in:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY` (optioneel)
4. **Apply / Deploy.** Render bouwt met de `Dockerfile`, checkt `/api/health` en
   geeft je een publieke URL.
5. Wijzig je later een `VITE_`-waarde? Klik **Manual Deploy → Clear build cache
   & deploy** zodat de nieuwe waarde wordt ingebakken.

## Optie B — Docker / eigen server (VPS)

```bash
cp .env.example .env      # vul VITE_SUPABASE_* (+ evt. ANTHROPIC_API_KEY) in
docker compose up -d --build
```

De app draait nu op poort **8787**. Zet er een reverse proxy (nginx of Caddy)
voor TLS + een eigen domein voor. Voorbeeld met Caddy (`Caddyfile`):

```
jouwdomein.nl {
    reverse_proxy localhost:8787
}
```

Updaten: `git pull && docker compose up -d --build`.

### Zonder Docker (kale Node 20+)

```bash
npm ci
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run build
ANTHROPIC_API_KEY=... npm start        # poort 8787 (of $PORT)
```

Houd het draaiend met **pm2** (`pm2 start npm --name truck -- start`) of een
**systemd**-service.

---

## Na de eerste deploy

1. Open de URL → **Bedrijf aanmelden** (jouw beheerdersaccount).
2. Voeg voertuigen, monteurs (rol Werkplaats) en chauffeurs toe.
3. Deel de [`HANDLEIDING.md`](./HANDLEIDING.md) met het pilotbedrijf.
4. Platformbeheerder worden (alle bedrijven zien)? Draai in Supabase:
   ```sql
   update public.profiles set is_superadmin = true where email = 'jij@bedrijf.nl';
   ```

## Snel controleren of het draait

- `GET /api/health` → `{"ok":true,"ai":true|false}` (`ai` is `true` zodra de
  key is gezet).
