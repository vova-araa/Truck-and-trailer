import React, { useState, useRef, useEffect } from "react";
import {
  Truck, AlertTriangle, KanbanSquare, Euro, Sparkles, FileText, ShieldCheck,
  BellRing, Globe, WifiOff, Check, ArrowRight, Mail, Phone as PhoneIcon, MessageCircle, LogIn, Ticket,
  Wrench, Users, ChevronDown, BarChart3,
} from "lucide-react";
import { sendContactRequest } from "./api.js";

/*
  Premium landingspagina voor truckandtrailer.nl. Getoond aan uitgelogde
  bezoekers, met echte app-screenshots in laptop/telefoon-mockups en verzorgde
  scroll-animaties. "Inloggen" opent het inlogscherm; "Toegang aanvragen"
  scrollt naar het formulier (aanmelden gaat voorlopig op aanvraag).

  Pas onderaan je eigen contactgegevens aan (e-mail / telefoon / WhatsApp).
*/

const ACCENT = "#3B82F6";
const TEAL = "#22D3B0";
const CONTACT_EMAIL = "info@truckandtrailer.nl";
// Bel- en WhatsApp-knoppen verschijnen pas als hier een ECHT nummer staat —
// een placeholder-nummer zou bezoekers naar een willekeurige derde laten bellen.
const CONTACT_TEL = "";  // bv. "+31 6 12345678"
const WHATSAPP = "";     // internationaal, zonder + (bv. "31612345678")

// Iconen/kleuren per kaart; de teksten komen per taal uit LN (zelfde volgorde).
const FEATURE_ICONS = [
  { icon: AlertTriangle, kleur: "#F0453F" },
  { icon: ShieldCheck, kleur: TEAL },
  { icon: MessageCircle, kleur: "#F59E0B" },
  { icon: KanbanSquare, kleur: ACCENT },
  { icon: Euro, kleur: TEAL },
  { icon: Sparkles, kleur: "#A855F7" },
];
const VOOR_WIE_ICONS = [Truck, Users, Wrench];
const TOUR_SRC = ["/landing/rapportage.webp", "/landing/kosten.webp"];

