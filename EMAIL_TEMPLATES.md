# Nederlandse e-mailteksten voor Supabase

Supabase stuurt standaard Engelse systeemmails (wachtwoord vergeten,
uitnodiging, bevestiging). Hieronder staan kant-en-klare Nederlandse
versies in de huisstijl van Truck & Trailer.

**Zo stel je ze in (eenmalig, ±5 minuten):**

1. Ga naar [supabase.com](https://supabase.com) → je project →
   **Authentication → Email Templates** (linkermenu, onder Configuration).
2. Kies per tabblad het juiste sjabloon, plak het **Onderwerp** en de
   **HTML** hieronder, en klik **Save**.
3. Laat de variabelen zoals `{{ .ConfirmationURL }}` exact staan — Supabase
   vult die zelf in.

> Tip: onder **Authentication → URL Configuration** hoort de Site URL op
> `https://truckandtrailer.nl` te staan, anders wijzen de knoppen in de
> mails naar localhost.

---

## 1. Reset Password (wachtwoord vergeten)

**Onderwerp:** `Wachtwoord opnieuw instellen — Truck & Trailer`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a2129">
  <h1 style="font-size:20px;margin:0 0 4px">TRUCK &amp; TRAILER</h1>
  <p style="font-size:15px;line-height:1.6;margin:16px 0">
    Je hebt gevraagd om je wachtwoord opnieuw in te stellen. Klik op de knop
    hieronder en kies een nieuw wachtwoord. Deze link is korte tijd geldig.
  </p>
  <p style="margin:24px 0">
    <a href="{{ .ConfirmationURL }}" style="background:#3B82F6;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block">Nieuw wachtwoord kiezen</a>
  </p>
  <p style="font-size:12px;color:#98a1b0;line-height:1.6">
    Heb je dit niet zelf aangevraagd? Dan kun je deze mail negeren — je
    wachtwoord blijft ongewijzigd.
  </p>
</div>
```

## 2. Invite User (medewerker uitgenodigd)

**Onderwerp:** `Je account voor Truck & Trailer staat klaar`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a2129">
  <h1 style="font-size:20px;margin:0 0 4px">TRUCK &amp; TRAILER</h1>
  <p style="font-size:15px;line-height:1.6;margin:16px 0">
    Er is een account voor je aangemaakt bij <b>Truck &amp; Trailer</b> — de app
    voor meldingen, ritten en je werkdag. Klik op de knop, kies een wachtwoord
    en je kunt direct aan de slag.
  </p>
  <p style="margin:24px 0">
    <a href="{{ .ConfirmationURL }}" style="background:#3B82F6;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block">Account activeren</a>
  </p>
  <p style="font-size:12px;color:#98a1b0;line-height:1.6">
    Tip: open de app daarna op je telefoon en kies "Zet op beginscherm" — dan
    werkt hij als een echte app, ook offline.
  </p>
</div>
```

## 3. Confirm Signup (e-mail bevestigen — alleen als "Confirm email" aan staat)

**Onderwerp:** `Bevestig je e-mailadres — Truck & Trailer`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a2129">
  <h1 style="font-size:20px;margin:0 0 4px">TRUCK &amp; TRAILER</h1>
  <p style="font-size:15px;line-height:1.6;margin:16px 0">
    Welkom! Bevestig je e-mailadres om je account te activeren.
  </p>
  <p style="margin:24px 0">
    <a href="{{ .ConfirmationURL }}" style="background:#3B82F6;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block">E-mailadres bevestigen</a>
  </p>
  <p style="font-size:12px;color:#98a1b0;line-height:1.6">
    Heb jij je niet aangemeld bij Truck &amp; Trailer? Negeer deze mail dan.
  </p>
</div>
```

## 4. Magic Link (inloggen zonder wachtwoord — alleen indien gebruikt)

**Onderwerp:** `Je inloglink — Truck & Trailer`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a2129">
  <h1 style="font-size:20px;margin:0 0 4px">TRUCK &amp; TRAILER</h1>
  <p style="font-size:15px;line-height:1.6;margin:16px 0">
    Klik op de knop om direct in te loggen. Deze link is korte tijd geldig en
    werkt één keer.
  </p>
  <p style="margin:24px 0">
    <a href="{{ .ConfirmationURL }}" style="background:#3B82F6;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block">Inloggen</a>
  </p>
  <p style="font-size:12px;color:#98a1b0;line-height:1.6">
    Heb je dit niet zelf aangevraagd? Negeer deze mail dan.
  </p>
</div>
```

## 5. Change Email Address (e-mailwijziging bevestigen)

**Onderwerp:** `Bevestig je nieuwe e-mailadres — Truck & Trailer`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a2129">
  <h1 style="font-size:20px;margin:0 0 4px">TRUCK &amp; TRAILER</h1>
  <p style="font-size:15px;line-height:1.6;margin:16px 0">
    Je e-mailadres wordt gewijzigd naar {{ .NewEmail }}. Bevestig dit met de
    knop hieronder.
  </p>
  <p style="margin:24px 0">
    <a href="{{ .ConfirmationURL }}" style="background:#3B82F6;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block">Nieuw e-mailadres bevestigen</a>
  </p>
  <p style="font-size:12px;color:#98a1b0;line-height:1.6">
    Heb je dit niet zelf aangevraagd? Wijzig dan direct je wachtwoord in de app.
  </p>
</div>
```
