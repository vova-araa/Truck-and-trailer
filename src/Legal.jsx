import React, { useEffect } from "react";
import { Truck, ArrowLeft } from "lucide-react";

/*
  Privacybeleid en Algemene voorwaarden. Statische, publieke pagina's op
  /privacy en /voorwaarden. Vul de bedrijfsgegevens hieronder in met je eigen
  KvK/adres. Dit is een nette basis — laat 'm eventueel juridisch nakijken.
*/

const ACCENT = "#3B82F6";
const BEDRIJF = "Truck & Trailer";
const EMAIL = "info@truckandtrailer.nl";
const KVK = "00000000";                    // vul je KvK-nummer in
const ADRES = "Adres, Postcode Plaats";    // vul je vestigingsadres in
const UPDATED = "juli 2026";

function Shell({ title, onBack, children }) {
  useEffect(() => { try { window.scrollTo(0, 0); } catch { /* noop */ } }, []);
  return (
    <div style={{ background: "#0A0E14", minHeight: "100vh", color: "#E7ECF3" }}>
      <div style={{ borderBottom: "1px solid #161C25", position: "sticky", top: 0, background: "rgba(10,14,20,.82)", backdropFilter: "blur(10px)", zIndex: 10 }}>
        <div style={s.wrap}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 62 }}>
            <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "#E7ECF3", fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600 }}>
              <ArrowLeft size={16} /> Terug
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Truck size={16} color={ACCENT} />
              <span style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: .5 }}>TRUCK <span style={{ color: ACCENT }}>&amp;</span> TRAILER</span>
            </div>
          </div>
        </div>
      </div>
      <div style={s.wrap}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 0 72px" }}>
          <h1 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 34 }}>{title}</h1>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#98A1B0", marginBottom: 24 }}>Laatst bijgewerkt: {UPDATED}</div>
          {children}
          <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid #1A2230", fontFamily: "Inter, sans-serif", fontSize: 13, color: "#98A1B0" }}>
            Vragen? Mail ons op <a href={`mailto:${EMAIL}`} style={{ color: "#8FB8FF" }}>{EMAIL}</a>.
          </div>
        </div>
      </div>
    </div>
  );
}

function H({ children }) { return <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 20, marginTop: 28, marginBottom: 8 }}>{children}</h2>; }
function P({ children }) { return <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, color: "#C3CAD6", lineHeight: 1.7, margin: "0 0 10px" }}>{children}</p>; }
function UL({ items }) {
  return (
    <ul style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, color: "#C3CAD6", lineHeight: 1.7, paddingLeft: 20, margin: "0 0 10px" }}>
      {items.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}
    </ul>
  );
}

export function PrivacyPage({ onBack }) {
  return (
    <Shell title="Privacybeleid" onBack={onBack}>
      <P>{BEDRIJF} vindt jouw privacy belangrijk. In dit beleid leggen we uit welke persoonsgegevens we verwerken wanneer je onze vloot- en werkplaatsbeheer-app gebruikt, waarom we dat doen en welke rechten je hebt.</P>

      <H>1. Wie zijn wij</H>
      <P>{BEDRIJF} (KvK {KVK}), {ADRES}, is de verwerkingsverantwoordelijke voor de verwerking van je gegevens. Contact: {EMAIL}.</P>

      <H>2. Welke gegevens we verwerken</H>
      <UL items={[
        "Accountgegevens: naam, e-mailadres, telefoonnummer en rol (beheerder, werkplaats of chauffeur).",
        "Bedrijfsgegevens die je invoert: voertuigen, meldingen, planning, onderhoud, voorraad, kosten, documenten en bedrijfsprofiel (o.a. logo, adres, KvK, BTW, IBAN).",
        "Foto's, video's en spraak die chauffeurs bij een melding toevoegen.",
        "Technische gegevens die nodig zijn om de dienst te laten werken (bv. inlogsessie en, indien je dat aanzet, een push-abonnement van je apparaat).",
      ]} />

      <H>3. Waarvoor we ze gebruiken</H>
      <UL items={[
        "De dienst leveren: je vloot en werkplaats beheren, meldingen verwerken, werkbonnen en facturen maken.",
        "Notificaties sturen (e-mail en push) over meldingen en aflopende keuringen/verzekeringen.",
        "Ondersteuning bieden en de dienst beveiligen en verbeteren.",
      ]} />

      <H>4. Rechtsgrond</H>
      <P>We verwerken je gegevens om de overeenkomst met jouw bedrijf uit te voeren en op basis van ons gerechtvaardigd belang om de dienst goed en veilig te laten werken.</P>

      <H>5. Delen met derden (verwerkers)</H>
      <P>We verkopen je gegevens nooit. Voor het leveren van de dienst schakelen we zorgvuldig gekozen leveranciers in, die uitsluitend in onze opdracht verwerken:</P>
      <UL items={[
        "Hosting en database (o.a. Supabase en Render) — opslag van je gegevens.",
        "E-mail (Resend) — voor uitnodigingen, activatie- en herinneringsmails.",
        "AI-analyse (Anthropic) — als je de AI-functies gebruikt, worden de betreffende foto('s) of tekst verstuurd om schade te herkennen of onderhoud in te schatten. Deze worden niet gebruikt om modellen te trainen.",
      ]} />

      <H>6. Bewaartermijn</H>
      <P>We bewaren je gegevens zolang je een account hebt en zolang dat nodig is voor de dienst of om aan wettelijke verplichtingen te voldoen. Op verzoek verwijderen we je gegevens, tenzij we ze wettelijk moeten bewaren.</P>

      <H>7. Beveiliging</H>
      <P>Toegang is afgeschermd per rol en per bedrijf. Foto's en documenten staan in een afgeschermde (privé) opslag en zijn alleen via tijdelijke links te bekijken. Verbindingen verlopen via versleuteling (HTTPS).</P>

      <H>8. Jouw rechten</H>
      <P>Je hebt recht op inzage, correctie, verwijdering en beperking van je gegevens, en je kunt bezwaar maken tegen bepaalde verwerkingen. Neem hiervoor contact op via {EMAIL}. Je kunt ook een klacht indienen bij de Autoriteit Persoonsgegevens.</P>

      <H>9. Cookies en lokale opslag</H>
      <P>We gebruiken geen tracking-cookies. Wel bewaren we functionele gegevens in je browser (bv. je taalkeuze en inlogsessie) die nodig zijn om de app te laten werken.</P>

      <H>10. Wijzigingen</H>
      <P>We kunnen dit beleid aanpassen. De meest actuele versie staat altijd op deze pagina.</P>
    </Shell>
  );
}