// Alle marketingteksten per taal. NL en EN zijn compleet; extra talen zijn
// hier één blok werk (zelfde sleutels invullen).
const LN = {
  nl: {
    navActivate: "Bedrijf activeren", navLogin: "Inloggen",
    badge: "Software voor transport, koeriers en bestelbus-vloten",
    notGarage: "Op zoek naar een werkplaats voor onderhoud? Dat zijn wij niet — wij maken de software waarmee je je éigen vloot en werkplaats beheert.",
    vcLink: "Gratis APK-check",
    h1a: "Eén app voor je wagenpark,", h1b: "chauffeurs en werkplaats",
    heroSub: "Chauffeurs melden problemen met een foto, doen hun dagelijkse voertuigcheck, tekenen ritten digitaal af en houden hun uren bij — in hun eigen taal. Jij ziet op kantoor de planning, kosten, keuringen en werkbonnen. Alles in één app die overal werkt.",
    ctaRequest: "Toegang aanvragen", ctaDemo: "Bekijk de demo", ctaLogin: "Inloggen",
    heroTag1: "10 talen", heroTag2: "Werkt offline", heroTag3: "Push-meldingen",
    stats: [["10", "talen voor chauffeurs"], ["1 app", "vloot + werkplaats + ritten"], ["24/7", "onderweg bereikbaar"], ["0", "installatie nodig"]],
    featTitle: "Alles-in-één", featH2: "Wat Truck & Trailer voor je doet",
    features: [
      { titel: "Meldingen van chauffeurs", tekst: "Kapotte verlichting, rare geluiden, schade: chauffeurs melden het onderweg in een paar tikken — met foto, spraak en AI-schadeherkenning. In 10 talen en zelfs offline." },
      { titel: "Dagelijkse voertuigcheck", tekst: "Vóór vertrek in 30 seconden banden, verlichting en remmen nalopen. Afgekeurde punten gaan automatisch naar de werkplaats — en jij bouwt een sluitend dossier op." },
      { titel: "Ritten met digitaal afleverbewijs", tekst: "Plan een rit en hij staat direct op de telefoon van de chauffeur, mét navigatie. De ontvanger tekent op het scherm; jij hebt meteen een afleverbewijs-PDF." },
      { titel: "Digitale werkvloer & planning", tekst: "Alle meldingen op één bord. Plan reparaties in, wijs monteurs toe, maak werkbonnen met je eigen logo en zie live wat er speelt." },
      { titel: "Uren, kosten & loonexport", tekst: "Chauffeurs houden hun uren bij in de app; jij downloadt per maand de loonexport. Elke werkbon boekt automatisch kosten per voertuig." },
      { titel: "APK automatisch bewaakt via RDW", tekst: "De app controleert de APK-datums van je hele vloot elke nacht bij de RDW en mailt je vóórdat een keuring of verzekering verloopt. Nooit meer een boete." },
    ],
    capsTitle: "En verder", capsH2: "Wat kan je er allemaal mee?",
    caps: [
      "Voertuig toevoegen met alleen het kenteken (RDW vult de rest in)",
      "Kentekenbewijs, verzekering en APK-rapport per voertuig bewaren",
      "Schadedossier-PDF per melding — klaar voor de verzekeraar",
      "AI herkent schade op foto's en voorspelt onderhoud",
      "Rijbewijs, Code 95, ADR en medische keuring per chauffeur bewaken",
      "Kosten per kilometer en duurste voertuigen in beeld",
      "Voorraad die automatisch afboekt via de werkbon",
      "Pushmelding op je telefoon bij elke nieuwe melding",
      "Trailers, bakwagens en bestelwagens apart bijhouden",
      "Werkt op telefoon, tablet en computer — niets installeren",
      "Iedereen ziet alleen wat bij zijn rol hoort",
      "Modules aan/uit: alleen wat jouw bedrijf gebruikt",
    ],
    wieTitle: "Voor wie", wieH2: "Gemaakt voor bedrijven met wagens op de weg",
    voorwie: [
      { titel: "Transportbedrijven", tekst: "Overzicht over de hele vloot, van APK tot kosten per kilometer. Meerdere chauffeurs en monteurs, netjes gescheiden per rol." },
      { titel: "Koeriers & bestelbus-vloten", tekst: "Ritten plannen, digitaal aftekenen bij de klant en uren bijhouden — ook zonder eigen werkplaats haal je hier alles uit." },
      { titel: "Werkplaatsen", tekst: "Meldingen binnen op één bord, plan reparaties in en lever een nette werkbon met je eigen logo en BTW op." },
    ],
    showTitle: "Werkvloer & planning", showH2: "Van melding tot reparatie, zonder telefoontjes",
    showText: "Een chauffeur meldt onderweg een probleem — met foto. De werkplaats ziet het direct op het bord, plant de reparatie in en maakt na afloop een werkbon. De kosten staan automatisch bij het juiste voertuig.",
    showList: ["Meldingen live binnen — ook push als de app dicht is", "Planning per dag met monteurs en tijden", "Werkbon als PDF met je eigen logo & gegevens", "Kosten automatisch bij het juiste voertuig"],
    stepTitle: "In 3 stappen live", stepH2: "Vandaag beginnen",
    stappen: [
      { titel: "Voeg je vloot toe", tekst: "Tik alleen de kentekens in — merk, type en APK-datum komen automatisch van de RDW." },
      { titel: "Nodig je team uit", tekst: "Chauffeurs maken met de bedrijfscode zelf hun login en kiezen hun eigen taal. De werkplaats krijgt een eigen weergave." },
      { titel: "Alles onder controle", tekst: "Meldingen, checks, ritten, uren, planning, kosten en keuringen op één plek — op kantoor én onderweg." },
    ],
    tourTitle: "Zie het in actie", tourH2: "Een blik in de app",
    tour: [
      { titel: "Rapportage", tekst: "Kosten per kilometer, duurste voertuigen en de meldingen-trend — in één oogopslag." },
      { titel: "Kosten & werkbonnen", tekst: "Elke uitgave bij het juiste voertuig, met export en werkbonnen per periode." },
    ],
    faqTitle: "Veelgestelde vragen", faqH2: "Goed om te weten",
    faq: [
      { q: "Wat kost het?", a: "Aanmelden gaat op dit moment op aanvraag. Laat je gegevens achter via het formulier, dan bespreken we samen wat past bij jouw vloot." },
      { q: "Moet ik iets installeren?", a: "Nee. Truck & Trailer draait in de browser en werkt op telefoon, tablet en computer. Je kunt de app wel op je beginscherm zetten voor snelle toegang en meldingen." },
      { q: "Kunnen chauffeurs in hun eigen taal werken?", a: "Ja. De chauffeursschermen zijn beschikbaar in 10 talen, waaronder Pools, Roemeens, Oekraïens, Turks en meer. Ze kiezen zelf hun taal." },
      { q: "Werkt het ook zonder internet?", a: "Ja. Chauffeurs kunnen onderweg een melding maken of hun uren invullen zonder verbinding. Zodra ze weer online zijn, wordt alles automatisch verstuurd." },
      { q: "Zijn mijn gegevens veilig?", a: "Ja. Toegang is afgeschermd per rol en per bedrijf, foto's en documenten staan in afgeschermde opslag en alle verbindingen zijn versleuteld." },
      { q: "Kan ik facturen op mijn eigen naam maken?", a: "Zeker. Je stelt je bedrijfsprofiel met logo, adres, KvK, BTW en IBAN in; werkbonnen, facturen en afleverbewijzen komen automatisch op je eigen huisstijl." },
    ],
    reqTitle: "Aanmelden op aanvraag", reqH2: "Vraag toegang aan",
    reqText: "Laat je gegevens achter, dan nemen we contact op en zetten we je bedrijf klaar. Liever direct contact? Gebruik de knoppen hieronder.",
    fNaam: "Jouw naam", fBedrijf: "Bedrijfsnaam", fEmail: "E-mailadres", fTel: "Telefoon (optioneel)", fBericht: "Vertel kort iets over je vloot (optioneel)",
    fSend: "Aanvraag versturen", fBusy: "Versturen…",
    fSentTitle: "Bedankt, we hebben je aanvraag ontvangen!", fSentText: "We nemen zo snel mogelijk contact met je op.",
    errNaam: "Vul je naam in.", errEmail: "Vul een geldig e-mailadres in.", errSend: "Kon de aanvraag niet versturen. Mail ons gerust rechtstreeks.",
    footer: "Vloot- en werkplaatsbeheer voor transportbedrijven.",
  },
  en: {
    navActivate: "Activate company", navLogin: "Sign in",
    badge: "Software for transport, couriers and van fleets",
    notGarage: "Looking for a repair shop? That's not us — we build the software you use to run your own fleet and workshop.",
    vcLink: "Free MOT check",
    h1a: "One app for your fleet,", h1b: "drivers and workshop",
    heroSub: "Drivers report problems with a photo, do their daily vehicle check, sign off deliveries digitally and track their hours — in their own language. You see planning, costs, inspections and job sheets at the office. Everything in one app that works everywhere.",
    ctaRequest: "Request access", ctaDemo: "View the demo", ctaLogin: "Sign in",
    heroTag1: "10 languages", heroTag2: "Works offline", heroTag3: "Push notifications",
    stats: [["10", "driver languages"], ["1 app", "fleet + workshop + trips"], ["24/7", "available on the road"], ["0", "installation needed"]],
    featTitle: "All-in-one", featH2: "What Truck & Trailer does for you",
    features: [
      { titel: "Driver reports", tekst: "Broken lights, strange noises, damage: drivers report it on the road in a few taps — with photo, speech and AI damage detection. In 10 languages, even offline." },
      { titel: "Daily vehicle check", tekst: "Tyres, lights and brakes checked in 30 seconds before departure. Failed points go to the workshop automatically — and you build a solid paper trail." },
      { titel: "Trips with digital proof of delivery", tekst: "Plan a trip and it appears on the driver's phone instantly, with navigation. The receiver signs on screen; you get a delivery-note PDF right away." },
      { titel: "Digital workshop board & planning", tekst: "All reports on one board. Schedule repairs, assign mechanics, create job sheets with your own logo and see live what's going on." },
      { titel: "Hours, costs & payroll export", tekst: "Drivers track their hours in the app; you download the monthly payroll export. Every job sheet books costs to the right vehicle automatically." },
      { titel: "MOT guarded automatically via RDW", tekst: "The app checks your whole fleet's MOT dates against the Dutch RDW registry every night and emails you before an inspection or insurance expires." },
    ],
    capsTitle: "And more", capsH2: "What else can you do with it?",
    caps: [
      "Add a vehicle with just the plate (RDW fills in the rest)",
      "Store registration, insurance and MOT documents per vehicle",
      "Damage-file PDF per report — ready for your insurer",
      "AI detects damage on photos and predicts maintenance",
      "Guard licences, Code 95, ADR and medicals per driver",
      "Cost per kilometre and most expensive vehicles at a glance",
      "Stock that deducts automatically via the job sheet",
      "Push notification on your phone for every new report",
      "Track trailers, box trucks and vans separately",
      "Works on phone, tablet and computer — nothing to install",
      "Everyone only sees what belongs to their role",
      "Modules on/off: only what your company uses",
    ],
    wieTitle: "Who it's for", wieH2: "Built for companies with vehicles on the road",
    voorwie: [
      { titel: "Transport companies", tekst: "Overview of the whole fleet, from MOT to cost per kilometre. Multiple drivers and mechanics, neatly separated by role." },
      { titel: "Couriers & van fleets", tekst: "Plan trips, get digital sign-off at the customer and track hours — even without your own workshop you get full value." },
      { titel: "Workshops", tekst: "Reports arrive on one board, schedule repairs and deliver a clean job sheet with your own logo and VAT." },
    ],
    showTitle: "Workshop & planning", showH2: "From report to repair, without phone calls",
    showText: "A driver reports a problem on the road — with a photo. The workshop sees it on the board instantly, schedules the repair and creates a job sheet afterwards. Costs land on the right vehicle automatically.",
    showList: ["Reports arrive live — with push even when the app is closed", "Daily planning with mechanics and time slots", "Job sheet as PDF with your own logo & details", "Costs automatically on the right vehicle"],
    stepTitle: "Live in 3 steps", stepH2: "Start today",
    stappen: [
      { titel: "Add your fleet", tekst: "Just type the plates — make, type and MOT date come from the RDW registry automatically." },
      { titel: "Invite your team", tekst: "Drivers create their own login with the company code and pick their own language. The workshop gets its own view." },
      { titel: "Everything under control", tekst: "Reports, checks, trips, hours, planning, costs and inspections in one place — at the office and on the road." },
    ],
    tourTitle: "See it in action", tourH2: "A look inside the app",
    tour: [
      { titel: "Reporting", tekst: "Cost per kilometre, most expensive vehicles and the reports trend — at a glance." },
      { titel: "Costs & job sheets", tekst: "Every expense on the right vehicle, with exports and job sheets per period." },
    ],
    faqTitle: "Frequently asked questions", faqH2: "Good to know",
    faq: [
      { q: "What does it cost?", a: "Sign-up is currently by request. Leave your details in the form and we'll discuss what fits your fleet." },
      { q: "Do I need to install anything?", a: "No. Truck & Trailer runs in the browser on phone, tablet and computer. You can add it to your home screen for quick access and notifications." },
      { q: "Can drivers work in their own language?", a: "Yes. The driver screens are available in 10 languages, including Polish, Romanian, Ukrainian, Turkish and more. They pick their own language." },
      { q: "Does it work without internet?", a: "Yes. Drivers can file a report or log their hours without a connection. As soon as they're back online, everything is sent automatically." },
      { q: "Is my data safe?", a: "Yes. Access is separated per role and per company, photos and documents live in restricted storage and all connections are encrypted." },
      { q: "Can I invoice under my own name?", a: "Absolutely. Set up your company profile with logo, address, registration, VAT and IBAN; job sheets, invoices and delivery notes automatically use your branding." },
    ],
    reqTitle: "Sign-up by request", reqH2: "Request access",
    reqText: "Leave your details and we'll get in touch and set up your company. Prefer direct contact? Use the buttons below.",
    fNaam: "Your name", fBedrijf: "Company name", fEmail: "Email address", fTel: "Phone (optional)", fBericht: "Tell us briefly about your fleet (optional)",
    fSend: "Send request", fBusy: "Sending…",
    fSentTitle: "Thanks, we've received your request!", fSentText: "We'll get in touch as soon as possible.",
    errNaam: "Enter your name.", errEmail: "Enter a valid email address.", errSend: "Could not send the request. Feel free to email us directly.",
    footer: "Fleet and workshop management for transport companies.",
  },
};

// FAQ-item met eigen open/dicht-state (module-level → geen remounts).
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid #1E2733", borderRadius: 14, background: "rgba(255,255,255,.015)", overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: "#E7ECF3" }}>{q}</span>
        <ChevronDown size={18} color="#8FB8FF" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && <div style={{ padding: "0 18px 16px", fontFamily: "Inter, sans-serif", fontSize: 14, color: "#B4BCC9", lineHeight: 1.65 }}>{a}</div>}
    </div>
  );
}

function BrowserFrame({ src, alt }) {
  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #1E2733", boxShadow: "0 30px 60px rgba(0,0,0,.4)", background: "#0d1119" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderBottom: "1px solid #1a2230" }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: "#FF5F57" }} />
        <span style={{ width: 10, height: 10, borderRadius: 999, background: "#FEBC2E" }} />
        <span style={{ width: 10, height: 10, borderRadius: 999, background: "#28C840" }} />
      </div>
      <img src={src} alt={alt} loading="lazy" style={{ width: "100%", display: "block" }} />
    </div>
  );
}

// Reveal-on-scroll wrapper (module-level component → geen remounts).
function Reveal({ children, delay = 0, y = 26, style }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ ...style, opacity: shown ? 1 : 0, transform: shown ? "none" : `translateY(${y}px)`, transition: `opacity .7s ease ${delay}ms, transform .8s cubic-bezier(.2,.7,.2,1) ${delay}ms` }}>
      {children}
    </div>
  );
}