export function TermsPage({ onBack }) {
  return (
    <Shell title="Algemene voorwaarden" onBack={onBack}>
      <P>Deze voorwaarden gelden voor het gebruik van de {BEDRIJF}-app en bijbehorende diensten.</P>

      <H>1. Definities</H>
      <P>"Dienst" is het online vloot- en werkplaatsbeheer van {BEDRIJF}. "Klant" is het bedrijf dat een account gebruikt. "Gebruiker" is iedere persoon (beheerder, werkplaats of chauffeur) die namens de klant inlogt.</P>

      <H>2. De dienst</H>
      <P>{BEDRIJF} biedt software om voertuigen, meldingen, planning, onderhoud, kosten en documenten te beheren. We spannen ons in om de dienst goed te laten werken, maar bieden geen garantie op ononderbroken beschikbaarheid.</P>

      <H>3. Toegang en account</H>
      <UL items={[
        "Toegang wordt op aanvraag verleend. Na aanmaak beheert de klant zelf de gebruikers binnen zijn bedrijf.",
        "De klant is verantwoordelijk voor het geheimhouden van inloggegevens en voor het gebruik door zijn gebruikers.",
      ]} />

      <H>4. Toegestaan gebruik</H>
      <P>Je gebruikt de dienst alleen voor je eigen bedrijfsvoering en niet in strijd met de wet. Het is niet toegestaan de dienst te misbruiken, te overbelasten, te reverse-engineeren of toegang te verkrijgen tot gegevens van andere bedrijven.</P>

      <H>5. Gegevens van de klant</H>
      <P>De gegevens die de klant invoert blijven van de klant. {BEDRIJF} gebruikt deze uitsluitend om de dienst te leveren, zoals beschreven in het privacybeleid. De klant zorgt dat hij de gegevens die hij invoert mag gebruiken.</P>

      <H>6. Vergoeding</H>
      <P>Gebruik verloopt momenteel op aanvraag; afspraken over eventuele kosten worden vooraf met de klant gemaakt. Wijzigingen in tarieven worden vooraf gecommuniceerd.</P>

      <H>7. Beschikbaarheid en onderhoud</H>
      <P>We mogen de dienst tijdelijk onderbreken voor onderhoud of updates. We proberen dit zo veel mogelijk buiten kantooruren te doen en de impact te beperken.</P>

      <H>8. Aansprakelijkheid</H>
      <P>De dienst wordt geleverd "zoals hij is". {BEDRIJF} is niet aansprakelijk voor indirecte schade of gevolgschade. Onze aansprakelijkheid is in alle gevallen beperkt voor zover wettelijk toegestaan. De klant blijft zelf verantwoordelijk voor de juistheid van ingevoerde gegevens en voor het naleven van wettelijke verplichtingen (zoals APK en keuringen).</P>

      <H>9. Beëindiging</H>
      <P>De klant kan het gebruik op elk moment stoppen. {BEDRIJF} kan een account beëindigen bij misbruik of strijd met deze voorwaarden. Na beëindiging kunnen gegevens op verzoek worden verwijderd.</P>

      <H>10. Wijzigingen</H>
      <P>We kunnen deze voorwaarden aanpassen. De meest actuele versie staat altijd op deze pagina.</P>

      <H>11. Toepasselijk recht</H>
      <P>Op deze voorwaarden is Nederlands recht van toepassing.</P>
    </Shell>
  );
}

const s = { wrap: { maxWidth: 1120, margin: "0 auto", padding: "0 20px" } };