function Laptop({ src, alt }) {
  return (
    <div style={{ width: "100%", maxWidth: 760 }}>
      <div style={{ background: "linear-gradient(180deg,#1b2432,#0d1119)", borderRadius: "16px 16px 5px 5px", padding: 11, border: "1px solid #2a3444", boxShadow: "0 40px 90px rgba(0,0,0,.55)" }}>
        <div style={{ borderRadius: 9, overflow: "hidden", border: "1px solid #05070b", background: "#0A0E14" }}>
          <img src={src} alt={alt} loading="lazy" style={{ width: "100%", display: "block" }} />
        </div>
      </div>
      <div style={{ position: "relative", height: 15, width: "110%", marginLeft: "-5%", background: "linear-gradient(180deg,#222c3d,#121822)", borderRadius: "0 0 13px 13px", boxShadow: "0 24px 34px rgba(0,0,0,.45)" }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 96, height: 6, background: "#05070b", borderRadius: "0 0 7px 7px" }} />
      </div>
    </div>
  );
}

function Phone({ src, alt, style }) {
  return (
    <div style={{ width: 214, background: "#05070b", borderRadius: 32, padding: 7, border: "1px solid #2a3444", boxShadow: "0 34px 60px rgba(0,0,0,.6)", ...style }}>
      <div style={{ position: "relative", borderRadius: 26, overflow: "hidden", background: "#0A0E14" }}>
        <div style={{ position: "absolute", top: 7, left: "50%", transform: "translateX(-50%)", width: 64, height: 16, background: "#05070b", borderRadius: 11, zIndex: 2 }} />
        <img src={src} alt={alt} loading="lazy" style={{ width: "100%", display: "block" }} />
      </div>
    </div>
  );
}

export default function Landing({ onLogin, onActivate, onDemo, onLegal, onVlootCheck }) {
  // Taal van de marketingpagina: NL of EN, onthouden in de browser. Eerste
  // bezoek volgt de browsertaal.
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem("tt_landing_lang");
      if (saved && LN[saved]) return saved;
      return (navigator.language || "").toLowerCase().startsWith("en") ? "en" : "nl";
    } catch { return "nl"; }
  });
  const L = LN[lang] || LN.nl;
  const pickLang = (c) => { setLang(c); try { localStorage.setItem("tt_landing_lang", c); } catch { /* noop */ } };

  const [form, setForm] = useState({ naam: "", bedrijf: "", email: "", telefoon: "", bericht: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");

  const submit = async () => {
    setErr("");
    if (!form.naam.trim()) { setErr(L.errNaam); return; }
    if (!validEmail(form.email)) { setErr(L.errEmail); return; }
    setBusy(true);
    try { await sendContactRequest(form); setSent(true); }
    catch (e) { setErr(e.message || L.errSend); }
    finally { setBusy(false); }
  };
  const scrollToForm = () => { try { document.getElementById("aanvraag")?.scrollIntoView({ behavior: "smooth" }); } catch { /* noop */ } };

  return (
    <div style={{ background: "#0A0E14", minHeight: "100vh", color: "#E7ECF3", overflowX: "hidden", position: "relative" }}>
      <style>{`
        .ln-wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px; position: relative; z-index: 1; }
        .ln-btn { font-family: Inter, sans-serif; font-weight: 600; font-size: 14px; border-radius: 11px; padding: 12px 20px; cursor: pointer; border: none; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: transform .14s ease, box-shadow .14s ease, background .14s ease, border-color .14s ease; }
        .ln-btn:hover { transform: translateY(-2px); }
        .ln-primary { background: linear-gradient(180deg,#5A97FF,#3B82F6); color: #fff; box-shadow: 0 10px 26px rgba(59,130,246,.4); }
        .ln-primary:hover { box-shadow: 0 14px 34px rgba(59,130,246,.55); }
        .ln-ghost { background: rgba(255,255,255,.03); color: #E7ECF3; border: 1px solid #232B38; }
        .ln-ghost:hover { border-color: #3B82F6; background: rgba(59,130,246,.08); }
        .ln-card { background: linear-gradient(180deg,rgba(24,31,43,.7),rgba(15,20,30,.7)); border: 1px solid #1E2733; border-radius: 18px; padding: 24px; transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .ln-card:hover { transform: translateY(-4px); border-color: #2c3a4e; box-shadow: 0 20px 40px rgba(0,0,0,.35); }
        .ln-input { width: 100%; background: #0E1520; border: 1px solid #2A3340; border-radius: 11px; padding: 12px 14px; color: #E7ECF3; font-family: Inter, sans-serif; font-size: 14px; box-sizing: border-box; transition: border-color .15s ease; }
        .ln-input:focus { outline: none; border-color: ${ACCENT}; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
        .ln-eyebrow { font-family: Inter, sans-serif; font-size: 12.5px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #6E9BF0; }
        .ln-grad { background: linear-gradient(100deg,#9EC1FF, #3B82F6 40%, #22D3B0); -webkit-background-clip: text; background-clip: text; color: transparent; background-size: 200% auto; animation: ln-shimmer 6s linear infinite; }
        .ln-blob { position: absolute; border-radius: 50%; filter: blur(90px); opacity: .5; z-index: 0; pointer-events: none; }
        .ln-float { animation: ln-float 7s ease-in-out infinite; }
        .ln-float2 { animation: ln-float 8.5s ease-in-out infinite; }
        @keyframes ln-shimmer { to { background-position: 200% center; } }
        @keyframes ln-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes ln-drift { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(40px,30px) scale(1.15); } }
        .ln-h1 { font-family: Oswald, sans-serif; font-weight: 700; font-size: 58px; line-height: 1.03; letter-spacing: -0.5px; }
        .ln-h2 { font-family: Oswald, sans-serif; font-weight: 600; font-size: 34px; }
        .ln-hero-grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 30px; align-items: center; }
        .ln-showcase { display: grid; grid-template-columns: 1.15fr .85fr; gap: 34px; align-items: center; }
        .ln-stats { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; margin-top: 46px; }
        .ln-form-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
        @media (max-width: 900px) {
          .ln-hero-grid, .ln-showcase { grid-template-columns: minmax(0,1fr); }
          .ln-h1 { font-size: 40px; }
          .ln-h2 { font-size: 27px; }
          .ln-hide-sm { display: none !important; }
          .ln-hero-mock { margin-top: 8px; }
        }
        @media (max-width: 560px) {
          /* Op een smalle telefoon passen 4 stats-kolommen en 2 formulier-
             kolommen niet: teksten braken per woord af. */
          .ln-stats { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .ln-form-grid { grid-template-columns: minmax(0,1fr); }
        }
        @media (prefers-reduced-motion: reduce) { .ln-float,.ln-float2,.ln-grad { animation: none !important; } }
      `}</style>

      {/* Aurora achtergrond */}
      <div className="ln-blob" style={{ width: 520, height: 520, top: -120, left: -80, background: "#1e4fb0", animation: "ln-drift 20s ease-in-out infinite alternate" }} />
      <div className="ln-blob" style={{ width: 460, height: 460, top: 180, right: -120, background: "#0f6b63", animation: "ln-drift 24s ease-in-out infinite alternate-reverse" }} />

      {/* Topbar */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(10,14,20,.72)", backdropFilter: "blur(12px)", borderBottom: "1px solid #161C25" }}>
        <div className="ln-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 66 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: ACCENT + "22", display: "flex", alignItems: "center", justifyContent: "center" }}><Truck size={18} color={ACCENT} /></div>
            <span style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 19, letterSpacing: .5 }}>TRUCK <span style={{ color: ACCENT }}>&amp;</span> TRAILER</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Taalwissel NL/EN */}
            <div style={{ display: "inline-flex", border: "1px solid #232B38", borderRadius: 9, overflow: "hidden" }} role="group" aria-label="Taal / Language">
              {["nl", "en"].map((c) => (
                <button key={c} onClick={() => pickLang(c)} style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, padding: "7px 11px", border: "none", cursor: "pointer", textTransform: "uppercase", background: lang === c ? ACCENT : "transparent", color: lang === c ? "#fff" : "#98A1B0" }}>{c}</button>
              ))}
            </div>
            <button className="ln-btn ln-ghost ln-hide-sm" onClick={onActivate}><Ticket size={15} /> {L.navActivate}</button>
            <button className="ln-btn ln-ghost" onClick={onLogin}><LogIn size={15} /> {L.navLogin}</button>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="ln-wrap" style={{ paddingTop: 64, paddingBottom: 40 }}>
        <div className="ln-hero-grid">
          <div>
            <Reveal>
              {/* Geen nep-sterrenscore: dat wekt een reviewclaim die (nog) niet bestaat. */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 999, border: "1px solid #233047", background: "rgba(59,130,246,.08)", marginBottom: 18 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: TEAL, boxShadow: `0 0 8px ${TEAL}` }} />
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#B4BCC9" }}>{L.badge}</span>
              </div>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="ln-h1">{L.h1a}<br /><span className="ln-grad">{L.h1b}</span></h1>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17, color: "#B4BCC9", maxWidth: 520, marginTop: 18, lineHeight: 1.6 }}>
                {L.heroSub}
              </p>
            </Reveal>
            <Reveal delay={180}>
              <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
                <button className="ln-btn ln-primary" onClick={scrollToForm}>{L.ctaRequest} <ArrowRight size={16} /></button>
                {onDemo && <button className="ln-btn ln-ghost" onClick={onDemo}>{L.ctaDemo}</button>}
                {onVlootCheck && <button className="ln-btn ln-ghost" onClick={onVlootCheck} style={{ borderColor: "#22D3B055", color: "#22D3B0" }}>{L.vcLink}</button>}
                <button className="ln-btn ln-ghost" onClick={onLogin}>{L.ctaLogin}</button>
              </div>
            </Reveal>
            <Reveal delay={240}>
              <div style={{ display: "flex", gap: 18, marginTop: 26, flexWrap: "wrap", fontFamily: "Inter, sans-serif", fontSize: 13, color: "#98A1B0" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Globe size={14} color={TEAL} /> {L.heroTag1}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><WifiOff size={14} color={TEAL} /> {L.heroTag2}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BellRing size={14} color={TEAL} /> {L.heroTag3}</span>
              </div>
              {/* Disambiguatie: dit domein wordt verward met fysieke werkplaatsen
                  (truckentrailer.nl e.a.). Eén eerlijke regel voorkomt verdwaalde
                  bezoekers én maakt zoekmachines duidelijk dat dit software is. */}
              <div style={{ marginTop: 16, fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#6B7585", maxWidth: 520, lineHeight: 1.5 }}>{L.notGarage}</div>
            </Reveal>
          </div>

          {/* Hero mockups */}
          <Reveal delay={200} y={34} style={{ position: "relative" }}>
            <div className="ln-hero-mock" style={{ position: "relative", paddingBottom: 40 }}>
              <div className="ln-float"><Laptop src="/landing/dashboard.webp" alt="Truck & Trailer dashboard op laptop" /></div>
              <div className="ln-float2 ln-hide-sm" style={{ position: "absolute", right: -6, bottom: -6, zIndex: 2 }}>
                <Phone src="/landing/driver.webp" alt="Meldingen maken op telefoon" />
              </div>
            </div>
          </Reveal>
        </div>

        {/* Stats-strip */}
        <Reveal delay={120}>
          <div className="ln-stats">
            {L.stats.map(([v, l]) => (
              <div key={l} style={{ textAlign: "center", padding: "16px 8px", borderRadius: 14, border: "1px solid #1A2230", background: "rgba(255,255,255,.015)" }}>
                <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 26, color: "#E7ECF3" }}>{v}</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#98A1B0" }}>{l}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* Features */}
      <div className="ln-wrap" style={{ paddingTop: 64, paddingBottom: 20 }}>
        <Reveal><div style={{ textAlign: "center", marginBottom: 34 }}>
          <div className="ln-eyebrow">{L.featTitle}</div>
          <h2 className="ln-h2" style={{ marginTop: 8 }}>{L.featH2}</h2>
        </div></Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
          {L.features.map((f, i) => {
            const m = FEATURE_ICONS[i] || FEATURE_ICONS[0];
            return (
              <Reveal key={f.titel} delay={(i % 3) * 80}>
                <div className="ln-card" style={{ height: "100%" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: m.kleur + "1e", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 15 }}><m.icon size={22} color={m.kleur} /></div>
                  <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 18.5, marginBottom: 7 }}>{f.titel}</div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#B4BCC9", lineHeight: 1.6 }}>{f.tekst}</div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>

      {/* Wat kan je er allemaal mee — complete checklist */}
      <div className="ln-wrap" style={{ paddingTop: 64, paddingBottom: 20 }}>
        <Reveal><div style={{ textAlign: "center", marginBottom: 30 }}>
          <div className="ln-eyebrow">{L.capsTitle}</div>
          <h2 className="ln-h2" style={{ marginTop: 8 }}>{L.capsH2}</h2>
        </div></Reveal>
        <Reveal delay={80}>
          <div className="ln-card" style={{ padding: "26px 28px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "12px 26px" }}>
              {L.caps.map((c) => (
                <div key={c} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontFamily: "Inter, sans-serif", fontSize: 14, color: "#D3DAE5", lineHeight: 1.5 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 999, background: TEAL + "1e", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}><Check size={12} color={TEAL} /></span>
                  {c}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>

      {/* Voor wie */}
      <div className="ln-wrap" style={{ paddingTop: 72, paddingBottom: 20 }}>
        <Reveal><div style={{ textAlign: "center", marginBottom: 34 }}>
          <div className="ln-eyebrow">{L.wieTitle}</div>
          <h2 className="ln-h2" style={{ marginTop: 8 }}>{L.wieH2}</h2>
        </div></Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
          {L.voorwie.map((w, i) => {
            const Icon = VOOR_WIE_ICONS[i] || Truck;
            return (
              <Reveal key={w.titel} delay={i * 90}>
                <div className="ln-card" style={{ height: "100%" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: ACCENT + "1e", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Icon size={22} color={ACCENT} /></div>
                  <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 18.5, marginBottom: 7 }}>{w.titel}</div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#B4BCC9", lineHeight: 1.6 }}>{w.tekst}</div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>

      {/* Showcase: werkvloer + phone */}
      <div className="ln-wrap" style={{ paddingTop: 72, paddingBottom: 20 }}>
        <div className="ln-showcase">
          <Reveal><div className="ln-float" style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #1E2733", boxShadow: "0 40px 80px rgba(0,0,0,.5)" }}>
            <img src="/landing/werkvloer.webp" alt="Digitale werkvloer" loading="lazy" style={{ width: "100%", display: "block" }} />
          </div></Reveal>
          <Reveal delay={100}>
            <div className="ln-eyebrow">{L.showTitle}</div>
            <h2 className="ln-h2" style={{ marginTop: 8 }}>{L.showH2}</h2>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, color: "#B4BCC9", lineHeight: 1.65, marginTop: 12 }}>
              {L.showText}
            </p>
            <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
              {L.showList.map((t) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "Inter, sans-serif", fontSize: 14, color: "#D3DAE5" }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, background: TEAL + "1e", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Check size={13} color={TEAL} /></span>
                  {t}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>

      {/* Hoe werkt het */}
      <div className="ln-wrap" style={{ paddingTop: 72, paddingBottom: 20 }}>
        <Reveal><div style={{ textAlign: "center", marginBottom: 34 }}>
          <div className="ln-eyebrow">{L.stepTitle}</div>
          <h2 className="ln-h2" style={{ marginTop: 8 }}>{L.stepH2}</h2>
        </div></Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
          {L.stappen.map((s, i) => (
            <Reveal key={s.titel} delay={i * 90}>
              <div className="ln-card" style={{ height: "100%" }}>
                <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 30, color: ACCENT }}>{i + 1}</div>
                <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 18.5, margin: "6px 0" }}>{s.titel}</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#B4BCC9", lineHeight: 1.6 }}>{s.tekst}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Product-tour: extra schermen */}
      <div className="ln-wrap" style={{ paddingTop: 72, paddingBottom: 20 }}>
        <Reveal><div style={{ textAlign: "center", marginBottom: 34 }}>
          <div className="ln-eyebrow"><span className="inline" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BarChart3 size={13} /> {L.tourTitle}</span></div>
          <h2 className="ln-h2" style={{ marginTop: 8 }}>{L.tourH2}</h2>
        </div></Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 20 }}>
          {L.tour.map((t, i) => (
            <Reveal key={t.titel} delay={i * 100}>
              <BrowserFrame src={TOUR_SRC[i]} alt={t.titel} />
              <div style={{ marginTop: 12 }}>
                <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 17 }}>{t.titel}</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#B4BCC9", lineHeight: 1.6, marginTop: 3 }}>{t.tekst}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="ln-wrap" style={{ paddingTop: 72, paddingBottom: 20 }}>
        <Reveal><div style={{ textAlign: "center", marginBottom: 30 }}>
          <div className="ln-eyebrow">{L.faqTitle}</div>
          <h2 className="ln-h2" style={{ marginTop: 8 }}>{L.faqH2}</h2>
        </div></Reveal>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 10 }}>
          {L.faq.map((f, i) => (
            <Reveal key={f.q} delay={Math.min(i, 4) * 50}><FaqItem q={f.q} a={f.a} /></Reveal>
          ))}
        </div>
      </div>

      {/* Aanvraag / contact */}
      <div id="aanvraag" className="ln-wrap" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <Reveal>
          <div className="ln-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "32px 28px", borderBottom: "1px solid #1E2733", background: "linear-gradient(135deg,rgba(30,79,176,.35),rgba(15,20,30,.2))" }}>
              <div className="ln-eyebrow">{L.reqTitle}</div>
              <h2 className="ln-h2" style={{ marginTop: 8 }}>{L.reqH2}</h2>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, color: "#B4BCC9", lineHeight: 1.6, marginTop: 10, maxWidth: 580 }}>
                {L.reqText}
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <a className="ln-btn ln-ghost" href={`mailto:${CONTACT_EMAIL}`}><Mail size={15} /> {CONTACT_EMAIL}</a>
                {CONTACT_TEL && <a className="ln-btn ln-ghost" href={`tel:${CONTACT_TEL.replace(/\s/g, "")}`}><PhoneIcon size={15} /> Bellen</a>}
                {WHATSAPP && <a className="ln-btn ln-ghost" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> WhatsApp</a>}
              </div>
            </div>
            <div style={{ padding: 28 }}>
              {sent ? (
                <div style={{ textAlign: "center", padding: "26px 0" }}>
                  <div style={{ width: 58, height: 58, borderRadius: "50%", background: "#12271C", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Check size={30} color="#34D399" /></div>
                  <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 21 }}>{L.fSentTitle}</div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "#B4BCC9", marginTop: 6 }}>{L.fSentText}</div>
                </div>
              ) : (
                <div className="ln-form-grid">
                  <div style={{ gridColumn: "1 / -1" }}><Field label={L.fNaam + " *"} value={form.naam} onChange={(v) => set("naam", v)} /></div>
                  <Field label={L.fBedrijf} value={form.bedrijf} onChange={(v) => set("bedrijf", v)} />
                  <Field label={L.fTel} value={form.telefoon} onChange={(v) => set("telefoon", v)} />
                  <div style={{ gridColumn: "1 / -1" }}><Field label={L.fEmail + " *"} type="email" value={form.email} onChange={(v) => set("email", v)} /></div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>{L.fBericht}</label>
                    <textarea className="ln-input" rows={3} style={{ resize: "vertical" }} value={form.bericht} onChange={(e) => set("bericht", e.target.value)} />
                  </div>
                  {err && <div style={{ gridColumn: "1 / -1", color: "#F0453F", fontFamily: "Inter, sans-serif", fontSize: 12.5 }}>{err}</div>}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <button className="ln-btn ln-primary" onClick={submit} disabled={busy} style={{ width: "100%", justifyContent: "center", opacity: busy ? 0.7 : 1 }}>{busy ? L.fBusy : L.fSend}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #161C25", position: "relative", zIndex: 1 }}>
        <div className="ln-wrap" style={{ padding: "22px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Truck size={15} color={ACCENT} />
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#6B7585" }}>© {new Date().getFullYear()} Truck &amp; Trailer — {L.footer}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {onVlootCheck && <button onClick={onVlootCheck} style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#8FB8FF", background: "none", border: "none", cursor: "pointer" }}>Gratis APK-check</button>}
            {onLegal && <button onClick={() => onLegal("/privacy")} style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#8FB8FF", background: "none", border: "none", cursor: "pointer" }}>Privacy</button>}
            {onLegal && <button onClick={() => onLegal("/voorwaarden")} style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#8FB8FF", background: "none", border: "none", cursor: "pointer" }}>Voorwaarden</button>}
            <button onClick={onLogin} style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#8FB8FF", background: "none", border: "none", cursor: "pointer" }}>{L.navLogin} →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const lbl = { display: "block", color: "#98A1B0", fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, marginBottom: 5 };
function Field({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <input className="ln-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
