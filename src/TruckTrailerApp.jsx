import React, { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard, Truck, Container, Package, Wrench, KanbanSquare,
  AlertTriangle, Bell, Plus, Calendar, Camera, Video, X,
  CheckCircle2, Building2, Mic, MicOff, ChevronDown,
  Users, Sparkles, ScanEye, Send, LogOut, Mail, Phone, ShieldCheck, SlidersHorizontal,
  ChevronLeft, ChevronRight, Menu, Trash2, Euro, Search, Download, FileText, KeyRound, Contact, ClipboardList, PenLine, Boxes, Check, Ticket, Copy, LifeBuoy, Inbox, Crown, BellRing, RefreshCw, BarChart3, TrendingUp, Clock, Coffee, MapPin
} from "lucide-react";
import { saveStateDebounced, lookupRDW, createEmployeeAccount, authHeader, createActivationCode, listActivationCodes, createSupportTicket, mySupportTickets, listSupportTickets, setSupportTicketStatus, uploadReportMedia, signedMediaUrls, driverAddReport, driverAddCheck, driverCompleteRide, driverSaveHours, driverDeleteHours, cancelSubscription, reactivateSubscription, adminListProfiles, adminDeleteUser, adminDeleteCompany, setUserSuperadmin, loadCompanyStateScoped, loadState, driverBootstrap, inviteEmployeeByEmail, sendActivationEmail, uploadVehicleDocument, signedDocUrl, deleteVehicleDocument, driverVehicleOpenReports, deleteEmployeeAccount } from "./api.js";
import { supabase } from "./supabaseClient.js";
import { queuedCount, flushQueue, onQueueChange } from "./offlineQueue.js";
import { LANGS, getLang, setLang, t as translate, ISSUE_KEYS, ZONE_KEYS, CHECK_KEYS } from "./i18n.js";
import { pushSupported, getPushConfig, isPushSubscribed, subscribeToPush, unsubscribeFromPush, notifyCompany, registerSW } from "./push.js";

// Vertaal-hook: geeft t() terug en her-rendert bij een taalwissel.
function useT() {
  const [lang, setLangState] = useState(getLang());
  useEffect(() => {
    const h = (e) => setLangState((e && e.detail) || getLang());
    window.addEventListener("tt-lang", h);
    return () => window.removeEventListener("tt-lang", h);
  }, []);
  const t = (key, vars) => {
    let s = translate(key, lang);
    if (vars) Object.keys(vars).forEach((k) => { s = s.replace("{" + k + "}", vars[k]); });
    return s;
  };
  return { t, lang };
}

// Taalkiezer voor de chauffeur (vlag + taalnaam).
function LangSwitcher({ compact = false }) {
  const { lang } = useT();
  return (
    <select aria-label="Taal / Language" className="tg-input" style={{ width: "auto", padding: compact ? "5px 8px" : "7px 10px", fontSize: 13 }} value={lang} onChange={(e) => setLang(e.target.value)}>
      {LANGS.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
    </select>
  );
}

/* ---------------------------------------------------------------------
   EIGEN VOERTUIG-PICTOGRAMMEN (in lucide-stijl: stroke = color-prop)
   - IconTruckTrailer: trekker + lange oplegger (vrachtwagens)
   - IconBoxTruck: bakwagen (cabine + gesloten laadbak)
   - IconVan: bestelwagen (busje)
--------------------------------------------------------------------- */
function svgWrap(size, color, rest, children) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...rest}>{children}</svg>
  );
}
function IconTruckTrailer({ size = 24, color = "currentColor", ...rest }) {
  // Trekker rechts, oplegger links.
  return svgWrap(size, color, rest, <>
    <rect x="2" y="7.5" width="12.5" height="7.5" rx="0.8" />
    <path d="M15 9 h4 l3 3 v3 H15 z" />
    <circle cx="6" cy="17.4" r="1.4" />
    <circle cx="10.5" cy="17.4" r="1.4" />
    <circle cx="18.8" cy="17.4" r="1.4" />
  </>);
}
function IconTrailer({ size = 24, color = "currentColor", ...rest }) {
  // Losse oplegger/aanhanger: lange laadbak, tandem-as, steunpoot + koppeling
  // aan de rechterkant (geen cabine).
  return svgWrap(size, color, rest, <>
    <rect x="5" y="6.8" width="16" height="7.6" rx="1" />
    <path d="M21 10.6 H23" />
    <path d="M18.5 14.4 v2.6" />
    <circle cx="8.2" cy="17.2" r="1.5" />
    <circle cx="12.5" cy="17.2" r="1.5" />
  </>);
}
function IconBoxTruck({ size = 24, color = "currentColor", ...rest }) {
  return svgWrap(size, color, rest, <>
    <rect x="2" y="6.5" width="11" height="8.5" rx="0.8" />
    <path d="M13 9.5 h3.5 l3.5 3.3 V15 H13 z" />
    <circle cx="6" cy="17.4" r="1.4" />
    <circle cx="16.5" cy="17.4" r="1.4" />
  </>);
}
function IconVan({ size = 24, color = "currentColor", ...rest }) {
  return svgWrap(size, color, rest, <>
    <path d="M2 15 V9 a1 1 0 0 1 1-1 h10.5 l4 3.4 H21 a1 1 0 0 1 1 1 V15 z" />
    <path d="M13.5 8 v3.4 H17.5" />
    <circle cx="6.5" cy="16.6" r="1.5" />
    <circle cx="17.5" cy="16.6" r="1.5" />
  </>);
}

/* ---------------------------------------------------------------------
   DESIGN TOKENS — ink #0A0E14 · panel #12171F · raised #1A2129
   border #232B38 · text #E7ECF3 · dim #B4BCC9 · amber #FF8A00 (signal)
   teal #22D3B0 (diagnostic) · danger #F0453F · success #34D399
   plate #FFCC00 (NL kenteken)
--------------------------------------------------------------------- */

// Fonts worden zelf-gehost geladen via src/index.css (@font-face). Deze constante
// blijft leeg zodat de bestaande <style>-templates ongewijzigd kunnen blijven.
const FONT_IMPORT = ``;

const seedCompanies = [
  { id: "blex", name: "Blex Logistics", slug: "blexlogistics.nl", accent: "#3B82F6" },
  { id: "vandijk", name: "Van Dijk Transport", slug: "vandijktransport.nl", accent: "#22D3B0" },
];

// accent colors assigned to newly registered companies (cycled)
const ACCENT_PALETTE = ["#3B82F6", "#22D3B0", "#F59E0B", "#A855F7", "#EC4899", "#14B8A6", "#F0453F", "#84CC16"];

function slugify(name) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 24) || "bedrijf";
}

const seedVehicles = {
  blex: [
    { id: "v1", kenteken: "84-BSX-2", merk: "Volvo FH 460", type: "Truck", bouwjaar: 2022, km: 184300, status: "operational", health: 92, driver: "R. Postma", apkTot: "2026-11-14", tachoTot: "2027-03-01", tachoPlicht: true, verzekeringTot: "2026-12-31" },
    { id: "v2", kenteken: "VX-77-KL", merk: "DAF XF 480", type: "Truck", bouwjaar: 2021, km: 261900, status: "attention", health: 68, driver: "J. Bakker", apkTot: "2026-07-20", tachoTot: "2026-07-10", tachoPlicht: true, verzekeringTot: "2026-09-01" },
    { id: "v3", kenteken: "SD-14-TR", merk: "Scania R450", type: "Truck", bouwjaar: 2023, km: 92100, status: "workshop", health: 41, driver: "—", apkTot: "2027-01-08", tachoTot: "2027-05-01", tachoPlicht: true, verzekeringTot: "2026-12-31" },
    { id: "v4", kenteken: "GH-99-VB", merk: "Mercedes Sprinter", type: "Bestelwagen", bouwjaar: 2020, km: 138700, status: "operational", health: 88, driver: "M. de Wit", apkTot: "2026-08-05", tachoTot: "", tachoPlicht: false, verzekeringTot: "2026-10-15" },
  ],
  vandijk: [
    { id: "v5", kenteken: "12-XZR-3", merk: "MAN TGX", type: "Truck", bouwjaar: 2022, km: 145200, status: "operational", health: 95, driver: "T. Visser", apkTot: "2026-10-01", tachoTot: "2027-02-01", tachoPlicht: true, verzekeringTot: "2026-11-30" },
    { id: "v6", kenteken: "44-KPD-9", merk: "Iveco S-Way", type: "Truck", bouwjaar: 2019, km: 310400, status: "attention", health: 59, driver: "L. Jansen", apkTot: "2026-07-05", tachoTot: "2026-08-20", tachoPlicht: true, verzekeringTot: "2026-08-01" },
  ],
};

const seedTrailers = {
  blex: [
    { id: "t1", kenteken: "OP-31-HD", type: "Koeltrailer", merk: "Schmitz Cargobull", bouwjaar: 2021, status: "operational" },
    { id: "t2", kenteken: "OP-88-BX", type: "Huifoplegger", merk: "Krone", bouwjaar: 2020, status: "workshop" },
  ],
  vandijk: [{ id: "t3", kenteken: "ZL-05-QW", type: "Boxtrailer", merk: "Van Eck", bouwjaar: 2022, status: "operational" }],
};

const seedParts = {
  blex: [
    { id: "p1", naam: "Remblokken set (as)", voorraad: 6, min: 4, eenheid: "sets", prijs: 145 },
    { id: "p2", naam: "Luchtdroger cartridge", voorraad: 1, min: 3, eenheid: "stuks", prijs: 89 },
    { id: "p3", naam: "Ruitenwisserbladen", voorraad: 12, min: 4, eenheid: "stuks", prijs: 14 },
    { id: "p4", naam: "Motorolie 10W-40 (20L)", voorraad: 2, min: 5, eenheid: "vaten", prijs: 118 },
  ],
  vandijk: [{ id: "p5", naam: "Koppelingsset", voorraad: 3, min: 2, eenheid: "sets", prijs: 410 }],
};

const seedMaintenance = {
  blex: [
    { id: "m1", vehicle: "84-BSX-2", taak: "Grote beurt", dueKm: 200000, dueDate: "2026-08-14", status: "gepland" },
    { id: "m2", vehicle: "VX-77-KL", taak: "APK keuring", dueKm: null, dueDate: "2026-07-09", status: "urgent" },
    { id: "m3", vehicle: "SD-14-TR", taak: "Koppeling vervangen", dueKm: null, dueDate: "2026-07-03", status: "in_uitvoering" },
  ],
  vandijk: [{ id: "m4", vehicle: "44-KPD-9", taak: "Remmen controleren", dueKm: 315000, dueDate: "2026-07-20", status: "gepland" }],
};

// Cost entries per company, linked to a vehicle kenteken. category: onderhoud|brandstof|reparatie|verzekering|belasting|overig
const seedCosts = {
  blex: [
    { id: "c1", vehicle: "84-BSX-2", categorie: "onderhoud", bedrag: 1240, datum: "2026-02-11", omschrijving: "Grote beurt + filters" },
    { id: "c2", vehicle: "84-BSX-2", categorie: "brandstof", bedrag: 3820, datum: "2026-06-01", omschrijving: "Diesel Q2" },
    { id: "c3", vehicle: "VX-77-KL", categorie: "reparatie", bedrag: 890, datum: "2026-05-20", omschrijving: "Remschijven voor" },
    { id: "c4", vehicle: "SD-14-TR", categorie: "reparatie", bedrag: 2150, datum: "2026-06-28", omschrijving: "Koppeling" },
  ],
  vandijk: [
    { id: "c5", vehicle: "12-XZR-3", categorie: "onderhoud", bedrag: 760, datum: "2026-04-03", omschrijving: "Kleine beurt" },
  ],
};

const seedReports = {
  blex: [
    { id: "r1", vehicle: "SD-14-TR", chauffeur: "P. Kramer", omschrijving: "Koppeling slipt bij optrekken, ruikt naar verbrand.", prioriteit: "kritiek", status: "in_behandeling", datum: "2026-07-01", zone: "cabine", wanneer: "Bij rijden", hoelang: "Vandaag", veilig: "Twijfel" },
    { id: "r2", vehicle: "VX-77-KL", chauffeur: "J. Bakker", omschrijving: "Vreemd geluid bij remmen, lijkt van linksvoor te komen.", prioriteit: "gemiddeld", status: "nieuw", datum: "2026-06-29", zone: "wielen", wanneer: "Bij remmen", hoelang: "Paar dagen", veilig: "Ja" },
    { id: "r3", vehicle: "84-BSX-2", chauffeur: "R. Postma", omschrijving: "Kleine lekkage onder de motor gezien op de parkeerplaats.", prioriteit: "laag", status: "klaar", datum: "2026-06-20", zone: "onder", wanneer: "Bij stilstand", hoelang: "Vandaag", veilig: "Ja" },
  ],
  vandijk: [],
};

const seedUsers = {
  blex: [
    { id: "u0", naam: "Beheerder T&T", email: "beheer@truckandtrailer.nl", telefoon: "+31 6 10000000", rol: "admin", status: "actief", wachtwoord: "demo", superadmin: true },
    { id: "u1", naam: "Vova", email: "vova@blexlogistics.nl", telefoon: "+31 6 12345678", rol: "admin", status: "actief", wachtwoord: "demo" },
    { id: "u2", naam: "R. Postma", email: "postma@blexlogistics.nl", telefoon: "+31 6 22222222", rol: "chauffeur", status: "actief", wachtwoord: "demo" },
    { id: "u5", naam: "M. Smit", email: "smit@blexlogistics.nl", telefoon: "+31 6 55555555", rol: "garage", status: "actief", wachtwoord: "demo" },
    { id: "u3", naam: "J. Bakker", email: "bakker@blexlogistics.nl", telefoon: "+31 6 33333333", rol: "chauffeur", status: "uitgenodigd", wachtwoord: null },
  ],
  vandijk: [
    { id: "u4", naam: "T. Visser", email: "visser@vandijktransport.nl", telefoon: "+31 6 44444444", rol: "admin", status: "actief", wachtwoord: "demo" },
    { id: "u6", naam: "K. de Groot", email: "degroot@vandijktransport.nl", telefoon: "+31 6 66666666", rol: "garage", status: "actief", wachtwoord: "demo" },
  ],
};

const ROLE_LABEL = { admin: "Beheerder", garage: "Werkplaats", chauffeur: "Chauffeur" };

// Datum-helpers: lokale datum als "JJJJ-MM-DD" (geen UTC-verschuiving)
function toLocalKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// 'let' + een middernacht-timer in de app (zie useEffect aldaar): de PWA blijft
// vaak dagenlang open staan op een werkplaats-tablet en "vandaag" moet dan
// meeschuiven — anders tonen planning/compliance de dag ervoor.
let TODAY = toLocalKey(new Date());

const seedPlanning = {
  blex: [
    { id: "pl0", vehicle: "GH-99-VB", datum: TODAY, tijd: "14:00", duur: 60, taak: "Bandencontrole", monteur: "M. Smit" },
    { id: "pl1", vehicle: "VX-77-KL", datum: "2026-07-09", tijd: "09:00", duur: 90, taak: "APK keuring", monteur: "M. Smit" },
    { id: "pl2", vehicle: "SD-14-TR", datum: "2026-07-03", tijd: "08:00", duur: 240, taak: "Koppeling vervangen", monteur: "M. Smit" },
    { id: "pl3", vehicle: "84-BSX-2", datum: "2026-07-14", tijd: "13:00", duur: 120, taak: "Grote beurt", monteur: "M. Smit" },
  ],
  vandijk: [],
};

// Chauffeurs met hun verplichte papieren (rijbewijs C/CE, Code 95, ADR, medische keuring)
const seedDrivers = {
  blex: [
    { id: "d1", naam: "R. Postma", telefoon: "+31 6 22222222", rijbewijsTot: "2028-05-01", code95Tot: "2026-08-12", adrTot: "2027-03-01", medischTot: "2028-05-01" },
    { id: "d2", naam: "J. Bakker", telefoon: "+31 6 33333333", rijbewijsTot: "2026-07-25", code95Tot: "2029-01-15", adrTot: "", medischTot: "2026-11-01" },
    { id: "d3", naam: "M. de Wit", telefoon: "+31 6 44444444", rijbewijsTot: "2027-09-10", code95Tot: "2027-09-10", adrTot: "2026-07-30", medischTot: "2030-02-01" },
  ],
  vandijk: [],
};

// Dagelijkse voertuigcheck (DVIR): de 8 controlepunten. Nederlandse tekst is
// canoniek (de werkplaats leest NL); de chauffeur ziet ze vertaald via CHECK_KEYS.
const CHECK_POINTS = ["Banden & wielen", "Verlichting & reflectoren", "Remmen", "Spiegels & ruiten", "Olie & vloeistoffen (lekkage)", "Schade rondom", "Lading, deuren & laadklep", "Boorddocumenten & tachograaf"];

const seedChecks = {
  blex: [
    { id: "chk1", vehicle: "84-BSX-2", datum: TODAY, tijd: "07:45", chauffeur: "R. Postma", chauffeurId: "u2", issues: 0, items: CHECK_POINTS.map((p) => ({ p, ok: true, note: "" })) },
    { id: "chk2", vehicle: "VX-77-KL", datum: "2026-07-21", tijd: "06:50", chauffeur: "J. Bakker", chauffeurId: "u3", issues: 1, items: CHECK_POINTS.map((p, i) => (i === 1 ? { p, ok: false, note: "Achterlicht links kapot" } : { p, ok: true, note: "" })) },
  ],
  vandijk: [],
};

// Uren-registraties van chauffeurs (gesynchroniseerde kopie voor het
// loonoverzicht van de beheerder; de chauffeur houdt ze zelf bij).
const CUR_MONTH = TODAY.slice(0, 7);
const seedUren = {
  blex: [
    { id: "su1", chauffeurId: "u2", chauffeur: "R. Postma", datum: `${CUR_MONTH}-01`, start: "07:30", eind: "16:45", pauze: true, note: "" },
    { id: "su2", chauffeurId: "u2", chauffeur: "R. Postma", datum: `${CUR_MONTH}-02`, start: "07:30", eind: "17:15", pauze: true, note: "Rit Duitsland" },
    { id: "su3", chauffeurId: "u3", chauffeur: "J. Bakker", datum: `${CUR_MONTH}-01`, start: "06:00", eind: "14:30", pauze: true, note: "" },
  ],
  vandijk: [],
};

// Ritten met digitale aflevering (Proof of Delivery) — vooral voor koeriers-
// en busjesbedrijven: de planner zet ritten klaar, de chauffeur tekent af.
const seedRides = {
  blex: [
    { id: "rit1", datum: TODAY, vehicle: "GH-99-VB", chauffeurId: "u2", chauffeur: "R. Postma", klant: "Bakkerij Vermeulen", adres: "Dorpsstraat 12, Woerden", referentie: "ORD-2107", opmerking: "Achterom leveren, vóór 10:00", status: "gepland", pod: null },
    { id: "rit2", datum: TODAY, vehicle: "GH-99-VB", chauffeurId: "u2", chauffeur: "R. Postma", klant: "Bouwbedrijf De Groot", adres: "Industrieweg 8, Utrecht", referentie: "ORD-2108", opmerking: "", status: "gepland", pod: null },
    { id: "rit3", datum: "2026-07-21", vehicle: "GH-99-VB", chauffeurId: "u2", chauffeur: "R. Postma", klant: "Kwekerij Jansen", adres: "Veilingweg 3, Aalsmeer", referentie: "ORD-2101", opmerking: "", status: "afgeleverd", pod: { naam: "M. Jansen", tijd: "11:20", datum: "2026-07-21", opmerking: "" } },
  ],
  vandijk: [],
};

const STATUS_META_MAP = {
  operational: { label: "Operationeel", color: "#34D399" },
  attention: { label: "Let op", color: "#FF8A00" },
  workshop: { label: "In werkplaats", color: "#F0453F" },
};
// Fallback voor onbekende/ontbrekende statuswaarden in live data — één afwijkend
// record mag nooit een wit scherm geven (zelfde aanpak als PRIO_META).
const STATUS_META = new Proxy(STATUS_META_MAP, {
  get: (t, k) => t[k] || { label: "Onbekend", color: "#98A1B0" },
});

// Weekday keys, Monday first (matches JS getDay(): 0=zo..6=za, we map)
const WEEKDAYS = [
  { key: "ma", label: "Maandag", jsDay: 1 },
  { key: "di", label: "Dinsdag", jsDay: 2 },
  { key: "wo", label: "Woensdag", jsDay: 3 },
  { key: "do", label: "Donderdag", jsDay: 4 },
  { key: "vr", label: "Vrijdag", jsDay: 5 },
  { key: "za", label: "Zaterdag", jsDay: 6 },
  { key: "zo", label: "Zondag", jsDay: 0 },
];

// default weekly schedule: working ma-vr 08:00-17:00, weekend off
const defaultWeek = () => ({
  ma: { on: true, van: "08:00", tot: "17:00" },
  di: { on: true, van: "08:00", tot: "17:00" },
  wo: { on: true, van: "08:00", tot: "17:00" },
  do: { on: true, van: "08:00", tot: "17:00" },
  vr: { on: true, van: "08:00", tot: "16:00" },
  za: { on: false, van: "09:00", tot: "13:00" },
  zo: { on: false, van: "09:00", tot: "13:00" },
});

// Workshop opening hours per company
const seedWorkshopHours = {
  blex: { van: "07:30", tot: "18:00" },
  vandijk: { van: "08:00", tot: "17:00" },
};

// Per-mechanic (userId) weekly availability
const seedAvailability = {
  blex: {
    u5: defaultWeek(), // M. Smit
  },
  vandijk: {
    u6: defaultWeek(), // K. de Groot
  },
};

// Given a date string + time + a mechanic's week schedule, returns { available, reason }
function checkAvailability(dateStr, timeStr, week, workshopHours) {
  if (!dateStr) return { available: true };
  const d = new Date(dateStr + "T00:00:00");
  const jsDay = d.getDay();
  const wd = WEEKDAYS.find((w) => w.jsDay === jsDay);
  // workshop closed check
  if (workshopHours && timeStr) {
    if (timeStr < workshopHours.van || timeStr > workshopHours.tot) {
      return { available: false, reason: `Buiten werkplaatstijden (${workshopHours.van}–${workshopHours.tot}).` };
    }
  }
  if (!week || !wd) return { available: true };
  const day = week[wd.key];
  if (!day || !day.on) return { available: false, reason: `Monteur werkt niet op ${wd.label.toLowerCase()}.` };
  if (timeStr && (timeStr < day.van || timeStr > day.tot)) {
    return { available: false, reason: `Buiten werktijd van monteur (${day.van}–${day.tot} op ${wd.label.toLowerCase()}).` };
  }
  return { available: true };
}

// ---- Compliance helpers (APK, tachograaf, verzekering) ----
function daysUntil(dateStr, today = TODAY) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(today + "T00:00:00");
  return Math.round((d - t) / 86400000);
}

// Waarschuwingstermijn (in dagen) waarbinnen iets als "verloopt binnenkort"
// telt. De beheerder stelt dit in maanden in bij Instellingen; we bewaren het
// hier als module-variabele zodat alle bestaande aanroepen het automatisch
// oppikken zonder dat we overal een extra parameter hoeven mee te geven.
export let WARN_DAYS = 30;
export function setWarnMonths(m) {
  const months = Number(m);
  WARN_DAYS = Number.isFinite(months) && months > 0 ? Math.round(months * 30) : 30;
}

// status: 'verlopen' (past) | 'binnenkort' (<=WARN_DAYS) | 'ok' | 'onbekend'
function complianceStatus(dateStr, today = TODAY, warnDays = WARN_DAYS) {
  const d = daysUntil(dateStr, today);
  if (d === null) return "onbekend";
  if (d < 0) return "verlopen";
  if (d <= warnDays) return "binnenkort";
  return "ok";
}

const COMPLIANCE_META = {
  verlopen: { label: "Verlopen", color: "#F0453F" },
  binnenkort: { label: "Verloopt binnenkort", color: "#FF8A00" },
  ok: { label: "In orde", color: "#34D399" },
  onbekend: { label: "Onbekend", color: "#98A1B0" },
};

// Build the compliance items for one vehicle
function vehicleComplianceItems(v, today = TODAY) {
  const items = [
    { key: "apk", label: "APK", datum: v.apkTot },
    { key: "verzekering", label: "Verzekering", datum: v.verzekeringTot },
  ];
  if (v.tachoPlicht) items.splice(1, 0, { key: "tacho", label: "Tachograaf (SMT2)", datum: v.tachoTot });
  return items.map((it) => ({ ...it, status: complianceStatus(it.datum, today), dagen: daysUntil(it.datum, today) }));
}

// Worst status across a vehicle's compliance items (for a single badge)
function vehicleWorstCompliance(v, today = TODAY) {
  const order = { verlopen: 3, binnenkort: 2, ok: 1, onbekend: 0 };
  return vehicleComplianceItems(v, today).reduce((worst, it) => (order[it.status] > order[worst] ? it.status : worst), "ok");
}

// Regelgebaseerd voorspellend onderhoud — werkt altijd, ook zonder AI.
// Kijkt naar APK/verzekering/tacho-datums, kilometerstand, leeftijd,
// gezondheidsscore en terugkerende meldingen.
function rulePredictMaintenance(v, reports = [], today = TODAY) {
  if (!v) return { items: [] };
  const items = [];
  const push = (taak, urgentie, binnen, reden) => items.push({ taak, urgentie, binnen, reden });

  // APK
  const apkD = daysUntil(v.apkTot, today);
  if (apkD !== null) {
    if (apkD < 0) push("APK is verlopen", "hoog", `${Math.abs(apkD)} dagen te laat`, "Het voertuig mag zo niet de weg op — plan direct een APK.");
    else if (apkD <= 30) push("APK-keuring plannen", "hoog", `binnen ${apkD} dagen`, "De APK verloopt bijna.");
    else if (apkD <= 60) push("APK-keuring plannen", "gemiddeld", `binnen ${apkD} dagen`, "De APK verloopt binnen twee maanden.");
  }
  // Verzekering
  const verzD = daysUntil(v.verzekeringTot, today);
  if (verzD !== null && verzD <= 30) push("Verzekering verloopt", verzD < 0 ? "hoog" : "gemiddeld", verzD < 0 ? `${Math.abs(verzD)} dagen te laat` : `binnen ${verzD} dagen`, "Controleer of de verzekering wordt verlengd.");
  // Tachograaf (SMT2)
  if (v.tachoPlicht) {
    const tD = daysUntil(v.tachoTot, today);
    if (tD !== null && tD <= 45) push("Tachograaf-keuring (SMT2)", tD < 0 ? "hoog" : "gemiddeld", tD < 0 ? `${Math.abs(tD)} dagen te laat` : `binnen ${tD} dagen`, "De tweejaarlijkse tachograafkeuring is bijna nodig.");
  }
  // Kilometer-interval: grote beurt elke ~40.000 km.
  const km = Number(v.km) || 0;
  if (km > 0) {
    const interval = 40000;
    const naVolgende = interval - (km % interval);
    if (naVolgende <= 5000) push("Grote beurt (km-interval)", naVolgende <= 1500 ? "hoog" : "gemiddeld", `binnen ~${naVolgende.toLocaleString("nl-NL")} km`, `Op ${km.toLocaleString("nl-NL")} km nadert de volgende onderhoudsbeurt.`);
  }
  // Leeftijd
  const jaar = Number(v.bouwjaar) || null;
  const nu = Number((today || "").slice(0, 4)) || null;
  if (jaar && nu && nu - jaar >= 8) push("Extra controle door leeftijd", "laag", `${nu - jaar} jaar oud`, "Ouder voertuig: let extra op remmen, ophanging en roest.");
  // Gezondheidsscore
  if (typeof v.health === "number" && v.health < 60) push("Lage gezondheidsscore nakijken", v.health < 45 ? "hoog" : "gemiddeld", `score ${v.health}/100`, "De gezondheidsscore is laag — plan een controle.");
  // Terugkerende meldingen (zelfde onderdeel/omschrijving ≥2x, nog niet klaar).
  const open = (reports || []).filter((r) => r.vehicle === v.kenteken && r.status !== "klaar");
  const byKey = {};
  open.forEach((r) => { const k = (r.zone || r.omschrijving || "").toLowerCase().slice(0, 24); if (k) byKey[k] = (byKey[k] || 0) + 1; });
  Object.entries(byKey).filter(([, n]) => n >= 2).forEach(([k, n]) => push("Terugkerende melding onderzoeken", "gemiddeld", `${n}× gemeld`, `"${k}" is meerdere keren gemeld — mogelijk een structureel probleem.`));

  const rank = { hoog: 0, gemiddeld: 1, laag: 2 };
  items.sort((a, b) => (rank[a.urgentie] ?? 3) - (rank[b.urgentie] ?? 3));
  return { items };
}

// ---- Chauffeur-compliance (rijbewijs C/CE, Code 95, ADR, medische keuring) ----
function driverComplianceItems(d, today = TODAY) {
  const items = [
    { key: "rijbewijs", label: "Rijbewijs C/CE", datum: d.rijbewijsTot },
    { key: "code95", label: "Code 95", datum: d.code95Tot },
  ];
  // Medische keuring en ADR kunnen op "niet van toepassing" staan; dan tellen ze
  // niet mee voor de status.
  if (!d.medischNvt) items.push({ key: "medisch", label: "Medische keuring", datum: d.medischTot });
  if (!d.adrNvt && d.adrTot) items.push({ key: "adr", label: "ADR-certificaat", datum: d.adrTot });
  // Verplichte papieren zonder ingevulde datum tellen als "onbekend" (aandacht
  // nodig) — NIET wegfilteren, anders lijkt een chauffeur zonder papieren "in orde".
  return items.map((it) => ({ ...it, status: it.datum ? complianceStatus(it.datum, today) : "onbekend", dagen: it.datum ? daysUntil(it.datum, today) : null }));
}
function driverWorstCompliance(d, today = TODAY) {
  // 'onbekend' (ontbrekende verplichte datum) telt als aandacht, dus boven 'ok'.
  const order = { verlopen: 4, binnenkort: 3, onbekend: 2, ok: 1 };
  return driverComplianceItems(d, today).reduce((worst, it) => (order[it.status] > order[worst] ? it.status : worst), "ok");
}

// Proxy zodat een onbekende/ontbrekende prioriteit nooit een crash geeft
// (PRIO_META[onbekend] geeft dan een nette terugval i.p.v. undefined).
const PRIO_META = new Proxy({
  laag: { label: "Laag", color: "#B4BCC9" },
  gemiddeld: { label: "Gemiddeld", color: "#FF8A00" },
  kritiek: { label: "Kritiek", color: "#F0453F" },
}, { get: (t, k) => t[k] || { label: typeof k === "string" && k ? k : "—", color: "#98A1B0" } });
const PRIO_RANK = { kritiek: 0, gemiddeld: 1, laag: 2 };

const KANBAN_COLS = [
  { id: "nieuw", label: "Nieuw" },
  { id: "in_behandeling", label: "In behandeling" },
  { id: "wacht_onderdeel", label: "Wacht op onderdeel" },
  { id: "klaar", label: "Klaar" },
];

const ZONES = [
  { id: "cabine", label: "Cabine / interieur" },
  { id: "voorkant", label: "Voorkant" },
  { id: "achterkant", label: "Achterkant" },
  { id: "wielen", label: "Wielen / banden" },
  { id: "onder", label: "Onder de wagen" },
  { id: "dak", label: "Dak / verlichting" },
];

const COMMON_ISSUES = [
  "Waarschuwingslampje brandt", "Vreemd geluid bij rijden", "Piepen bij remmen",
  "Trillingen in stuur", "Start niet / slecht", "Trekt naar links/rechts",
  "Rook uit uitlaat", "Lekkage onder voertuig", "Airco/verwarming werkt niet",
  "Band lek of beschadigd", "Ruitenwissers werken niet", "Verlichting defect",
];

/* ---------------------------------------------------------------------
   PRIMITIVES
--------------------------------------------------------------------- */

/* ---------------------------------------------------------------------
   APPARAAT-MELDINGEN — browser/PWA-notificaties (werkt terwijl de app open of
   op de achtergrond staat). Echte push als de app helemaal dicht is vereist
   VAPID + serverkant; dat komt later.
--------------------------------------------------------------------- */
function notifySupported() {
  return typeof window !== "undefined" && "Notification" in window;
}
async function enableDeviceNotifications() {
  if (!notifySupported()) throw new Error("Dit apparaat/deze browser ondersteunt geen meldingen.");
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") throw new Error("Meldingen staan geblokkeerd. Zet ze aan in je browser-/telefooninstellingen.");
  const perm = await Notification.requestPermission();
  return perm;
}
function showDeviceNotification(title, body) {
  try {
    if (!notifySupported() || Notification.permission !== "granted") return;
    // Alleen tonen als de gebruiker niet actief naar de app kijkt.
    if (typeof document !== "undefined" && document.visibilityState === "visible") return;
    new Notification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png", tag: "tt-" + title });
  } catch {}
}

/* ---------------------------------------------------------------------
   AI HELPER — gedeelde Claude API call (tekst + beeld), robuuste parsing
--------------------------------------------------------------------- */

// Alle AI-verkeer loopt via onze eigen server (/api/ai) zodat de Anthropic-key
// nooit in de browser staat. Zie server/index.js.
async function callAIRaw({ messages, system, maxTokens = 800 }) {
  const auth = await authHeader();
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ messages, system, max_tokens: maxTokens }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API ${response.status}`);
  const out = (data.text || "").trim();
  if (!out) throw new Error("leeg antwoord");
  return out;
}

async function callAI({ text, images = [], maxTokens = 800 }) {
  // images: array of { media_type, data } (base64, no prefix)
  const content = [];
  images.forEach((img) => content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } }));
  content.push({ type: "text", text });
  return callAIRaw({ messages: [{ role: "user", content }], maxTokens });
}

function parseAIJson(text) {
  const cleaned = text.replace(/```json\s*|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const startArr = cleaned.indexOf("[");
  const s = startArr !== -1 && (startArr < start || start === -1) ? startArr : start;
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  const slice = s !== -1 && end !== -1 ? cleaned.slice(s, end + 1) : cleaned;
  return JSON.parse(slice);
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(new Error("Kon bestand niet lezen"));
    r.readAsDataURL(file);
  });
}

// Bouwt een CSV (puntkomma-gescheiden, Excel-NL-vriendelijk) uit rijen en
// start een download in de browser. Geen server nodig.
function downloadCSV(filename, headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 768 : false));
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

// Apparaatklasse: 'phone' (<768), 'tablet' (768–1099) of 'desktop' (≥1100).
// Zo kunnen schermen een eigen, functionele indeling per apparaat krijgen.
function useDevice() {
  const calc = () => {
    if (typeof window === "undefined") return "desktop";
    const w = window.innerWidth;
    return w < 768 ? "phone" : w < 1100 ? "tablet" : "desktop";
  };
  const [device, setDevice] = useState(calc);
  useEffect(() => {
    const onResize = () => setDevice(calc());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return device;
}

// Checkt eenmalig of de AI-proxy een key heeft (server /api/health -> { ai: bool }).
// Zo kan de UI vooraf tonen of de AI-functies werken.
function useAiStatus() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setReady(!!d.ai); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return ready;
}

// Kan de server echte inlogaccounts aanmaken? (SUPABASE_SERVICE_ROLE_KEY gezet)
function useAdminAuthStatus() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setReady(!!d.adminAuth); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return ready;
}

function StatusLamp({ status }) {
  const meta = STATUS_META[status];
  const pulse = status !== "operational";
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ flexShrink: 0, whiteSpace: "nowrap", background: `${meta.color}14`, border: `1px solid ${meta.color}33` }}>
      <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: meta.color, boxShadow: `0 0 8px ${meta.color}`, animation: pulse ? "tg-pulse 1.8s ease-in-out infinite" : "none", flexShrink: 0 }} />
      <span style={{ color: meta.color, fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>{meta.label}</span>
    </span>
  );
}

function Kenteken({ value, size = "md" }) {
  const dims = size === "sm"
    ? { h: 22, fs: 11, strip: 12, ls: 0.5, pad: "0 6px" }
    : size === "lg"
    ? { h: 34, fs: 17, strip: 18, ls: 1.5, pad: "0 12px" }
    : { h: 27, fs: 13.5, strip: 15, ls: 1, pad: "0 9px" };
  return (
    <span className="inline-flex items-stretch" style={{ height: dims.h, borderRadius: 5, overflow: "hidden", border: "1px solid #0A0A0A", flexShrink: 0, flexGrow: 0, boxShadow: "0 1px 2px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>
      <span className="inline-flex flex-col items-center justify-center" style={{ width: dims.strip, background: "linear-gradient(180deg, #0A3EC4, #052C93)", color: "#FFD100" }}>
        <span style={{ fontSize: dims.strip * 0.5, lineHeight: 1 }}>★</span>
        <span style={{ fontFamily: "Inter", fontWeight: 800, fontSize: dims.strip * 0.42, lineHeight: 1.1 }}>NL</span>
      </span>
      <span className="inline-flex items-center" style={{ background: "linear-gradient(180deg, #FFD61F, #F4C500)", color: "#0A0A0A", fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: dims.fs, letterSpacing: dims.ls, padding: dims.pad }}>
        {value}
      </span>
    </span>
  );
}

function Card({ children, className = "", style = {}, hover = false, onClick }) {
  const [h, setH] = useState(false);
  return (
    <div
      className={`rounded-xl tg-card ${className}`}
      onClick={onClick}
      onMouseEnter={() => hover && setH(true)}
      onMouseLeave={() => hover && setH(false)}
      style={{
        background: "linear-gradient(180deg, #141A23, #10151D)",
        border: `1px solid ${h ? "#2E3948" : "#232B38"}`,
        boxShadow: h ? "0 8px 28px rgba(0,0,0,0.45)" : "0 1px 2px rgba(0,0,0,0.25)",
        transform: h ? "translateY(-2px)" : "translateY(0)",
        transition: "transform .2s ease, box-shadow .2s ease, border-color .2s ease",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }) {
  return <div className="text-xs mb-2" style={{ color: "#B4BCC9", fontFamily: "Inter", letterSpacing: 1.5, fontWeight: 600, textTransform: "uppercase" }}>{children}</div>;
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 rounded-xl" style={{ border: "1px dashed #232B38" }}>
      <Icon size={28} color="#6B7585" className="mb-3" />
      <div style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 14 }} className="text-center px-6">{text}</div>
    </div>
  );
}

function Button({ children, onClick, variant = "primary", icon: Icon, small, disabled, type = "button", style = {} }) {
  const base = { fontFamily: "Inter", fontWeight: 600, fontSize: small ? 13 : 14, padding: small ? "6px 12px" : "10px 16px", borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer", transition: "transform .12s ease, box-shadow .2s ease, opacity .15s", border: "1px solid transparent", opacity: disabled ? 0.5 : 1 };
  const variants = {
    primary: { background: "linear-gradient(180deg, #4C8DFF, #3B82F6)", color: "#FFFFFF", boxShadow: "0 2px 10px rgba(59,130,246,0.35)" },
    ghost: { background: "transparent", color: "#E7ECF3", border: "1px solid #2A3340" },
    subtle: { background: "#1A2129", color: "#E7ECF3" },
    danger: { background: "transparent", color: "#F0453F", border: "1px solid #F0453F55" },
  };
  return (
    <button type={type} onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.opacity = 0.95; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.opacity = 1; } }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "translateY(1px) scale(0.98)"; }}
      onMouseUp={(e) => { if (!disabled) e.currentTarget.style.transform = "translateY(-1px)"; }}>
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} className="px-3 py-2 rounded-full text-sm"
      style={{ fontFamily: "Inter", fontWeight: 500, border: `1px solid ${active ? "#3B82F6" : "#2A3340"}`, color: active ? "#8FB8FF" : "#C4CBD6", background: active ? "linear-gradient(180deg, #3B82F62A, #3B82F614)" : "#161C25", transition: "all .15s ease", boxShadow: active ? "0 0 0 3px rgba(59,130,246,0.10)" : "none" }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
      {children}
    </button>
  );
}

function SaveStatus({ status, compact }) {
  const map = {
    pending: { color: "#B4BCC9", label: "Wijziging…" },
    saving: { color: "#3B82F6", label: "Opslaan…" },
    saved: { color: "#34D399", label: "Opgeslagen", icon: CheckCircle2 },
    error: { color: "#F0453F", label: "Niet opgeslagen", icon: AlertTriangle },
  };
  const m = map[status] || map.saved;
  return (
    <span className="inline-flex items-center gap-1.5" title={m.label} style={{ padding: compact ? 4 : "4px 8px", borderRadius: 8, background: status === "error" ? "#F0453F14" : "transparent" }}>
      {m.icon ? <m.icon size={14} color={m.color} /> : <span className="rounded-full" style={{ width: 8, height: 8, background: m.color, animation: "tg-pulse 1s ease-in-out infinite" }} />}
      {!compact && <span style={{ fontFamily: "Inter", fontSize: 12, color: m.color, fontWeight: 600 }}>{m.label}</span>}
    </span>
  );
}

function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  return (
    <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg flex items-center gap-2" style={{ background: "#12171F", border: "1px solid #34D39955", fontFamily: "Inter", fontSize: 13, color: "#E7ECF3" }}>
      <CheckCircle2 size={16} color="#34D399" /> {message}
    </div>
  );
}

/* ---------------------------------------------------------------------
   LOGIN
--------------------------------------------------------------------- */

function LoginScreen({ allUsers, companies, onLogin, onRegister }) {
  const [mode, setMode] = useState("login"); // 'login' | 'register'
  const pick = (rol) => allUsers.find((u) => u.rol === rol && u.status === "actief" && !u.superadmin && u.email.includes("blexlogistics"));
  const superAdmin = allUsers.find((u) => u.superadmin && u.status === "actief");
  const roleButtons = [
    { rol: "admin", label: "Beheerder (Blex)", desc: "Bedrijfsbeheerder — ziet alleen Blex Logistics", icon: ShieldCheck },
    { rol: "garage", label: "Werkplaats", desc: "Werkvloer, planning, onderhoud en voorraad", icon: Wrench },
    { rol: "chauffeur", label: "Chauffeur", desc: "Alleen meldingen maken", icon: AlertTriangle },
  ];

  const [reg, setReg] = useState({ bedrijfsnaam: "", naam: "", email: "", telefoon: "", wachtwoord: "", wachtwoord2: "" });
  const [regError, setRegError] = useState("");
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const submitRegister = () => {
    if (!reg.bedrijfsnaam.trim()) return setRegError("Vul een bedrijfsnaam in.");
    if (companies.some((c) => c.name.toLowerCase() === reg.bedrijfsnaam.trim().toLowerCase())) return setRegError("Er bestaat al een bedrijf met deze naam.");
    if (!reg.naam.trim()) return setRegError("Vul je naam in.");
    if (!validEmail(reg.email)) return setRegError("Vul een geldig e-mailadres in.");
    if (allUsers.some((u) => u.email && u.email.toLowerCase() === reg.email.trim().toLowerCase())) return setRegError("Dit e-mailadres is al in gebruik.");
    if (reg.wachtwoord.length < 6) return setRegError("Kies een wachtwoord van minstens 6 tekens.");
    if (reg.wachtwoord !== reg.wachtwoord2) return setRegError("Wachtwoorden komen niet overeen.");
    setRegError("");
    onRegister(reg);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0A0E14", fontFamily: "Inter" }} className="flex items-center justify-center px-4 py-8">
      <style>{`${FONT_IMPORT} html,body{background:#0A0E14 !important;} .tg-input{background:#161C25;border:1px solid #2A3340;color:#E7ECF3;border-radius:9px;padding:11px 12px;font-family:Inter;font-size:16px;outline:none;width:100%;} .tg-input:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,0.15);} .tg-input::placeholder{color:#7B8698;} @media(min-width:768px){.tg-input{font-size:13px;}}`}</style>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-2">
          <div style={{ fontFamily: "Oswald", fontSize: 24, fontWeight: 700, color: "#E7ECF3", letterSpacing: 0.5 }}>TRUCK <span style={{ color: "#3B82F6" }}>&amp;</span> TRAILER</div>
        </div>

        {/* Toggle */}
        <div className="flex rounded-xl overflow-hidden mt-4 mb-5" style={{ border: "1px solid #232B38" }}>
          <button onClick={() => setMode("login")} className="flex-1 py-2.5 text-sm" style={{ fontFamily: "Inter", fontWeight: 600, background: mode === "login" ? "#1A2129" : "transparent", color: mode === "login" ? "#3B82F6" : "#98A1B0" }}>Inloggen</button>
          <button onClick={() => setMode("register")} className="flex-1 py-2.5 text-sm" style={{ fontFamily: "Inter", fontWeight: 600, background: mode === "register" ? "#1A2129" : "transparent", color: mode === "register" ? "#3B82F6" : "#98A1B0" }}>Bedrijf aanmelden</button>
        </div>

        {mode === "login" ? (
          <>
            <div className="text-center mb-4" style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }}>Kies een demo-account om in te loggen</div>
            <div className="space-y-3">
              {superAdmin && (
                <button onClick={() => onLogin(superAdmin)} className="w-full flex items-center gap-3 p-4 rounded-xl text-left"
                  style={{ background: "linear-gradient(135deg, #3B82F62A, #12171F)", border: "1px solid #3B82F66A", transition: "border-color .15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3B82F6")} onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#3B82F66A")}>
                  <div className="flex items-center justify-center" style={{ width: 42, height: 42, borderRadius: 10, background: "#3B82F6", flexShrink: 0 }}>
                    <Building2 size={20} color="#FFFFFF" />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: "Inter", fontSize: 15, fontWeight: 600, color: "#E7ECF3" }}>Platformbeheerder</div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>Truck &amp; Trailer — ziet én beheert alle bedrijven</div>
                  </div>
                  <ChevronRight size={18} color="#3B82F6" />
                </button>
              )}
              {roleButtons.map((rb) => {
                const u = pick(rb.rol);
                if (!u) return null;
                return (
                  <button key={rb.rol} onClick={() => onLogin(u)} className="w-full flex items-center gap-3 p-4 rounded-xl text-left"
                    style={{ background: "#12171F", border: "1px solid #232B38", transition: "border-color .15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3B82F6")} onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#232B38")}>
                    <div className="flex items-center justify-center" style={{ width: 42, height: 42, borderRadius: 10, background: "#3B82F618", flexShrink: 0 }}>
                      <rb.icon size={20} color="#3B82F6" />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: "Inter", fontSize: 15, fontWeight: 600, color: "#E7ECF3" }}>{rb.label}</div>
                      <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>{rb.desc}</div>
                    </div>
                    <ChevronRight size={18} color="#98A1B0" />
                  </button>
                );
              })}
            </div>
            <div className="text-center mt-6" style={{ color: "#98A1B0", fontSize: 11, fontFamily: "Inter" }}>Demo — direct inloggen zonder wachtwoord.</div>
          </>
        ) : (
          <div>
            <div className="text-center mb-4" style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }}>Meld je bedrijf aan en begin met een lege, eigen omgeving.</div>
            <div className="space-y-3">
              <div>
                <div style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 600, color: "#98A1B0", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Bedrijf</div>
                <input className="tg-input" placeholder="Bedrijfsnaam" value={reg.bedrijfsnaam} onChange={(e) => setReg({ ...reg, bedrijfsnaam: e.target.value })} />
              </div>
              <div style={{ borderTop: "1px solid #1A2129", paddingTop: 12 }}>
                <div style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 600, color: "#98A1B0", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Jouw beheerdersaccount</div>
                <div className="space-y-2">
                  <input className="tg-input" placeholder="Jouw naam" value={reg.naam} onChange={(e) => setReg({ ...reg, naam: e.target.value })} />
                  <input className="tg-input" placeholder="E-mailadres" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} />
                  <input className="tg-input" placeholder="Telefoon (optioneel)" value={reg.telefoon} onChange={(e) => setReg({ ...reg, telefoon: e.target.value })} />
                  <input className="tg-input" type="password" placeholder="Wachtwoord" value={reg.wachtwoord} onChange={(e) => setReg({ ...reg, wachtwoord: e.target.value })} />
                  <input className="tg-input" type="password" placeholder="Herhaal wachtwoord" value={reg.wachtwoord2} onChange={(e) => setReg({ ...reg, wachtwoord2: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submitRegister()} />
                </div>
              </div>
              {regError && <div style={{ color: "#F0453F", fontFamily: "Inter", fontSize: 12.5 }}>{regError}</div>}
              <button onClick={submitRegister} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl" style={{ background: "linear-gradient(180deg, #4C8DFF, #3B82F6)", color: "#FFFFFF", fontFamily: "Inter", fontWeight: 600, fontSize: 14, boxShadow: "0 2px 10px rgba(59,130,246,0.35)" }}>
                <Building2 size={16} /> Bedrijf aanmelden &amp; starten
              </button>
              <div style={{ color: "#98A1B0", fontSize: 11, fontFamily: "Inter", textAlign: "center" }}>Je wordt direct ingelogd als beheerder van je nieuwe bedrijf. Daarna kun je voertuigen, monteurs en chauffeurs toevoegen.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   MELDING MAKEN (driver report flow)
--------------------------------------------------------------------- */

// Toont de foto's/video's van een melding. Haalt tijdelijke (signed) links op
// voor opgeslagen paden; werkt ook met directe objectURLs (demo).
function ReportMedia({ media }) {
  const [urls, setUrls] = useState([]);
  const [lightbox, setLightbox] = useState(null); // { url, type }
  useEffect(() => {
    let alive = true;
    if (!media || !media.length) { setUrls([]); return; }
    signedMediaUrls(media).then((u) => { if (alive) setUrls(u); }).catch(() => { if (alive) setUrls([]); });
    return () => { alive = false; };
  }, [media]);
  if (!urls.length) return null;
  return (
    <>
      <div className="flex gap-2 flex-wrap mb-2">
        {urls.map((m, i) => m.type === "video" ? (
          <video key={i} src={m.url} controls playsInline style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 8, border: "1px solid #232B38", background: "#000" }} />
        ) : (
          <button key={i} type="button" onClick={() => setLightbox(m)} title="Foto openen" style={{ padding: 0, border: "none", background: "none", cursor: "pointer" }}>
            <img src={m.url} alt="foto bij melding" loading="lazy" style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 8, border: "1px solid #232B38", display: "block" }} />
          </button>
        ))}
      </div>
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(5,8,12,0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <button onClick={() => setLightbox(null)} aria-label="Sluiten" style={{ position: "absolute", top: 16, right: 16, background: "#12171F", border: "1px solid #232B38", borderRadius: 999, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={20} color="#E7ECF3" /></button>
          <img src={lightbox.url} alt="foto bij melding" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 10 }} />
        </div>
      )}
    </>
  );
}

// In-app camera. De stream wordt in de KLIK-handler opgehaald (nodig op iOS
// Safari: getUserMedia moet binnen het gebruikersgebaar) en hier meegegeven.
// Valt netjes terug op de galerij als de camera niet mag/kan.
function CameraCapture({ stream, error, onCapture, onClose, onFallback }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const err = error || "";

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().then(() => setReady(true)).catch(() => setReady(true));
    }
    return () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [stream]);

  const stop = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
      onCapture(file);
    }, "image/jpeg", 0.9);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "#000", display: "flex", flexDirection: "column" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: "#0A0E14" }}>
        <span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>Foto maken</span>
        <button onClick={() => { stop(); onClose(); }} aria-label="Sluiten"><X size={22} color="#E7ECF3" /></button>
      </div>
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {err ? (
          <div className="text-center px-6" style={{ maxWidth: 340 }}>
            <div style={{ fontFamily: "Inter", fontSize: 14, color: "#E7ECF3", marginBottom: 6 }}>
              {err === "geen-toestemming" ? "De camera mag niet gebruikt worden." : "De camera kon niet gestart worden op dit apparaat."}
            </div>
            <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0", marginBottom: 16 }}>
              {err === "geen-toestemming" ? "Sta de camera toe in je browser-/telefooninstellingen, of kies een foto uit je galerij." : "Kies een foto uit je galerij."}
            </div>
            <button onClick={() => { stop(); onFallback(); }} className="px-4 py-2.5 rounded-lg" style={{ background: "linear-gradient(180deg,#4C8DFF,#3B82F6)", color: "#fff", fontFamily: "Inter", fontWeight: 600, fontSize: 13.5 }}>Kies uit galerij</button>
          </div>
        ) : (
          <video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
        )}
      </div>
      {!err && (
        <div className="flex items-center justify-center gap-6 py-5" style={{ background: "#0A0E14" }}>
          <button onClick={() => { stop(); onFallback(); }} style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0" }}>Galerij</button>
          <button onClick={snap} disabled={!ready} aria-label="Foto maken" style={{ width: 66, height: 66, borderRadius: "50%", background: ready ? "#fff" : "#555", border: "4px solid #3B82F6", flexShrink: 0 }} />
          <span style={{ width: 48 }} />
        </div>
      )}
    </div>
  );
}

function MeldingMaken({ vehicles, onSubmit, currentUser, onUploadMedia }) {
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [vehicle, setVehicle] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [zone, setZone] = useState("");
  const [wanneer, setWanneer] = useState("");
  const [hoelang, setHoelang] = useState("");
  const [veilig, setVeilig] = useState("");
  const [media, setMedia] = useState([]);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadWarn, setUploadWarn] = useState("");
  // Openstaande meldingen voor de gekozen wagen — om dubbel melden te voorkomen.
  const [openReports, setOpenReports] = useState([]);
  const recognitionRef = useRef(null);
  const fileRef = useRef(null);
  const videoRef = useRef(null);

  const STEPS = [t("stepVehicle"), t("stepProblem"), t("stepPhoto"), t("stepCheck")];

  // Zodra er een wagen gekozen is, halen we de openstaande meldingen ervan op.
  useEffect(() => {
    let alive = true;
    if (!vehicle) { setOpenReports([]); return; }
    driverVehicleOpenReports(vehicle).then((list) => { if (alive) setOpenReports(Array.isArray(list) ? list : []); });
    return () => { alive = false; };
  }, [vehicle]);

  // Eenvoudige gelijkenis: overlappende woorden (>3 letters) tussen twee teksten.
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9À-ɏ\s]/gi, " ").split(/\s+/).filter((w) => w.length > 3);
  const looksSimilar = (a, b) => {
    const wa = new Set(norm(a)); const wb = norm(b);
    if (!wa.size || !wb.length) return false;
    const hits = wb.filter((w) => wa.has(w)).length;
    return hits >= 2 || (wb.length > 0 && hits / wb.length >= 0.5);
  };
  const similarExisting = omschrijving.trim() ? openReports.find((r) => looksSimilar(omschrijving, r.omschrijving)) : null;
  // Labels afleiden uit KANBAN_COLS zodat de chauffeur nooit een ruwe statuscode
  // (bv. "in_behandeling") ziet — altijd de nette tekst.
  const STATUS_LABEL = Object.fromEntries(KANBAN_COLS.map((c) => [c.id, c.label]));
  // Banner met openstaande meldingen voor de gekozen wagen (render-helper, geen component).
  const openBanner = () => (
    openReports.length === 0 ? null : (
      <div className="p-3 rounded-lg" style={{ background: "#2A1E10", border: "1px solid #FF8A0055" }}>
        <div className="flex items-center gap-2 mb-1.5" style={{ fontFamily: "Inter", fontSize: 12.5, fontWeight: 700, color: "#FFB861" }}>
          <AlertTriangle size={14} /> {t("dupTitle")} ({openReports.length})
        </div>
        <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#D9C3A8", lineHeight: 1.5, marginBottom: 8 }}>{t("dupSub")}</div>
        <div className="space-y-1.5">
          {openReports.slice(0, 5).map((r, i) => (
            <div key={i} className="flex items-start justify-between gap-2 p-2 rounded" style={{ background: "#1A130A" }}>
              <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#E7ECF3", minWidth: 0 }}>{r.omschrijving || "—"}</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: "#FFB861", border: "1px solid #FF8A0055", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>{STATUS_LABEL[r.status] || r.status || "—"}</span>
            </div>
          ))}
        </div>
      </div>
    )
  );

  const toggleIssue = (issue) => {
    const parts = omschrijving.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.includes(issue)) setOmschrijving(parts.filter((p) => p !== issue).join(", "));
    else setOmschrijving([...parts, issue].join(", "));
  };

  const startVoice = () => {
    if (listening && recognitionRef.current) { recognitionRef.current.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceError("Spraakherkenning wordt niet ondersteund in deze browser. Gebruik Chrome of typ je melding."); return; }
    let rec;
    try { rec = new SR(); } catch (e) { setVoiceError("Kon microfoon niet starten."); return; }
    // Spraakherkenning in de taal van de chauffeur (niet hardcoded Nederlands).
    const SPEECH_LANG = { nl: "nl-NL", en: "en-GB", pl: "pl-PL", ro: "ro-RO", bg: "bg-BG", uk: "uk-UA", ru: "ru-RU", tr: "tr-TR", hy: "hy-AM", ka: "ka-GE", lt: "lt-LT" };
    rec.lang = SPEECH_LANG[getLang()] || "nl-NL";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setOmschrijving((prev) => (prev ? prev + " " + text : text));
      setVoiceError("");
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setVoiceError("Microfoontoegang geblokkeerd. In een preview-venster kan dit niet — open de app in een eigen tabblad, of typ je melding.");
      else if (e.error === "no-speech") setVoiceError("Niets gehoord, probeer opnieuw.");
      else setVoiceError("Inspreken lukte niet. Typ je melding.");
    };
    recognitionRef.current = rec;
    try { rec.start(); setListening(true); setVoiceError(""); }
    catch (e) { setVoiceError("Kon niet starten met luisteren."); }
  };

  const [camOpen, setCamOpen] = useState(false);
  const [camStream, setCamStream] = useState(null);
  const [camErr, setCamErr] = useState("");
  // Vraag de camera aan BINNEN de klik (iOS Safari eist een gebruikersgebaar).
  const openCamera = async () => {
    setCamErr(""); setCamStream(null);
    if (!navigator.mediaDevices?.getUserMedia) { setCamErr("geen-camera"); setCamOpen(true); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      setCamStream(s); setCamOpen(true);
    } catch (e) {
      setCamErr(e?.name === "NotAllowedError" ? "geen-toestemming" : "geen-camera");
      setCamOpen(true);
    }
  };
  const closeCamera = () => { setCamOpen(false); setCamStream(null); setCamErr(""); };
  const addFiles = (files) => {
    const arr = Array.from(files).map((f) => ({ name: f.name, url: URL.createObjectURL(f), type: f.type.startsWith("video") ? "video" : "foto", file: f, mediaType: f.type }));
    setMedia((m) => [...m, ...arr]);
  };

  const [damageLoading, setDamageLoading] = useState(false);
  const [damageResult, setDamageResult] = useState(null); // { schade, ernst, aanbeveling }
  const [damageError, setDamageError] = useState("");

  const analyzeDamage = async () => {
    const photo = media.find((m) => m.type === "foto" && m.file);
    if (!photo) { setDamageError("Voeg eerst een foto toe."); return; }
    setDamageLoading(true); setDamageError(""); setDamageResult(null);
    try {
      const b64 = await fileToBase64(photo.file);
      const prompt = `Je bent een truck-schade-expert. Bekijk deze foto van een voertuig(onderdeel) en beschrijf wat je ziet. Antwoord UITSLUITEND met JSON:
{"schade":"<korte beschrijving van de zichtbare schade of het probleem>","ernst":"laag|gemiddeld|kritiek","onderdeel":"<welk onderdeel>","aanbeveling":"<1 zin advies>"}
Als je geen duidelijke schade ziet, zet schade op "Geen duidelijke schade zichtbaar" en ernst op "laag".`;
      const out = await callAI({ text: prompt, images: [{ media_type: photo.mediaType || "image/jpeg", data: b64 }], maxTokens: 500 });
      const parsed = parseAIJson(out);
      setDamageResult(parsed);
    } catch (err) {
      setDamageError(`Kon foto niet analyseren (${err.message || "fout"}).`);
    } finally {
      setDamageLoading(false);
    }
  };

  const applyDamageToDescription = () => {
    if (!damageResult) return;
    const txt = `${damageResult.onderdeel ? damageResult.onderdeel + ": " : ""}${damageResult.schade}`;
    setOmschrijving((prev) => (prev ? prev + (prev.endsWith(",") ? " " : ", ") + txt : txt));
  };

  const selectedVehicle = vehicles.find((v) => v.kenteken === vehicle);

  const submit = async () => {
    if (!vehicle || !omschrijving.trim() || submitting) return;
    const id = "r" + Date.now();
    setSubmitting(true); setUploadWarn("");
    // Foto's/video's eerst uploaden (best effort). Lukt dat niet, dan sturen we
    // de melding alsnog door — met alleen het aantal — zodat er niets verloren gaat.
    let mediaOut = [];
    try {
      if (onUploadMedia && media.length) mediaOut = await onUploadMedia(id, media);
    } catch (e) {
      setUploadWarn("Melding is verstuurd, maar de foto's konden niet worden opgeslagen.");
    }
    onSubmit({
      id, vehicle, chauffeur: currentUser?.naam || "Onbekend", chauffeurId: currentUser?.id || null, omschrijving,
      prioriteit: veilig === "Nee" ? "kritiek" : veilig === "Twijfel" ? "gemiddeld" : "laag",
      status: "nieuw", datum: toLocalKey(new Date()),
      zone, wanneer, hoelang, veilig, media: mediaOut, mediaCount: mediaOut.length || media.length,
    });
    setSubmitting(false);
    setOmschrijving(""); setZone(""); setWanneer(""); setHoelang(""); setVeilig(""); setMedia([]); setVehicle(""); setStep(0);
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  };

  if (sent) {
    return (
      <div className="max-w-xl mx-auto">
        <Card className="p-8 flex flex-col items-center text-center">
          <div className="flex items-center justify-center rounded-full mb-4" style={{ width: 64, height: 64, background: "#34D39918" }}><CheckCircle2 size={34} color="#34D399" /></div>
          <div style={{ fontFamily: "Oswald", fontSize: 22, fontWeight: 600, color: "#E7ECF3" }}>{t("sentTitle")}</div>
          <div style={{ fontFamily: "Inter", fontSize: 14, color: "#B4BCC9", marginTop: 6 }}>{t("sentSub")}</div>
          {uploadWarn && <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#FF8A00", marginTop: 8 }}>{uploadWarn}</div>}
          <Button style={{ marginTop: 20 }} icon={Plus} onClick={() => { setSent(false); setUploadWarn(""); }}>{t("newReport")}</Button>
        </Card>
      </div>
    );
  }

  const canNext = step === 0 ? !!vehicle : step === 1 ? !!omschrijving.trim() : true;

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-8">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div className="h-1.5 rounded-full" style={{ background: i <= step ? "#3B82F6" : "#232B38", transition: "background .2s" }} />
            <div style={{ fontFamily: "Inter", fontSize: 10.5, fontWeight: 600, color: i === step ? "#3B82F6" : "#98A1B0", marginTop: 5, textAlign: "center" }}>{s}</div>
          </div>
        ))}
      </div>

      <Card className="p-5">
        {/* STEP 0 — Vehicle */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <div style={{ fontFamily: "Oswald", fontSize: 20, fontWeight: 600, color: "#E7ECF3" }}>{t("qVehicle")}</div>
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#B4BCC9" }}>{t("qVehicleSub")}</div>
            </div>
            <div className="space-y-2">
              {vehicles.map((v) => (
                <button key={v.id} onClick={() => setVehicle(v.kenteken)} className="w-full flex items-center gap-3 p-3 rounded-lg text-left"
                  style={{ background: vehicle === v.kenteken ? "#3B82F618" : "#1A2129", border: `1px solid ${vehicle === v.kenteken ? "#3B82F6" : "#232B38"}` }}>
                  <Kenteken value={v.kenteken} />
                  <div style={{ minWidth: 0, flex: "1 1 0%" }}>
                    <div style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.merk}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>{v.type}</div>
                  </div>
                  {vehicle === v.kenteken && <CheckCircle2 size={20} color="#3B82F6" style={{ flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 1 — Problem */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <div style={{ fontFamily: "Oswald", fontSize: 20, fontWeight: 600, color: "#E7ECF3" }}>{t("qProblem")}</div>
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#B4BCC9" }}>{t("qProblemSub")}</div>
            </div>
            {openBanner()}
            <div className="flex flex-wrap gap-2">
              {COMMON_ISSUES.map((issue, i) => (
                <Chip key={issue} active={omschrijving.includes(issue)} onClick={() => toggleIssue(issue)}>{t(ISSUE_KEYS[i])}</Chip>
              ))}
            </div>
            <div>
              <textarea className="tg-input w-full" rows={3} placeholder={t("descPlaceholder")} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} />
              <button onClick={startVoice} className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ fontFamily: "Inter", fontWeight: 600, background: listening ? "#F0453F18" : "#1A2129", color: listening ? "#F0453F" : "#E7ECF3", border: "1px solid #232B38" }}>
                {listening ? <MicOff size={14} /> : <Mic size={14} />} {listening ? t("listening") : t("speak")}
              </button>
              {voiceError && <div style={{ color: "#FF8A00", fontFamily: "Inter", fontSize: 12, marginTop: 6 }}>{voiceError}</div>}
              {similarExisting && (
                <div className="mt-2 p-2.5 rounded-lg flex items-start gap-2" style={{ background: "#2A1E10", border: "1px solid #FF8A0055" }}>
                  <AlertTriangle size={14} color="#FFB861" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: "#D9C3A8", lineHeight: 1.5 }}>{t("dupSimilar")} <span style={{ color: "#E7ECF3" }}>"{similarExisting.omschrijving}"</span></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2 — Photo */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <div style={{ fontFamily: "Oswald", fontSize: 20, fontWeight: 600, color: "#E7ECF3" }}>{t("qPhoto")}</div>
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#B4BCC9" }}>{t("qPhotoSub")}</div>
            </div>
            {/* Fotogids voor de chauffeur */}
            <div className="p-3 rounded-lg" style={{ background: "#12233E", border: "1px solid #3B82F544" }}>
              <div className="flex items-center gap-2 mb-1.5" style={{ fontFamily: "Inter", fontSize: 12.5, fontWeight: 700, color: "#8FB8FF" }}><Camera size={14} /> {t("photoGuide")}</div>
              <ul style={{ fontFamily: "Inter", fontSize: 11.5, color: "#B9C6DA", lineHeight: 1.6, paddingLeft: 16, listStyle: "disc" }}>
                <li>{t("guide1a")} <b style={{ color: "#E7ECF3" }}>{zone ? t(ZONE_KEYS[zone]) : t("guidePart")}</b>.</li>
                <li>{t("guide2")}</li>
                <li>{t("guide3")}</li>
              </ul>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={openCamera} className="flex flex-col items-center justify-center gap-2 py-6 rounded-lg" style={{ border: "1px dashed #3A4252", background: "#1A2129" }}>
                <Camera size={22} color="#3B82F6" /><span style={{ fontFamily: "Inter", fontSize: 12, color: "#E7ECF3", fontWeight: 500 }}>{t("takePhoto")}</span>
              </button>
              <button onClick={() => fileRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-6 rounded-lg" style={{ border: "1px dashed #3A4252", background: "#1A2129" }}>
                <Boxes size={22} color="#3B82F6" /><span style={{ fontFamily: "Inter", fontSize: 12, color: "#E7ECF3", fontWeight: 500 }}>{t("fromGallery")}</span>
              </button>
              <button onClick={() => videoRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-6 rounded-lg" style={{ border: "1px dashed #3A4252", background: "#1A2129" }}>
                <Video size={22} color="#3B82F6" /><span style={{ fontFamily: "Inter", fontSize: 12, color: "#E7ECF3", fontWeight: 500 }}>{t("video")}</span>
              </button>
            </div>
            {/* "Foto maken" opent een echte in-app camera (getUserMedia) i.p.v. de
                native bestand-camera die op sommige iPhones zwart blijft. */}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <input ref={videoRef} type="file" accept="video/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            {camOpen && <CameraCapture stream={camStream} error={camErr} onCapture={(file) => { addFiles([file]); closeCamera(); }} onClose={closeCamera} onFallback={() => { closeCamera(); fileRef.current?.click(); }} />}
            <div style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0", lineHeight: 1.5 }}>
              {t("photoTip")}
            </div>
            {media.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {media.map((m, i) => (
                  <div key={i} className="relative rounded-lg overflow-hidden" style={{ width: 80, height: 80, border: "1px solid #232B38", background: "#1A2129" }}>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" title="Open om te controleren" style={{ display: "block", width: "100%", height: "100%" }}>
                      {m.type === "foto"
                        ? <img src={m.url} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        : <video src={m.url} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} muted playsInline />}
                    </a>
                    {m.type === "video" && <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "none" }}><div style={{ width: 24, height: 24, borderRadius: "50%", background: "#000000AA" }} className="flex items-center justify-center"><Video size={13} color="#fff" /></div></div>}
                    <button onClick={() => setMedia(media.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 rounded-full flex items-center justify-center" style={{ background: "#0A0E14CC", width: 18, height: 18 }}><X size={12} color="#fff" /></button>
                  </div>
                ))}
              </div>
            )}
            {media.length === 0 && <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0", textAlign: "center" }}>{t("noPhoto")}</div>}

            {media.some((m) => m.type === "foto") && (
              <div className="pt-1">
                <button onClick={analyzeDamage} disabled={damageLoading} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg" style={{ background: damageLoading ? "#1A2129" : "linear-gradient(180deg, #4C8DFF, #3B82F6)", color: "#FFFFFF", fontFamily: "Inter", fontWeight: 600, fontSize: 13.5, boxShadow: "0 2px 10px rgba(59,130,246,0.3)" }}>
                  <Sparkles size={15} /> {damageLoading ? t("analyzing") : t("aiRecognize")}
                </button>
                {damageError && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#FF8A00", marginTop: 8 }}>{damageError}</div>}
                {damageResult && (() => {
                  const col = damageResult.ernst === "kritiek" ? "#F0453F" : damageResult.ernst === "gemiddeld" ? "#FF8A00" : "#34D399";
                  return (
                    <div className="mt-3 p-3 rounded-lg" style={{ background: "#161C25", border: `1px solid ${col}55`, borderLeft: `3px solid ${col}` }}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 700, color: col, letterSpacing: 0.5, textTransform: "uppercase" }}>{t("aiAnalysis")}</span>
                        <span className="text-xs px-2 py-0.5 rounded" style={{ color: col, border: `1px solid ${col}55`, fontWeight: 600 }}>{damageResult.ernst}</span>
                      </div>
                      {damageResult.onderdeel && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#98A1B0" }}>{damageResult.onderdeel}</div>}
                      <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#E7ECF3", fontWeight: 500, marginTop: 2 }}>{damageResult.schade}</div>
                      {damageResult.aanbeveling && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9", marginTop: 3 }}>{damageResult.aanbeveling}</div>}
                      <button onClick={applyDamageToDescription} className="mt-2 flex items-center gap-1 text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>{t("addToDesc")}</button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — Check + safety */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <div style={{ fontFamily: "Oswald", fontSize: 20, fontWeight: 600, color: "#E7ECF3" }}>{t("qCheck")}</div>
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#B4BCC9" }}>{t("qCheckSub")}</div>
            </div>

            {openBanner()}

            <div>
              <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#E7ECF3", marginBottom: 8, fontWeight: 500 }}>{t("safeDrive")}</div>
              <div className="grid grid-cols-3 gap-2">
                {[{ v: "Ja", label: t("yes"), c: "#34D399" }, { v: "Twijfel", label: t("doubt"), c: "#FF8A00" }, { v: "Nee", label: t("no"), c: "#F0453F" }].map((o) => (
                  <button key={o.v} onClick={() => setVeilig(o.v)} className="py-2.5 rounded-lg text-sm" style={{ fontFamily: "Inter", fontWeight: 600, background: veilig === o.v ? `${o.c}22` : "#1A2129", color: veilig === o.v ? o.c : "#B4BCC9", border: `1px solid ${veilig === o.v ? o.c : "#232B38"}` }}>{o.label}</button>
                ))}
              </div>
              {veilig === "Nee" && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#F0453F", marginTop: 6 }}>{t("criticalNote")}</div>}
            </div>

            <div>
              <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#E7ECF3", marginBottom: 8, fontWeight: 500 }}>{t("whereOnVehicle")} <span style={{ color: "#98A1B0", fontWeight: 400 }}>{t("optional")}</span></div>
              <div className="flex flex-wrap gap-2">{ZONES.map((z) => <Chip key={z.id} active={zone === z.id} onClick={() => setZone(zone === z.id ? "" : z.id)}>{t(ZONE_KEYS[z.id])}</Chip>)}</div>
            </div>

            <div>
              <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#E7ECF3", marginBottom: 8, fontWeight: 500 }}>{t("whenLabel")} <span style={{ color: "#98A1B0", fontWeight: 400 }}>{t("optional")}</span></div>
              <div className="flex flex-wrap gap-2">{[{ v: "Bij rijden", label: t("whenDriving") }, { v: "Bij remmen", label: t("whenBraking") }, { v: "Bij starten", label: t("whenStarting") }, { v: "Bij stilstand", label: t("whenIdle") }, { v: "Altijd", label: t("whenAlways") }].map((w) => <Chip key={w.v} active={wanneer === w.v} onClick={() => setWanneer(wanneer === w.v ? "" : w.v)}>{w.label}</Chip>)}</div>
            </div>

            {/* Summary */}
            <div className="p-3 rounded-lg" style={{ background: "#1A2129", border: "1px solid #232B38" }}>
              <div className="flex items-center gap-2 mb-1"><Kenteken value={vehicle} />{selectedVehicle && <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9" }}>{selectedVehicle.merk}</span>}</div>
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3" }}>{omschrijving}</div>
              {media.length > 0 && <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#B4BCC9", marginTop: 2 }}>{t("attachments", { n: media.length })}</div>}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-2 mt-5">
          {step > 0 && <Button variant="ghost" icon={ChevronLeft} onClick={() => setStep(step - 1)}>{t("back")}</Button>}
          {step < 3 && (
            <Button style={{ flex: 1, justifyContent: "center" }} onClick={() => setStep(step + 1)} disabled={!canNext}>
              {step === 2 && media.length === 0 ? t("skip") : t("next")}
            </Button>
          )}
          {step === 3 && (
            <Button icon={AlertTriangle} style={{ flex: 1, justifyContent: "center", background: veilig === "Nee" ? "#F0453F" : similarExisting ? "#FF8A00" : "#3B82F6" }} onClick={submit} disabled={!vehicle || !omschrijving.trim() || submitting}>
              {submitting ? (media.length ? t("savingPhotos") : t("sending")) : similarExisting ? t("sendAnyway") : t("submitReport")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

// "Installeer op beginscherm"-kaart. Android/desktop tonen een echte
// installatieknop (beforeinstallprompt); iOS Safari kent dat event niet, dus
// daar tonen we korte instructies. Verdwijnt zodra de app als PWA draait.
function InstallCard() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem("tt_install_dismiss") === "1"; } catch { return false; } });
  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  const isStandalone = typeof window !== "undefined" && ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true);
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  if (isStandalone || installed || dismissed) return null;
  if (!deferred && !isIOS) return null; // niets te installeren op deze browser
  const dismiss = () => { setDismissed(true); try { localStorage.setItem("tt_install_dismiss", "1"); } catch { /* noop */ } };
  const install = async () => {
    if (deferred) {
      deferred.prompt();
      try { const { outcome } = await deferred.userChoice; if (outcome === "accepted") setInstalled(true); } catch { /* noop */ }
      setDeferred(null);
    } else if (isIOS) setShowIOS((s) => !s);
  };
  return (
    <div className="max-w-xl mx-auto">
      <div className="p-3.5 rounded-xl" style={{ background: "#12233E", border: "1px solid #3B82F544" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 38, height: 38, background: "#3B82F618", flexShrink: 0 }}><Download size={18} color="#3B82F6" /></div>
          <div style={{ minWidth: 0, flex: "1 1 0%" }}>
            <div style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 700, color: "#E7ECF3" }}>App op je beginscherm</div>
            <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#B9C6DA" }}>Sneller openen en meldingen ontvangen, net als een echte app.</div>
          </div>
          <button onClick={dismiss} style={{ color: "#98A1B0", flexShrink: 0 }} aria-label="Sluiten"><X size={16} /></button>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button small icon={Download} onClick={install}>{isIOS && !deferred ? "Hoe installeer ik dit?" : "Installeren"}</Button>
        </div>
        {showIOS && isIOS && (
          <div className="mt-3 p-2.5 rounded-lg" style={{ background: "#0E1826", border: "1px solid #232B38", fontFamily: "Inter", fontSize: 12, color: "#B9C6DA", lineHeight: 1.6 }}>
            1. Tik op het <b style={{ color: "#E7ECF3" }}>deel-icoon</b> (het vierkantje met pijltje omhoog) onderin Safari.<br />
            2. Kies <b style={{ color: "#E7ECF3" }}>"Zet op beginscherm"</b>.<br />
            3. Open de app voortaan via het nieuwe icoon — dan werken ook de push-meldingen.
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   RITTEN + DIGITALE AFLEVERING (POD, chauffeur)
   De planner zet ritten klaar; de chauffeur opent de route, levert af en
   laat de ontvanger tekenen. Het afleverbewijs komt bij de rit te staan.
--------------------------------------------------------------------- */

// Klein handtekening-vlak (zelfde patroon als op de werkbon).
function SigPad({ sigRef, label, clearLabel }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  useEffect(() => { sigRef.current = { canvas: canvasRef.current, signed: false }; }, [sigRef]);
  const relPos = (e) => {
    const c = canvasRef.current; const rect = c.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: ((t.clientX - rect.left) / rect.width) * c.width, y: ((t.clientY - rect.top) / rect.height) * c.height };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; const ctx = canvasRef.current.getContext("2d"); const p = relPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const ctx = canvasRef.current.getContext("2d"); const p = relPos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = "#0A0E14"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.stroke(); if (sigRef.current) sigRef.current.signed = true; };
  const end = () => { drawing.current = false; };
  const clear = () => { const c = canvasRef.current; if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height); if (sigRef.current) sigRef.current.signed = false; };
  return (
    <div>
      <div className="flex items-center justify-between"><FieldLabel>{label}</FieldLabel><button onClick={clear} style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 12, background: "none", border: "none", cursor: "pointer" }}>{clearLabel}</button></div>
      <canvas ref={canvasRef} width={480} height={150} style={{ width: "100%", height: 130, background: "#FFFFFF", borderRadius: 10, touchAction: "none", cursor: "crosshair" }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
    </div>
  );
}

function RittenTab({ myRides = [], onCompleteRide }) {
  const { t } = useT();
  const [openId, setOpenId] = useState(null);
  const [naam, setNaam] = useState("");
  const [opm, setOpm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [justDone, setJustDone] = useState(null);
  const sigRef = useRef(null);

  const open = myRides.filter((r) => r.status !== "afgeleverd").sort((a, b) => (a.datum || "").localeCompare(b.datum || ""));
  const done = myRides.filter((r) => r.status === "afgeleverd").slice(0, 10);

  const startDeliver = (id) => { setOpenId(id); setNaam(""); setOpm(""); setErr(""); };

  const confirm = async (ride) => {
    if (!naam.trim()) { setErr(t("ritNaamVerplicht")); return; }
    setBusy(true); setErr("");
    const now = new Date();
    const pod = {
      naam: naam.trim(), opmerking: opm.trim(),
      datum: toLocalKey(now), tijd: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      handtekening: sigRef.current?.signed && sigRef.current.canvas ? sigRef.current.canvas.toDataURL("image/png") : null,
    };
    try {
      await onCompleteRide(ride.id, pod);
      setJustDone(ride.id); setOpenId(null);
      setTimeout(() => setJustDone(null), 3500);
    } catch (e) {
      setErr((e && e.message) || "Versturen mislukte — probeer opnieuw.");
    } finally { setBusy(false); }
  };

  const mapsUrl = (adres) => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(adres || "");

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div>
        <Eyebrow>{t("ritOpen")}</Eyebrow>
        {open.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8" style={{ color: "#98A1B0" }}>
            <MapPin size={24} color="#6B7585" />
            <span style={{ fontFamily: "Inter", fontSize: 13, marginTop: 8 }}>{t("ritGeen")}</span>
          </div>
        ) : (
          <div className="space-y-2 mt-1">
            {open.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "Inter", fontSize: 14.5, fontWeight: 700, color: "#E7ECF3" }}>{r.klant}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", marginTop: 2 }}>{r.adres}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0", marginTop: 2 }}>{r.datum}{r.referentie ? ` · ${t("ritRef")} ${r.referentie}` : ""}</div>
                    {r.opmerking && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#8FB8FF", marginTop: 4 }}>{r.opmerking}</div>}
                  </div>
                  <a href={mapsUrl(r.adres)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ flexShrink: 0, border: "1px solid #2A3340", color: "#8FB8FF", fontFamily: "Inter", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
                    <MapPin size={14} /> {t("ritRoute")}
                  </a>
                </div>
                {openId === r.id ? (
                  <div className="mt-3 space-y-3" style={{ borderTop: "1px solid #232B38", paddingTop: 12 }}>
                    <div>
                      <FieldLabel>{t("ritOntvanger")}</FieldLabel>
                      <input className="tg-input w-full" placeholder={t("ritOntvangerPh")} value={naam} onChange={(e) => { setNaam(e.target.value); setErr(""); }} />
                    </div>
                    <input className="tg-input w-full" placeholder={t("ritNotePh")} value={opm} onChange={(e) => setOpm(e.target.value)} />
                    <SigPad sigRef={sigRef} label={t("ritTeken")} clearLabel={t("ritWis")} />
                    {err && <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#F0453F" }}>{err}</div>}
                    <div className="flex gap-2">
                      <Button onClick={() => confirm(r)} disabled={busy} style={{ flex: 1, justifyContent: "center" }}>{busy ? t("ritBezig") : t("ritBevestig")}</Button>
                      <Button variant="ghost" onClick={() => setOpenId(null)} disabled={busy}><X size={14} /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    <Button onClick={() => startDeliver(r.id)} style={{ width: "100%", justifyContent: "center" }} icon={Check}>{t("ritAfleveren")}</Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
        {justDone && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2.5 rounded-lg" style={{ background: "#34D39918", border: "1px solid #34D39944" }}>
            <CheckCircle2 size={15} color="#34D399" />
            <span style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3" }}>{t("ritKlaar")}</span>
          </div>
        )}
      </div>

      {done.length > 0 && (
        <div>
          <Eyebrow>{t("ritDone")}</Eyebrow>
          <div className="space-y-2 mt-1">
            {done.map((r) => (
              <Card key={r.id} className="p-3" style={{ borderLeft: "3px solid #34D399" }}>
                <div className="flex items-center justify-between gap-2">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, color: "#E7ECF3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.klant}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0" }}>{r.pod?.datum || r.datum}{r.pod?.tijd ? ` · ${r.pod.tijd}` : ""}{r.pod?.naam ? ` · ${r.pod.naam}` : ""}</div>
                  </div>
                  <CheckCircle2 size={16} color="#34D399" style={{ flexShrink: 0 }} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   DAGELIJKSE VOERTUIGCHECK (DVIR, chauffeur)
   Vóór vertrek 8 punten nalopen: alles "in orde" of "niet in orde" (met
   notitie). Afgekeurde punten worden automatisch een melding voor de
   werkplaats — via de bestaande pijplijn (kanban, push, planning).
--------------------------------------------------------------------- */
function VoertuigCheck({ vehicles, currentUser, myChecks = [], onSaveCheck, onSubmitReport }) {
  const { t } = useT();
  const [vehicle, setVehicle] = useState("");
  const [answers, setAnswers] = useState({}); // { idx: "ok" | "fout" }
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // null | { issues }
  const [err, setErr] = useState("");

  const today = toLocalKey(new Date());
  const todayDone = vehicle && myChecks.some((c) => c.vehicle === vehicle && c.datum === today);
  const allAnswered = CHECK_POINTS.every((_, i) => answers[i] === "ok" || answers[i] === "fout");
  const answeredCount = CHECK_POINTS.filter((_, i) => answers[i]).length;

  const setAns = (i, val) => { setAnswers((a) => ({ ...a, [i]: val })); setErr(""); };

  const submit = async () => {
    if (!vehicle) return;
    if (!allAnswered) { setErr(t("chkFillAll")); return; }
    setBusy(true); setErr("");
    const now = new Date();
    const items = CHECK_POINTS.map((p, i) => ({ p, ok: answers[i] === "ok", note: answers[i] === "fout" ? (notes[i] || "").trim() : "" }));
    const failed = items.filter((it) => !it.ok);
    const check = {
      id: "chk" + Date.now(),
      vehicle, datum: today,
      tijd: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      chauffeur: currentUser?.naam || "Onbekend", chauffeurId: currentUser?.id || null,
      items, issues: failed.length,
    };
    try {
      await onSaveCheck(check);
      if (failed.length) {
        // Afgekeurde punten als één melding doorzetten (NL — de werkplaats leest NL).
        // Remmen of banden afgekeurd => kritiek.
        const kritiek = failed.some((f) => f.p === CHECK_POINTS[0] || f.p === CHECK_POINTS[2]);
        onSubmitReport({
          id: "r" + Date.now(), vehicle,
          chauffeur: currentUser?.naam || "Onbekend", chauffeurId: currentUser?.id || null,
          omschrijving: "Dagelijkse check: " + failed.map((f) => f.p + (f.note ? ` (${f.note})` : "")).join(", "),
          prioriteit: kritiek ? "kritiek" : "gemiddeld",
          status: "nieuw", datum: today,
          zone: "", wanneer: "", hoelang: "Vandaag", veilig: kritiek ? "Twijfel" : "Ja",
          media: [], mediaCount: 0,
        });
      }
      setDone({ issues: failed.length });
      setAnswers({}); setNotes({}); setVehicle("");
    } catch (e) {
      setErr((e && e.message) || "Opslaan mislukte — probeer opnieuw.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-xl mx-auto">
        <Card className="p-6 text-center">
          <div className="flex items-center justify-center rounded-full mx-auto mb-3" style={{ width: 54, height: 54, background: done.issues ? "#FF8A0018" : "#34D39918" }}>
            {done.issues ? <AlertTriangle size={26} color="#FF8A00" /> : <CheckCircle2 size={26} color="#34D399" />}
          </div>
          <div style={{ fontFamily: "Oswald", fontSize: 20, fontWeight: 600, color: "#E7ECF3" }}>{t("chkDoneTitle")}</div>
          <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#B4BCC9", marginTop: 6, lineHeight: 1.5 }}>{done.issues ? t("chkDoneIssues") : t("chkDoneOk")}</div>
          <div className="mt-4"><Button variant="ghost" onClick={() => setDone(null)}>{t("chkNew")}</Button></div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 30, height: 30, background: "#34D39918" }}><ShieldCheck size={16} color="#34D399" /></div>
          <div style={{ fontFamily: "Oswald", fontSize: 19, fontWeight: 600, color: "#E7ECF3" }}>{t("chkTitle")}</div>
        </div>
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0", marginBottom: 14 }}>{t("chkSub")}</div>

        {/* Voertuigkeuze */}
        <div className="space-y-2">
          {vehicles.map((v) => (
            <button key={v.id} onClick={() => { setVehicle(v.kenteken); setErr(""); }} className="w-full flex items-center gap-3 p-3 rounded-lg text-left"
              style={{ border: `1px solid ${vehicle === v.kenteken ? "#3B82F6" : "#2A3340"}`, background: vehicle === v.kenteken ? "#3B82F614" : "#161C25", transition: "all .15s ease" }}>
              <Kenteken value={v.kenteken} />
              <span style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, color: "#E7ECF3", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.merk}</span>
              {vehicle === v.kenteken && <Check size={16} color="#3B82F6" style={{ marginLeft: "auto", flexShrink: 0 }} />}
            </button>
          ))}
        </div>
        {vehicles.length === 0 && <EmptyState icon={Truck} text="—" />}
        {todayDone && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg" style={{ background: "#34D39914", border: "1px solid #34D39944" }}>
            <CheckCircle2 size={14} color="#34D399" style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9" }}>{t("chkTodayDone")}</span>
          </div>
        )}
      </Card>

      {vehicle && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <Eyebrow>{t("chkTitle")}</Eyebrow>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: answeredCount === CHECK_POINTS.length ? "#34D399" : "#98A1B0" }}>{answeredCount}/{CHECK_POINTS.length}</span>
          </div>
          <div className="space-y-2.5">
            {CHECK_POINTS.map((p, i) => (
              <div key={i} className="p-3 rounded-lg" style={{ background: "#161C25", border: `1px solid ${answers[i] === "fout" ? "#F0453F44" : answers[i] === "ok" ? "#34D39944" : "#232B38"}` }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, color: "#E7ECF3" }}>{t(CHECK_KEYS[i])}</span>
                  <div className="flex gap-1.5" style={{ flexShrink: 0 }}>
                    <button onClick={() => setAns(i, "ok")} className="px-3 py-1.5 rounded-lg text-xs" style={{ fontFamily: "Inter", fontWeight: 600, cursor: "pointer", border: `1px solid ${answers[i] === "ok" ? "#34D399" : "#2A3340"}`, background: answers[i] === "ok" ? "#34D39922" : "transparent", color: answers[i] === "ok" ? "#34D399" : "#B4BCC9" }}>{t("chkOk")}</button>
                    <button onClick={() => setAns(i, "fout")} className="px-3 py-1.5 rounded-lg text-xs" style={{ fontFamily: "Inter", fontWeight: 600, cursor: "pointer", border: `1px solid ${answers[i] === "fout" ? "#F0453F" : "#2A3340"}`, background: answers[i] === "fout" ? "#F0453F22" : "transparent", color: answers[i] === "fout" ? "#F0453F" : "#B4BCC9" }}>{t("chkFout")}</button>
                  </div>
                </div>
                {answers[i] === "fout" && (
                  <input className="tg-input w-full" style={{ marginTop: 8 }} placeholder={t("chkNotePh")} value={notes[i] || ""} onChange={(e) => setNotes((n) => ({ ...n, [i]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          {err && <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#F0453F", marginTop: 10 }}>{err}</div>}
          <div className="mt-4">
            <Button onClick={submit} disabled={busy || !allAnswered} style={{ width: "100%", justifyContent: "center" }}>
              {busy ? t("chkSending") : t("chkSend")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   URENREGISTRATIE (chauffeur)
   Persoonlijk hulpmiddel: reken een werkdag uit (begin, einde, 45 min pauze)
   en bewaar het. Chauffeurs zijn PII-afgeschermd en slaan geen company_state
   op; hun uren blijven daarom lokaal op het toestel staan (offline-first) en
   kunnen als CSV naar de baas worden gestuurd.
--------------------------------------------------------------------- */

// localStorage-sleutel per gebruiker (val terug op e-mail, dan 'anon').
const urenKey = (u) => `tt_uren_${u?.id || u?.email || "anon"}`;
function loadUren(u) {
  try { const a = JSON.parse(localStorage.getItem(urenKey(u)) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
function saveUren(u, list) {
  try { localStorage.setItem(urenKey(u), JSON.stringify(list)); } catch { /* vol of privé-modus */ }
}
// "HH:MM" -> minuten sinds middernacht (of null bij ongeldige invoer).
function hhmmToMin(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
// Gewerkte minuten. Eind vóór begin => nachtdienst (+24u). Pauze (45 min) eraf.
// Begin == einde is ongeldig (anders zou een niet-aangepast veld als 24 uur tellen).
function workedMinutes(start, eind, pauze) {
  const a = hhmmToMin(start), b = hhmmToMin(eind);
  if (a == null || b == null || a === b) return null;
  let d = b - a; if (d < 0) d += 24 * 60;
  d -= pauze ? 45 : 0;
  return Math.max(0, d);
}
const isOvernight = (start, eind) => { const a = hhmmToMin(start), b = hhmmToMin(eind); return a != null && b != null && b < a; };
// Minuten -> "8:15" (taal-neutraal).
function fmtHM(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
// Minuten -> decimale uren met komma, voor de CSV ("8,25").
const fmtDecUur = (min) => (Math.round((min / 60) * 100) / 100).toFixed(2).replace(".", ",");
// ISO-datum (lokale tijd) van een Date.
const isoDay = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
// Maandag t/m zondag van de week waarin d valt.
function weekRange(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const mondayOffset = (dt.getDay() + 6) % 7; // ma=0 … zo=6
  const mon = new Date(dt); mon.setDate(dt.getDate() - mondayOffset);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { from: isoDay(mon), to: isoDay(sun) };
}
// "2026-07-22" -> lokale, vertaalde dagweergave ("wo 22 jul").
function fmtDay(iso, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  try {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(lang || "nl", { weekday: "short", day: "numeric", month: "short" });
  } catch { return iso; }
}

function UrenRegistratie({ currentUser, serverUren = [], onSyncAdd, onSyncDelete }) {
  const { t, lang } = useT();
  const today = isoDay(new Date());
  const [entries, setEntries] = useState(() => loadUren(currentUser));
  const [form, setForm] = useState({ datum: today, start: "08:00", eind: "17:00", pauze: true, note: "" });
  const [saved, setSaved] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  // Bij wisselen van gebruiker (bv. na herinloggen) opnieuw laden.
  useEffect(() => { setEntries(loadUren(currentUser)); }, [currentUser?.id, currentUser?.email]);
  // Elke wijziging meteen lokaal bewaren.
  useEffect(() => { saveUren(currentUser, entries); }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps
  // Server-kopie samenvoegen: registraties van een ánder toestel (onbekende
  // ids) komen erbij, zodat de uren overal hetzelfde zijn.
  useEffect(() => {
    if (!serverUren.length) return;
    setEntries((list) => {
      const known = new Set(list.map((e) => e.id));
      const extra = serverUren.filter((e) => e && e.id && !known.has(e.id));
      if (!extra.length) return list;
      return [...list, ...extra].sort((a, b) => (b.datum || "").localeCompare(a.datum || "") || (b.id || "").localeCompare(a.id || ""));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUren]);

  const preview = workedMinutes(form.start, form.eind, form.pauze);
  const canSave = preview != null && form.datum;

  const add = () => {
    if (!canSave) return;
    const entry = { id: "u" + Date.now(), datum: form.datum, start: form.start, eind: form.eind, pauze: !!form.pauze, note: (form.note || "").trim() };
    setEntries((list) => [entry, ...list].sort((a, b) => (b.datum || "").localeCompare(a.datum || "") || (b.id || "").localeCompare(a.id || "")));
    if (onSyncAdd) onSyncAdd(entry);
    setForm((f) => ({ ...f, note: "" }));
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  };
  const remove = (id) => { setEntries((list) => list.filter((x) => x.id !== id)); if (onSyncDelete) onSyncDelete(id); setConfirmDel(null); };

  // Optellen over een filter: totale minuten + aantal unieke dagen.
  const sumOver = (pred) => {
    const es = entries.filter(pred);
    const min = es.reduce((a, e) => a + (workedMinutes(e.start, e.eind, e.pauze) || 0), 0);
    const days = new Set(es.map((e) => e.datum)).size;
    return { min, days };
  };
  const wk = weekRange(new Date());
  const week = sumOver((e) => e.datum >= wk.from && e.datum <= wk.to);
  const curMonth = today.slice(0, 7);
  const month = sumOver((e) => (e.datum || "").slice(0, 7) === curMonth);

  const exportCSV = () => {
    const rows = [...entries]
      .sort((a, b) => (a.datum || "").localeCompare(b.datum || ""))
      .map((e) => {
        const w = workedMinutes(e.start, e.eind, e.pauze);
        return [e.datum, e.start, e.eind, e.pauze ? "45" : "0", w == null ? "" : fmtDecUur(w), e.note || ""];
      });
    downloadCSV(`uren-${(currentUser?.naam || "chauffeur").replace(/\s+/g, "_")}.csv`, ["Datum", "Begin", "Einde", "Pauze (min)", "Uren", "Notitie"], rows);
  };

  const inputStyle = { width: "100%" };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 30, height: 30, background: "#3B82F618" }}><Clock size={16} color="#3B82F6" /></div>
          <div style={{ fontFamily: "Oswald", fontSize: 19, fontWeight: 600, color: "#E7ECF3" }}>{t("urenTitle")}</div>
        </div>
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0", marginBottom: 14 }}>{t("urenSub")}</div>

        {/* Invoer */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>{t("urenDatum")}</FieldLabel>
            <input type="date" className="tg-input" style={inputStyle} value={form.datum} max={today} onChange={(e) => setForm({ ...form, datum: e.target.value })} />
          </div>
          <div>
            <FieldLabel>{t("urenStart")}</FieldLabel>
            <input type="time" className="tg-input" style={inputStyle} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </div>
          <div>
            <FieldLabel>{t("urenEind")}</FieldLabel>
            <input type="time" className="tg-input" style={inputStyle} value={form.eind} onChange={(e) => setForm({ ...form, eind: e.target.value })} />
          </div>
        </div>

        {/* Pauze-schakelaar (45 min) */}
        <button onClick={() => setForm((f) => ({ ...f, pauze: !f.pauze }))} className="w-full flex items-center gap-2.5 mt-3 px-3 py-2.5 rounded-lg text-left"
          style={{ border: `1px solid ${form.pauze ? "#3B82F6" : "#2A3340"}`, background: form.pauze ? "#3B82F614" : "#161C25", transition: "all .15s ease" }}>
          <span className="flex items-center justify-center rounded" style={{ width: 20, height: 20, flexShrink: 0, border: `2px solid ${form.pauze ? "#3B82F6" : "#4A5568"}`, background: form.pauze ? "#3B82F6" : "transparent" }}>
            {form.pauze && <Check size={13} color="#fff" />}
          </span>
          <Coffee size={15} color={form.pauze ? "#8FB8FF" : "#98A1B0"} />
          <span style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, color: form.pauze ? "#E7ECF3" : "#B4BCC9" }}>{t("urenPauze")}</span>
        </button>

        {/* Notitie */}
        <div className="mt-3">
          <FieldLabel>{t("urenNote")}</FieldLabel>
          <input className="tg-input" style={inputStyle} placeholder={t("urenNotePh")} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>

        {/* Live berekening */}
        <div className="flex items-center justify-between mt-4 px-3 py-2.5 rounded-lg" style={{ background: "#0E141C", border: "1px solid #232B38" }}>
          <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9" }}>{t("urenGewerkt")}{isOvernight(form.start, form.eind) ? ` · ${t("urenNacht")}` : ""}</span>
          <span style={{ fontFamily: "Oswald", fontSize: 22, fontWeight: 700, color: preview == null ? "#6B7585" : "#3B82F6", lineHeight: 1 }}>{fmtHM(preview)}</span>
        </div>

        <div className="mt-3">
          <Button icon={saved ? Check : Plus} onClick={add} disabled={!canSave} style={{ width: "100%", justifyContent: "center", ...(saved ? { background: "linear-gradient(180deg,#34D399,#22C08A)" } : {}) }}>
            {saved ? t("urenSaved") : t("urenSave")}
          </Button>
        </div>
      </Card>

      {/* Week/maand-totalen */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {[{ label: t("urenWeek"), v: week }, { label: t("urenMaand"), v: month }].map((s, i) => (
          <Card key={i} className="p-4">
            <Eyebrow>{s.label}</Eyebrow>
            <div style={{ fontFamily: "Oswald", fontSize: 26, fontWeight: 700, color: "#E7ECF3", lineHeight: 1.1 }}>{fmtHM(s.v.min)}</div>
            <div style={{ fontFamily: "Inter", fontSize: 12, color: "#98A1B0" }}>{s.v.days} {s.v.days === 1 ? t("urenDag") : t("urenDagen")}</div>
          </Card>
        ))}
      </div>

      {/* Lijst met opgeslagen dagen */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Eyebrow>{t("urenTitle")}</Eyebrow>
          {entries.length > 0 && <Button variant="ghost" small icon={Download} onClick={exportCSV}>{t("urenExport")}</Button>}
        </div>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8" style={{ color: "#98A1B0" }}>
            <Clock size={24} color="#6B7585" />
            <span style={{ fontFamily: "Inter", fontSize: 13, marginTop: 8 }}>{t("urenGeen")}</span>
          </div>
        ) : (
          <div className="space-y-2 mt-1">
            {entries.map((e) => {
              const w = workedMinutes(e.start, e.eind, e.pauze);
              return (
                <Card key={e.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div style={{ minWidth: 0, flex: "1 1 0%" }}>
                      <div style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, color: "#E7ECF3", textTransform: "capitalize" }}>{fmtDay(e.datum, lang)}</div>
                      <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 2 }}>
                        <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: "#B4BCC9" }}>{e.start}–{e.eind}</span>
                        {e.pauze && <span style={{ fontFamily: "Inter", fontSize: 10.5, color: "#8FB8FF", border: "1px solid #3B82F644", borderRadius: 5, padding: "1px 5px" }}>45m {t("urenBadgePauze")}</span>}
                        {isOvernight(e.start, e.eind) && <span style={{ fontFamily: "Inter", fontSize: 10.5, color: "#C4A24C", border: "1px solid #C4A24C55", borderRadius: 5, padding: "1px 5px" }}>{t("urenNacht")}</span>}
                      </div>
                      {e.note && <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.note}</div>}
                    </div>
                    <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                      <span style={{ fontFamily: "Oswald", fontSize: 18, fontWeight: 700, color: "#E7ECF3" }}>{fmtHM(w)}</span>
                      {confirmDel === e.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => remove(e.id)} aria-label={t("urenDel")} style={{ background: "#F0453F", color: "#fff", border: "none", borderRadius: 7, padding: "5px 8px", fontFamily: "Inter", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{t("urenDel")}</button>
                          <button onClick={() => setConfirmDel(null)} aria-label="X" style={{ background: "#1A2129", color: "#B4BCC9", border: "1px solid #2A3340", borderRadius: 7, padding: 5, cursor: "pointer", display: "inline-flex" }}><X size={13} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDel(e.id)} aria-label={t("urenDel")} style={{ background: "transparent", border: "none", color: "#6B7585", cursor: "pointer", padding: 4, display: "inline-flex" }}><Trash2 size={15} /></button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DriverHome({ vehicles, onSubmit, currentUser, myReports, onUploadMedia, onSaveCheck, myChecks = [], myRides = [], onCompleteRide, myServerUren = [], onSyncUurAdd, onSyncUurDelete }) {
  const { t } = useT();
  const [tab, setTab] = useState("melding");
  const firstName = currentUser?.naam?.split(" ")[0] || "";
  const openCount = myReports.filter((r) => r.status !== "klaar").length;
  const doneCount = myReports.filter((r) => r.status === "klaar").length;
  const statusColor = (s) => s === "klaar" ? "#34D399" : s === "nieuw" ? "#B4BCC9" : "#3B82F6";
  // Offline-wachtrij: hoeveel meldingen wachten nog op verbinding.
  const [pending, setPending] = useState(queuedCount());
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const off = onQueueChange(setPending);
    const on = () => { setOnline(true); flushQueue(); };
    const offl = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", offl);
    flushQueue(); // bij openen: probeer eventuele wachtrij te legen
    return () => { off(); window.removeEventListener("online", on); window.removeEventListener("offline", offl); };
  }, []);
  return (
    <div className="space-y-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <h1 style={{ fontFamily: "Oswald", fontSize: 26, fontWeight: 600, color: "#E7ECF3" }}>{t("greeting")}{firstName ? `, ${firstName}` : ""}</h1>
          <LangSwitcher compact />
        </div>
        <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>{t("greetingSub")}</p>
        {(pending > 0 || !online) && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg" style={{ background: "#FF8A0018", border: "1px solid #FF8A0044" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: online ? "#FF8A00" : "#98A1B0", flexShrink: 0 }} />
            <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#E7ECF3" }}>
              {pending > 0 ? t("offlinePending", { n: pending }) : t("offlineNow")}
            </span>
          </div>
        )}
        {myReports.length > 0 && (
          <div className="flex gap-2 mt-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "#3B82F618", border: "1px solid #3B82F544" }}>
              <span style={{ fontFamily: "Oswald", fontSize: 15, fontWeight: 700, color: "#3B82F6" }}>{openCount}</span>
              <span style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>{t("lopend")}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "#34D39918", border: "1px solid #34D39944" }}>
              <span style={{ fontFamily: "Oswald", fontSize: 15, fontWeight: 700, color: "#34D399" }}>{doneCount}</span>
              <span style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>{t("afgerond")}</span>
            </div>
          </div>
        )}
      </div>

      <InstallCard />

      {/* Segment: melding, dagelijkse check, ritten (alleen als er ritten zijn
          toegewezen) of eigen uren. Het aantal open ritten staat als badge. */}
      <div className="max-w-xl mx-auto flex gap-1.5 p-1 rounded-xl" style={{ background: "#10151D", border: "1px solid #232B38" }}>
        {[
          { id: "melding", label: t("segMelding"), icon: AlertTriangle },
          { id: "check", label: t("segCheck"), icon: ShieldCheck },
          ...(myRides.length > 0 ? [{ id: "ritten", label: t("segRitten"), icon: MapPin, badge: myRides.filter((r) => r.status !== "afgeleverd").length }] : []),
          { id: "uren", label: t("segUren"), icon: Clock },
        ].map((s) => (
          <button key={s.id} onClick={() => setTab(s.id)} aria-pressed={tab === s.id} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg"
            style={{ fontFamily: "Inter", fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "none", minWidth: 0, background: tab === s.id ? "linear-gradient(180deg,#4C8DFF,#3B82F6)" : "transparent", color: tab === s.id ? "#fff" : "#B4BCC9", boxShadow: tab === s.id ? "0 2px 10px rgba(59,130,246,0.35)" : "none", transition: "all .15s ease" }}>
            <s.icon size={14} style={{ flexShrink: 0 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
            {s.badge > 0 && <span style={{ flexShrink: 0, minWidth: 17, height: 17, borderRadius: 999, background: tab === s.id ? "#FFFFFF33" : "#3B82F6", color: "#fff", fontSize: 10.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{s.badge}</span>}
          </button>
        ))}
      </div>

      {/* De melding-tab blijft gemount (display:none) zodat een half ingevulde
          melding niet verloren gaat als de chauffeur even naar check/uren kijkt. */}
      {tab === "uren" && <UrenRegistratie currentUser={currentUser} serverUren={myServerUren} onSyncAdd={onSyncUurAdd} onSyncDelete={onSyncUurDelete} />}
      {tab === "ritten" && <RittenTab myRides={myRides} onCompleteRide={onCompleteRide} />}
      {tab === "check" && <VoertuigCheck vehicles={vehicles} currentUser={currentUser} myChecks={myChecks} onSaveCheck={onSaveCheck} onSubmitReport={onSubmit} />}
      <div className="space-y-6" style={{ display: tab !== "melding" ? "none" : undefined }}>
        <>
          <MeldingMaken vehicles={vehicles} onSubmit={onSubmit} currentUser={currentUser} onUploadMedia={onUploadMedia} />

          <div className="max-w-xl mx-auto">
            <Eyebrow>{t("yourReports")}</Eyebrow>
            {myReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8" style={{ color: "#98A1B0" }}>
                <CheckCircle2 size={26} color="#6B7585" />
                <span style={{ fontFamily: "Inter", fontSize: 13, marginTop: 8 }}>{t("noReports")}</span>
              </div>
            ) : (
              <div className="space-y-2 mt-1">
                {myReports.map((r) => (
                  <Card key={r.id} className="p-3" style={{ borderLeft: `3px solid ${statusColor(r.status)}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div style={{ minWidth: 0, flex: "1 1 0%" }}>
                        <div className="flex items-center gap-2 mb-1"><Kenteken value={r.vehicle} />
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: PRIO_META[r.prioriteit].color, border: `1px solid ${PRIO_META[r.prioriteit].color}55`, fontWeight: 600, flexShrink: 0 }}>{PRIO_META[r.prioriteit].label}</span>
                        </div>
                        <div style={{ fontFamily: "Inter", color: "#E7ECF3", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.omschrijving}</div>
                        <div style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 11 }}>{r.datum}</div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full" style={{ color: statusColor(r.status), background: `${statusColor(r.status)}18`, fontFamily: "Inter", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>{KANBAN_COLS.find((c) => c.id === r.status)?.label}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   ADMIN VIEWS (largely unchanged from v1, condensed)
--------------------------------------------------------------------- */

/* ---------------------------------------------------------------------
   RITTEN (beheerder): ritten plannen en afleverbewijzen inzien/downloaden
--------------------------------------------------------------------- */
function RidesView({ rides = [], vehicles = [], users = [], profiel = {}, company, onAdd, onDelete }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("open"); // open | done | all
  const [confirmDel, setConfirmDel] = useState(null);
  const [podView, setPodView] = useState(null); // rit waarvan we de aflevering tonen
  const chauffeurs = users.filter((u) => u.rol === "chauffeur");
  const [form, setForm] = useState({ datum: TODAY, klant: "", adres: "", referentie: "", vehicle: "", chauffeurId: "", opmerking: "" });
  const [err, setErr] = useState("");

  const submit = () => {
    if (!form.klant.trim() || !form.adres.trim()) { setErr("Vul minimaal klant en adres in."); return; }
    const ch = chauffeurs.find((c) => c.id === form.chauffeurId);
    onAdd({
      id: "rit" + Date.now(), datum: form.datum || TODAY,
      klant: form.klant.trim(), adres: form.adres.trim(), referentie: form.referentie.trim(),
      vehicle: form.vehicle || "", chauffeurId: form.chauffeurId || null, chauffeur: ch ? ch.naam : "",
      opmerking: form.opmerking.trim(), status: "gepland", pod: null,
    });
    setForm({ datum: TODAY, klant: "", adres: "", referentie: "", vehicle: "", chauffeurId: "", opmerking: "" });
    setErr(""); setOpen(false);
  };

  const shown = [...rides]
    .filter((r) => filter === "all" ? true : filter === "done" ? r.status === "afgeleverd" : r.status !== "afgeleverd")
    .sort((a, b) => (b.datum || "").localeCompare(a.datum || "") || (b.id || "").localeCompare(a.id || ""));
  const openCount = rides.filter((r) => r.status !== "afgeleverd").length;
  const doneCount = rides.length - openCount;

  // Afleverbewijs als PDF — zelfde huisstijl-aanpak als de werkbon.
  const downloadPod = async (r) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const M = 16, R = 210 - M; let y = 18;
    const naam = profiel.bedrijfsnaam || company?.name || "";
    if (profiel.logo) {
      try { const props = doc.getImageProperties(profiel.logo); const w = 34, h = Math.min(24, (props.height / props.width) * w); doc.addImage(profiel.logo, "PNG", M, y, w, h); } catch { /* ongeldig logo */ }
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(naam, R, y + 4, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
    let hy = y + 9;
    [profiel.adres, [profiel.postcode, profiel.plaats].filter(Boolean).join("  "), profiel.telefoon, profiel.email].filter(Boolean).forEach((tl) => { doc.text(String(tl), R, hy, { align: "right" }); hy += 4; });
    doc.setTextColor(0);
    y = Math.max(y + 26, hy) + 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("AFLEVERBEWIJS", M, y);
    y += 3; doc.setDrawColor(200); doc.line(M, y, R, y); y += 8;
    doc.setFontSize(10);
    const row = (label, val) => { if (!val) return; doc.setFont("helvetica", "bold"); doc.text(label, M, y); doc.setFont("helvetica", "normal"); doc.text(String(val), M + 42, y); y += 6; };
    row("Klant", r.klant);
    row("Afleveradres", r.adres);
    row("Referentie", r.referentie);
    row("Ritdatum", r.datum);
    row("Voertuig", r.vehicle);
    row("Chauffeur", r.chauffeur || r.pod?.door);
    y += 2; doc.setDrawColor(230); doc.line(M, y, R, y); y += 7;
    row("Afgeleverd op", `${r.pod?.datum || ""} ${r.pod?.tijd || ""}`.trim());
    row("Ontvangen door", r.pod?.naam);
    row("Opmerking", r.pod?.opmerking);
    if (r.pod?.handtekening) {
      y += 3;
      try { doc.addImage(r.pod.handtekening, "PNG", M, y, 60, 22); y += 24; } catch { /* geen geldige handtekening */ }
      doc.setFontSize(9); doc.setTextColor(120); doc.text("Handtekening ontvanger", M, y + 3); doc.setTextColor(0);
    }
    doc.save(`afleverbewijs-${(r.referentie || r.klant || r.id).replace(/[^\w-]+/g, "_")}.pdf`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><MapPin size={22} color="#3B82F6" /> Ritten</h1>
          <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>{openCount} open · {doneCount} afgeleverd. De chauffeur tekent digitaal af.</p>
        </div>
        {!open && <Button icon={Plus} onClick={() => setOpen(true)}>Nieuwe rit</Button>}
      </div>

      {open && (
        <Card className="p-5">
          <div style={{ fontFamily: "Oswald", fontSize: 18, fontWeight: 600, color: "#E7ECF3", marginBottom: 12 }}>Nieuwe rit</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))" }}>
            <div><FieldLabel>Klant</FieldLabel><input className="tg-input w-full" placeholder="Bv. Bakkerij Vermeulen" value={form.klant} onChange={(e) => setForm({ ...form, klant: e.target.value })} /></div>
            <div><FieldLabel>Afleveradres</FieldLabel><input className="tg-input w-full" placeholder="Straat, plaats" value={form.adres} onChange={(e) => setForm({ ...form, adres: e.target.value })} /></div>
            <div><FieldLabel>Datum</FieldLabel><input type="date" className="tg-input w-full" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></div>
            <div><FieldLabel>Referentie (optioneel)</FieldLabel><input className="tg-input w-full" placeholder="Ordernummer" value={form.referentie} onChange={(e) => setForm({ ...form, referentie: e.target.value })} /></div>
            <div><FieldLabel>Voertuig</FieldLabel>
              <select className="tg-input w-full" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })}>
                <option value="">— Kies voertuig —</option>
                {vehicles.map((v) => <option key={v.id} value={v.kenteken}>{v.kenteken} · {v.merk}</option>)}
              </select>
            </div>
            <div><FieldLabel>Chauffeur</FieldLabel>
              <select className="tg-input w-full" value={form.chauffeurId} onChange={(e) => setForm({ ...form, chauffeurId: e.target.value })}>
                <option value="">— Kies chauffeur —</option>
                {chauffeurs.map((c) => <option key={c.id} value={c.id}>{c.naam}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}><FieldLabel>Opmerking voor de chauffeur (optioneel)</FieldLabel><input className="tg-input w-full" placeholder="Bv. achterom leveren, vóór 10:00" value={form.opmerking} onChange={(e) => setForm({ ...form, opmerking: e.target.value })} /></div>
          </div>
          {err && <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#F0453F", marginTop: 10 }}>{err}</div>}
          <div className="flex gap-2 mt-4"><Button onClick={submit}>Rit toevoegen</Button><Button variant="ghost" onClick={() => { setOpen(false); setErr(""); }}>Annuleren</Button></div>
          <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0", marginTop: 10 }}>De rit verschijnt direct bij de gekozen chauffeur onder "Ritten". Na aflevering staat het afleverbewijs (naam + handtekening) hier.</div>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap">
        <Chip active={filter === "open"} onClick={() => setFilter("open")}>Open ({openCount})</Chip>
        <Chip active={filter === "done"} onClick={() => setFilter("done")}>Afgeleverd ({doneCount})</Chip>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>Alles</Chip>
      </div>

      {shown.length === 0 ? <EmptyState icon={MapPin} text={rides.length === 0 ? "Nog geen ritten. Voeg een rit toe — de chauffeur ziet 'm direct in de app en tekent digitaal af." : "Geen ritten in dit filter."} /> : (
        <div className="space-y-2">
          {shown.map((r) => {
            const done = r.status === "afgeleverd";
            return (
              <Card key={r.id} className="p-4" style={{ borderLeft: `3px solid ${done ? "#34D399" : "#3B82F6"}` }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontFamily: "Inter", fontSize: 14.5, fontWeight: 700, color: "#E7ECF3" }}>{r.klant}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: done ? "#34D399" : "#8FB8FF", background: done ? "#34D39918" : "#3B82F618", fontWeight: 600 }}>{done ? "Afgeleverd" : "Gepland"}</span>
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", marginTop: 2 }}>{r.adres}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0", marginTop: 2 }}>
                      {r.datum}{r.referentie ? ` · Ref. ${r.referentie}` : ""}{r.vehicle ? ` · ${r.vehicle}` : ""}{r.chauffeur ? ` · ${r.chauffeur}` : ""}
                    </div>
                    {done && r.pod && (
                      <div style={{ fontFamily: "Inter", fontSize: 12, color: "#34D399", marginTop: 4 }}>
                        Ontvangen door {r.pod.naam || "—"} · {r.pod.datum || ""} {r.pod.tijd || ""}{r.pod.opmerking ? ` · ${r.pod.opmerking}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap" style={{ flexShrink: 0 }}>
                    {done && r.pod && (
                      <>
                        {r.pod.handtekening && <Button small variant="ghost" onClick={() => setPodView(podView === r.id ? null : r.id)}>{podView === r.id ? "Verberg" : "Handtekening"}</Button>}
                        <Button small variant="ghost" icon={Download} onClick={() => downloadPod(r)}>PDF</Button>
                      </>
                    )}
                    {confirmDel === r.id ? (
                      <span className="flex items-center gap-2">
                        <button onClick={() => { onDelete(r.id); setConfirmDel(null); }} className="text-xs" style={{ color: "#F0453F", fontWeight: 700 }}>Bevestig</button>
                        <button onClick={() => setConfirmDel(null)} className="text-xs" style={{ color: "#B4BCC9" }}>Nee</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDel(r.id)} aria-label="Rit verwijderen" title="Verwijderen" style={{ color: "#6B7585", background: "none", border: "none", cursor: "pointer", padding: 4 }}><Trash2 size={15} /></button>
                    )}
                  </div>
                </div>
                {podView === r.id && r.pod?.handtekening && (
                  <div className="mt-3 p-3 rounded-lg" style={{ background: "#FFFFFF", maxWidth: 300 }}>
                    <img src={r.pod.handtekening} alt={`Handtekening ${r.pod.naam || "ontvanger"}`} style={{ width: "100%", display: "block" }} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClickableKpi({ label, value, icon: Icon, accent, onClick }) {
  return (
    <button onClick={onClick} className="text-left w-full">
      <Card hover className="p-5 h-full" style={{ cursor: "pointer" }}>
        <div className="flex items-start justify-between">
          <Eyebrow>{label}</Eyebrow>
          <div className="flex items-center justify-center rounded-lg" style={{ width: 30, height: 30, background: `${accent}18` }}><Icon size={16} color={accent} /></div>
        </div>
        <div style={{ fontFamily: "Oswald", fontSize: 34, fontWeight: 600, color: "#E7ECF3", lineHeight: 1.1 }}>{value}</div>
      </Card>
    </button>
  );
}

// Bazen-dashboard: vloot-brede rapportage voor de beheerder. Kosten per km,
// duurste voertuigen, meldingen-trend en kosten per categorie — in één blik.
function ReportingView({ vehicles = [], reports = [], costs = [], planning = [], onSelectVehicle }) {
  const isMobile = useIsMobile();
  const thisYear = String(new Date().getFullYear());
  const fmt = (n) => "€ " + Math.round(n).toLocaleString("nl-NL");
  const MONTH_LABELS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

  const costsYear = costs.filter((c) => (c.datum || "").startsWith(thisYear));
  const totalYear = costsYear.reduce((a, c) => a + (Number(c.bedrag) || 0), 0);
  const totalKm = vehicles.reduce((a, v) => a + (Number(v.km) || 0), 0);
  const totalAll = costs.reduce((a, c) => a + (Number(c.bedrag) || 0), 0);
  const perKmFleet = totalKm > 0 ? totalAll / totalKm : 0;
  const avgHealth = vehicles.length ? Math.round(vehicles.reduce((a, v) => a + (Number(v.health) || 0), 0) / vehicles.length) : 0;

  // Per voertuig: kosten dit jaar + kosten/km (totaal). Top 5 duurste.
  const perVehicle = vehicles.map((v) => {
    const vCostsYear = costsYear.filter((c) => c.vehicle === v.kenteken).reduce((a, c) => a + (Number(c.bedrag) || 0), 0);
    const vCostsAll = costs.filter((c) => c.vehicle === v.kenteken).reduce((a, c) => a + (Number(c.bedrag) || 0), 0);
    const perKm = v.km > 0 ? vCostsAll / v.km : 0;
    return { ...v, kostenJaar: vCostsYear, kostenTot: vCostsAll, perKm };
  });
  const topExpensive = [...perVehicle].sort((a, b) => b.kostenJaar - a.kostenJaar).filter((v) => v.kostenJaar > 0).slice(0, 5);
  const maxTop = Math.max(1, ...topExpensive.map((v) => v.kostenJaar));

  // Meldingen per maand (laatste 12 maanden).
  const trend = (() => {
    const acc = {};
    reports.forEach((r) => { const k = (r.datum || "").slice(0, 7); if (/^\d{4}-\d{2}$/.test(k)) acc[k] = (acc[k] || 0) + 1; });
    // Bouw de laatste 12 maanden op basis van 'nu' zodat ook lege maanden tellen.
    const now = new Date();
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push({ key: k, label: `${MONTH_LABELS[d.getMonth()]}`, n: acc[k] || 0 });
    }
    return out;
  })();
  const trendMax = Math.max(1, ...trend.map((t) => t.n));

  // Kosten per categorie (vlootbreed, dit jaar).
  const byCat = COST_CATEGORIES.map((cat) => ({ ...cat, bedrag: costsYear.filter((c) => c.categorie === cat.id).reduce((a, c) => a + (Number(c.bedrag) || 0), 0) })).filter((c) => c.bedrag > 0).sort((a, b) => b.bedrag - a.bedrag);
  const maxCat = Math.max(1, ...byCat.map((c) => c.bedrag));

  const openReports = reports.filter((r) => r.status !== "klaar").length;
  const doneReports = reports.filter((r) => r.status === "klaar").length;
  const kritiek = reports.filter((r) => r.prioriteit === "kritiek" && r.status !== "klaar").length;

  const exportFleet = () => {
    const rows = [...perVehicle].sort((a, b) => b.kostenJaar - a.kostenJaar).map((v) => [v.kenteken, v.merk || "", v.km || 0, Math.round(v.kostenJaar), Math.round(v.kostenTot), (Math.round(v.perKm * 100) / 100).toFixed(2), v.health]);
    downloadCSV(`vlootrapport-${thisYear}.csv`, ["Kenteken", "Merk", "Km", `Kosten ${thisYear} (EUR)`, "Kosten totaal (EUR)", "EUR/km", "Gezondheid"], rows);
  };

  const kpi = (label, value, sub, color = "#3B82F6") => (
    <Card className="p-5">
      <Eyebrow>{label}</Eyebrow>
      <div style={{ fontFamily: "Oswald", fontSize: 30, fontWeight: 600, color, lineHeight: 1.1, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>{sub}</div>}
    </Card>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><BarChart3 size={22} color="#3B82F6" /> Rapportage</h1>
          <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Vloot-breed overzicht: kosten, duurste voertuigen en meldingen-trend.</p>
        </div>
        <Button variant="ghost" icon={Download} onClick={exportFleet} disabled={vehicles.length === 0}>Vlootrapport CSV</Button>
      </div>

      {vehicles.length === 0 ? <EmptyState icon={BarChart3} text="Nog geen voertuigen — voeg voertuigen en kosten toe om rapportage te zien." /> : (
      <>
      <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr) minmax(0,1fr)" : "repeat(4, minmax(0,1fr))" }}>
        {kpi("Voertuigen", vehicles.length, `${openReports} meldingen open`)}
        {kpi(`Kosten ${thisYear}`, fmt(totalYear), `${costsYear.length} posten`)}
        {kpi("Gem. kosten/km", perKmFleet > 0 ? "€ " + (Math.round(perKmFleet * 100) / 100).toFixed(2) : "—", `${Math.round(totalKm).toLocaleString("nl-NL")} km totaal`, "#22D3B0")}
        {kpi("Gem. gezondheid", avgHealth + "%", kritiek > 0 ? `${kritiek} kritieke meldingen` : "geen kritieke", avgHealth < 60 ? "#F0453F" : avgHealth < 80 ? "#FF8A00" : "#34D399")}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "1.3fr 1fr" }}>
        {/* Top-5 duurste voertuigen */}
        <Card className="p-5">
          <Eyebrow>Duurste voertuigen ({thisYear})</Eyebrow>
          {topExpensive.length === 0 ? <div style={{ fontFamily: "Inter", fontSize: 13, color: "#98A1B0", marginTop: 8 }}>Nog geen kosten dit jaar.</div> : (
            <div className="space-y-2.5 mt-3">
              {topExpensive.map((v) => (
                <button key={v.id} onClick={() => onSelectVehicle && onSelectVehicle(v.id)} className="w-full flex items-center gap-3 text-left">
                  <span style={{ width: 92, flexShrink: 0 }}><Kenteken value={v.kenteken} /></span>
                  <div className="flex-1 h-3 rounded-full" style={{ background: "#1A2129", overflow: "hidden", minWidth: 0 }}><div className="h-full rounded-full" style={{ width: `${(v.kostenJaar / maxTop) * 100}%`, background: "linear-gradient(90deg,#3B82F6,#60A5FA)" }} /></div>
                  <span style={{ width: 118, textAlign: "right", flexShrink: 0 }}>
                    <span style={{ fontFamily: "JetBrains Mono", fontSize: 12.5, color: "#E7ECF3", fontWeight: 700 }}>{fmt(v.kostenJaar)}</span>
                    <span style={{ display: "block", fontFamily: "Inter", fontSize: 10.5, color: "#98A1B0" }}>{v.perKm > 0 ? `€ ${(Math.round(v.perKm * 100) / 100).toFixed(2)}/km` : "—"}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Kosten per categorie */}
        <Card className="p-5">
          <Eyebrow>Kosten per categorie ({thisYear})</Eyebrow>
          {byCat.length === 0 ? <div style={{ fontFamily: "Inter", fontSize: 13, color: "#98A1B0", marginTop: 8 }}>Nog geen kosten dit jaar.</div> : (
            <div className="space-y-2.5 mt-3">
              {byCat.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <span style={{ width: 92, fontFamily: "Inter", fontSize: 12, color: "#B4BCC9", flexShrink: 0 }}>{c.label}</span>
                  <div className="flex-1 h-3 rounded-full" style={{ background: "#1A2129", overflow: "hidden", minWidth: 0 }}><div className="h-full rounded-full" style={{ width: `${(c.bedrag / maxCat) * 100}%`, background: c.color }} /></div>
                  <span style={{ width: 78, textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12, color: "#E7ECF3", flexShrink: 0 }}>{fmt(c.bedrag)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Meldingen per maand */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Eyebrow>Meldingen per maand (laatste 12)</Eyebrow>
          <span style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>{openReports} open · {doneReports} afgerond</span>
        </div>
        <div className="flex items-end gap-1.5 mt-4" style={{ height: 130 }}>
          {trend.map((t) => (
            <div key={t.key} className="flex-1 flex flex-col items-center justify-end gap-1.5" style={{ height: "100%", minWidth: 0 }} title={`${t.label}: ${t.n}`}>
              <span style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: "#98A1B0" }}>{t.n > 0 ? t.n : ""}</span>
              <div className="w-full rounded-t" style={{ height: `${(t.n / trendMax) * 100}%`, minHeight: t.n > 0 ? 3 : 0, background: t.n > 0 ? "linear-gradient(180deg,#22D3B0,#0EA5A0)" : "transparent" }} />
              <span style={{ fontFamily: "Inter", fontSize: 10, color: "#B4BCC9" }}>{t.label}</span>
            </div>
          ))}
        </div>
      </Card>
      </>
      )}
    </div>
  );
}

function DashboardView({ vehicles, parts, reports, planning, costs = [], company, isAdmin, onNavigate, onSelectVehicle, onLoadSample }) {
  const isMobile = useIsMobile();
  const openReports = reports.filter((r) => r.status !== "klaar").length;
  const critical = reports.filter((r) => r.prioriteit === "kritiek" && r.status !== "klaar").length;
  const lowStock = parts.filter((p) => p.voorraad < p.min).length;
  const thisYear = String(new Date().getFullYear());
  const costsThisYear = costs.filter((c) => (c.datum || "").startsWith(thisYear)).reduce((a, c) => a + (Number(c.bedrag) || 0), 0);
  // Maand-op-maand trend voor de kosten-tegel.
  const _now = new Date();
  const _curMonth = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}`;
  const _prev = new Date(_now.getFullYear(), _now.getMonth() - 1, 1);
  const _prevMonth = `${_prev.getFullYear()}-${String(_prev.getMonth() + 1).padStart(2, "0")}`;
  const costsCurMonth = costs.filter((c) => (c.datum || "").startsWith(_curMonth)).reduce((a, c) => a + (Number(c.bedrag) || 0), 0);
  const costsPrevMonth = costs.filter((c) => (c.datum || "").startsWith(_prevMonth)).reduce((a, c) => a + (Number(c.bedrag) || 0), 0);
  const costsDeltaPct = costsPrevMonth > 0 ? Math.round(((costsCurMonth - costsPrevMonth) / costsPrevMonth) * 100) : null;
  const avgHealth = Math.round(vehicles.reduce((a, v) => a + v.health, 0) / (vehicles.length || 1));
  const inWorkshop = vehicles.filter((v) => v.status === "workshop").length;
  const go = (v) => onNavigate && onNavigate(v);
  // Compliance alerts: vehicles with an expired or soon-expiring keuring
  const complianceAlerts = vehicles
    .map((v) => ({ vehicle: v, items: vehicleComplianceItems(v).filter((it) => it.status === "verlopen" || it.status === "binnenkort") }))
    .filter((x) => x.items.length > 0)
    .sort((a, b) => Math.min(...a.items.map((i) => i.dagen ?? 9999)) - Math.min(...b.items.map((i) => i.dagen ?? 9999)));
  const sortedReports = [...reports].sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
  const todayItems = planning.filter((p) => p.datum === TODAY).sort((a, b) => a.tijd.localeCompare(b.tijd));
  const todayLabel = new Date(TODAY).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><LayoutDashboard size={22} color="#3B82F6" /> Dashboard</h1>
        <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Overzicht van vloot en garage — {company.name}</p>
      </div>

      {/* Verse omgeving? Bied voorbeelddata aan om alles te testen. */}
      {onLoadSample && vehicles.length === 0 && reports.length === 0 && planning.length === 0 && (
        <Card className="p-5" style={{ border: "1px dashed #3B82F566", background: "linear-gradient(135deg,#12233E,#12171F)" }}>
          <div className="flex items-start gap-3">
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "#3B82F622", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Sparkles size={18} color="#3B82F6" /></div>
            <div className="flex-1" style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "Oswald", fontSize: 16, fontWeight: 600, color: "#E7ECF3" }}>Welkom! Je omgeving is nog leeg</div>
              <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 13, marginTop: 2, lineHeight: 1.5 }}>
                Wil je de app eerst uitproberen? Laad voorbeeldvoertuigen, meldingen, planning en kosten. Je kunt alles later met één klik weer wissen (Instellingen → Testomgeving).
              </p>
              <button onClick={onLoadSample} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: "#3B82F6", color: "#fff", fontFamily: "Inter", fontWeight: 600, fontSize: 13.5 }}>
                <Sparkles size={15} /> Voorbeelddata laden
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr) minmax(0, 1fr)" : "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <ClickableKpi label="Voertuigen" value={vehicles.length} icon={Truck} accent="#22D3B0" onClick={() => go("vehicles")} />
        <ClickableKpi label="Open meldingen" value={openReports} icon={Wrench} accent="#3B82F6" onClick={() => go("workfloor")} />
        <ClickableKpi label="Kritiek open" value={critical} icon={AlertTriangle} accent="#F0453F" onClick={() => go("workfloor")} />
        <ClickableKpi label="Lage voorraad" value={lowStock} icon={Package} accent="#B4BCC9" onClick={() => go("parts")} />
      </div>

      {/* Planning + kosten naast elkaar op laptop (compact, minder loze ruimte) */}
      <div className="grid gap-4" style={{ gridTemplateColumns: isMobile || !isAdmin ? "minmax(0, 1fr)" : "1.5fr 1fr" }}>
      <Card className="p-5" style={{ border: "1px solid #3B82F544", background: "linear-gradient(135deg,#12233E,#12171F)" }}>
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <Calendar size={18} color="#3B82F6" style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "Oswald", fontSize: 17, fontWeight: 600, color: "#E7ECF3" }}>Planning vandaag</div>
              <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9", textTransform: "capitalize" }}>{todayLabel}</div>
            </div>
          </div>
          <button onClick={() => go("planning")} style={{ color: "#3B82F6", fontFamily: "Inter", fontSize: 12, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>Naar planning →</button>
        </div>
        {todayItems.length === 0 ? (
          <div className="flex items-center gap-2 py-3" style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }}>
            <CheckCircle2 size={15} color="#34D399" /> Niets ingepland voor vandaag.
          </div>
        ) : (
          <div className="space-y-2">
            {todayItems.map((p) => (
              <button key={p.id} onClick={() => go("planning")} className="w-full flex items-stretch gap-3 text-left rounded-lg overflow-hidden" style={{ background: "#141A23", border: "1px solid #232B38" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3B82F6")} onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#232B38")}>
                <div className="flex flex-col items-center justify-center px-3 py-2.5" style={{ background: "#3B82F618", minWidth: 66, flexShrink: 0 }}>
                  <span style={{ fontFamily: "JetBrains Mono", fontSize: 15, color: "#3B82F6", fontWeight: 700 }}>{p.tijd}</span>
                  <span style={{ fontFamily: "Inter", fontSize: 10, color: "#B4BCC9" }}>{p.duur} min</span>
                </div>
                <div className="flex items-center gap-3 py-2.5 pr-3" style={{ minWidth: 0, flex: 1 }}>
                  <Kenteken value={p.vehicle} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#E7ECF3", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.taak}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 11, color: "#B4BCC9" }}>Monteur: {p.monteur}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {isAdmin && (
        <button onClick={() => go("costs")} className="text-left w-full">
          <Card hover className="p-5 h-full" style={{ cursor: "pointer" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                <div className="flex items-center justify-center rounded-lg" style={{ width: 38, height: 38, background: "#3B82F618", flexShrink: 0 }}><Euro size={19} color="#3B82F6" /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Kosten {thisYear}</div>
                  <div style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3", lineHeight: 1.1 }}>{"€ " + Math.round(costsThisYear).toLocaleString("nl-NL")}</div>
                  {costsDeltaPct !== null && costsDeltaPct !== 0 && (
                    <div style={{ fontFamily: "Inter", fontSize: 11.5, fontWeight: 600, color: costsDeltaPct > 0 ? "#F0453F" : "#22C55E", marginTop: 2 }}>{costsDeltaPct > 0 ? "▲" : "▼"} {Math.abs(costsDeltaPct)}% vs vorige maand</div>
                  )}
                </div>
              </div>
              <span style={{ color: "#3B82F6", fontFamily: "Inter", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>Naar kosten →</span>
            </div>
          </Card>
        </button>
      )}
      </div>

      {/* Vlootgezondheid — mag de volle breedte houden */}
      <Card className="p-5">
        <Eyebrow>Gemiddelde vlootgezondheid</Eyebrow>
        <div className="flex items-end gap-4">
          <div style={{ fontFamily: "Oswald", fontSize: 42, fontWeight: 600, color: avgHealth > 75 ? "#34D399" : avgHealth > 50 ? "#FF8A00" : "#F0453F" }}>{avgHealth}%</div>
          <div className="flex-1 h-2 rounded-full mb-3" style={{ background: "#1A2129" }}>
            <div className="h-2 rounded-full" style={{ width: `${avgHealth}%`, background: avgHealth > 75 ? "#34D399" : avgHealth > 50 ? "#FF8A00" : "#F0453F" }} />
          </div>
        </div>

        {/* Vlootstatus — grafische verdeling operationeel / let op / werkplaats */}
        {vehicles.length > 0 && (() => {
          const dist = [
            { key: "operational", n: vehicles.filter((v) => v.status === "operational").length },
            { key: "attention", n: vehicles.filter((v) => v.status === "attention").length },
            { key: "workshop", n: vehicles.filter((v) => v.status === "workshop").length },
          ].filter((d) => d.n > 0);
          return (
            <div className="mt-2">
              <div className="flex w-full rounded-full overflow-hidden" style={{ height: 10, background: "#1A2129" }}>
                {dist.map((d) => <div key={d.key} title={`${STATUS_META[d.key].label}: ${d.n}`} style={{ width: `${(d.n / vehicles.length) * 100}%`, background: STATUS_META[d.key].color }} />)}
              </div>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {["operational", "attention", "workshop"].map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5" style={{ fontFamily: "Inter", fontSize: 11.5, color: "#B4BCC9" }}>
                    <span className="rounded-full" style={{ width: 8, height: 8, background: STATUS_META[k].color }} />
                    {STATUS_META[k].label}: <b style={{ color: "#E7ECF3" }}>{vehicles.filter((v) => v.status === k).length}</b>
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      </Card>

      {/* Keuringen + vloot + meldingen: compact naast elkaar op laptop */}
      <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))" }}>
        {complianceAlerts.length > 0 && (
          <Card className="p-5" style={{ border: "1px solid #FF8A0055", background: "#FF8A000A" }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: "#FF8A0022" }}><ShieldCheck size={14} color="#FF8A00" /></div>
              <span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>Keuringen die aandacht nodig hebben</span>
              <span className="rounded-full flex items-center justify-center" style={{ minWidth: 20, height: 20, padding: "0 6px", background: "#FF8A00", color: "#0A0E14", fontSize: 11, fontWeight: 700, fontFamily: "Inter" }}>{complianceAlerts.length}</span>
            </div>
            <div className="space-y-2">
              {complianceAlerts.slice(0, 6).map(({ vehicle: v, items }) => (
                <button key={v.id} onClick={() => onSelectVehicle && onSelectVehicle(v.id)} className="w-full text-left flex items-center justify-between gap-2 p-3 rounded-lg" style={{ background: "#12171F", border: "1px solid #232B38" }}>
                  <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                    <Kenteken value={v.kenteken} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {items.map((it) => `${it.label}${it.status === "verlopen" ? " verlopen" : ` (${it.dagen}d)`}`).join(" · ")}
                      </div>
                    </div>
                  </div>
                  {(() => { const worst = items.some((i) => i.status === "verlopen") ? "verlopen" : "binnenkort"; const meta = COMPLIANCE_META[worst]; return <span className="text-xs px-2 py-1 rounded" style={{ color: meta.color, border: `1px solid ${meta.color}55`, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>{meta.label}</span>; })()}
                </button>
              ))}
            </div>
          </Card>
        )}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-1"><Eyebrow>Vloot status</Eyebrow><button onClick={() => go("vehicles")} style={{ color: "#3B82F6", fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>Alles bekijken</button></div>
          <div className="space-y-3 mt-2">
            {vehicles.map((v) => (
              <button key={v.id} onClick={() => go("vehicles")} className="text-left rounded-lg px-2 py-1.5" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", maxWidth: "100%", overflow: "hidden", transition: "background .15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#1A2129")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 0%", overflow: "hidden" }}><Kenteken value={v.kenteken} /></div>
                <div style={{ flexShrink: 0 }}><StatusLamp status={v.status} /></div>
              </button>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-1"><Eyebrow>Recente meldingen</Eyebrow><button onClick={() => go("workfloor")} style={{ color: "#3B82F6", fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>Naar werkvloer</button></div>
          {sortedReports.length === 0 ? <div style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }} className="py-6 text-center">Geen meldingen.</div> : (
            <div className="space-y-3 mt-2">
              {sortedReports.slice(0, 5).map((r) => (
                <button key={r.id} onClick={() => go("workfloor")} className="text-left rounded-lg px-2 py-1.5" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, width: "100%", maxWidth: "100%", overflow: "hidden" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1A2129")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <div style={{ minWidth: 0, flex: "1 1 0%", overflow: "hidden" }}>
                    <div style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{r.vehicle} — {r.omschrijving}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.chauffeur} · {r.datum}</div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ color: PRIO_META[r.prioriteit].color, border: `1px solid ${PRIO_META[r.prioriteit].color}55`, fontFamily: "Inter", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>{PRIO_META[r.prioriteit].label}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   GARAGE DASHBOARD — werkplaats-specifiek overzicht
--------------------------------------------------------------------- */

function GarageDashboard({ vehicles, reports, planning, parts, company, currentUser, onNavigate, onMove }) {
  const isMobile = useIsMobile();
  const go = (v) => onNavigate && onNavigate(v);

  const today = new Date(TODAY + "T00:00:00");
  const todayKey = TODAY;
  const todayItems = planning.filter((p) => p.datum === todayKey).sort((a, b) => a.tijd.localeCompare(b.tijd));

  // next 7 days planning
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const key = toLocalKey(d);
    week.push({ key, date: d, items: planning.filter((p) => p.datum === key) });
  }

  const inWorkshop = vehicles.filter((v) => v.status === "workshop");
  const openReports = reports.filter((r) => r.status !== "klaar");
  const newReports = reports.filter((r) => r.status === "nieuw"); // freshly submitted by drivers, not yet picked up
  const critical = openReports.filter((r) => r.prioriteit === "kritiek");
  const inProgress = reports.filter((r) => r.status === "in_behandeling");
  const waiting = reports.filter((r) => r.status === "wacht_onderdeel");
  const lowStock = parts.filter((p) => p.voorraad < p.min);

  // Next upcoming appointment today + total scheduled minutes
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Alleen een afspraak die nog moet komen; is alles voorbij, dan geen kaart
  // (anders staat om 17:30 "Volgende afspraak 08:00" prominent bovenaan).
  const nextAppt = todayItems.find((p) => { const [h, m] = p.tijd.split(":").map(Number); return h * 60 + m >= nowMinutes; }) || null;
  const scheduledMin = todayItems.reduce((a, p) => a + (Number(p.duur) || 0), 0);
  const workloadPct = Math.min(100, Math.round((scheduledMin / (8 * 60)) * 100)); // vs 8h day

  const dayNames = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  const firstName = currentUser?.naam?.split(" ")[0] || "";

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Wrench size={22} color="#3B82F6" /> Werkplaats</h1>
        <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Goedendag{firstName ? `, ${firstName}` : ""} — {company.name}</p>
      </div>

      {/* Nieuwe meldingen — verse doorschakeling vanuit chauffeurs */}
      {newReports.length > 0 && (
        <Card className="p-5" style={{ border: "1px solid #FF8A0055", background: "#FF8A000A" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: "#FF8A0022" }}><Bell size={14} color="#FF8A00" /></div>
              <span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>Nieuwe meldingen</span>
              <span className="rounded-full flex items-center justify-center" style={{ minWidth: 20, height: 20, padding: "0 6px", background: "#FF8A00", color: "#0A0E14", fontSize: 11, fontWeight: 700, fontFamily: "Inter" }}>{newReports.length}</span>
            </div>
            <button onClick={() => go("workfloor")} style={{ color: "#3B82F6", fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>Werkvloer →</button>
          </div>
          <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", marginBottom: 10 }}>Zojuist gemeld door chauffeurs — nog niet opgepakt.</div>
          <div className="space-y-2">
            {[...newReports].sort((a, b) => (PRIO_RANK[a.prioriteit] ?? 9) - (PRIO_RANK[b.prioriteit] ?? 9)).slice(0, 4).map((r) => (
              <div key={r.id} className="p-3 rounded-lg" style={{ background: "#12171F", border: `1px solid ${r.prioriteit === "kritiek" ? "#F0453F55" : "#232B38"}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div style={{ minWidth: 0, flex: "1 1 0%" }}>
                    <div className="flex items-center gap-2 mb-1"><Kenteken value={r.vehicle} />
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: PRIO_META[r.prioriteit].color, border: `1px solid ${PRIO_META[r.prioriteit].color}55`, fontWeight: 600, flexShrink: 0 }}>{PRIO_META[r.prioriteit].label}</span>
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.omschrijving}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 11, color: "#B4BCC9" }}>{r.chauffeur} · {r.datum}{r.mediaCount ? ` · ${r.mediaCount} bijlage(n)` : ""}</div>
                  </div>
                </div>
                {onMove && (
                  <button onClick={() => onMove(r.id, "in_behandeling")} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs" style={{ background: "#3B82F6", color: "#FFFFFF", fontFamily: "Inter", fontWeight: 600 }}>
                    <Wrench size={12} /> In behandeling nemen
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Next appointment hero */}
      {nextAppt && (
        <button onClick={() => go("planning")} className="text-left" style={{ width: "100%" }}>
          <Card className="p-5" style={{ background: "linear-gradient(135deg, #3B82F622, #12171F)", border: "1px solid #3B82F544" }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 700, color: "#3B82F6", letterSpacing: 1, textTransform: "uppercase" }}>Volgende afspraak</span>
              <span style={{ fontFamily: "JetBrains Mono", fontSize: 20, fontWeight: 700, color: "#3B82F6" }}>{nextAppt.tijd}</span>
            </div>
            <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
              <Kenteken value={nextAppt.vehicle} />
              <div style={{ minWidth: 0, flex: "1 1 0%" }}>
                <div style={{ fontFamily: "Inter", fontSize: 15, fontWeight: 600, color: "#E7ECF3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nextAppt.taak}</div>
                <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>{nextAppt.duur} min · Monteur: {nextAppt.monteur}</div>
              </div>
            </div>
          </Card>
        </button>
      )}

      {/* Today workload bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Eyebrow>Werkdruk vandaag</Eyebrow>
          <span style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>{Math.floor(scheduledMin / 60)}u {scheduledMin % 60}m ingepland · {todayItems.length} afspra{todayItems.length === 1 ? "ak" : "ken"}</span>
        </div>
        <div className="h-2.5 rounded-full" style={{ background: "#1A2129", overflow: "hidden" }}>
          <div className="h-full rounded-full" style={{ width: `${workloadPct}%`, background: workloadPct > 90 ? "#F0453F" : workloadPct > 60 ? "#FF8A00" : "#34D399", transition: "width .3s" }} />
        </div>
        <div style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0", marginTop: 4 }}>{workloadPct >= 100 ? "Volgeboekt" : `${workloadPct}% van een werkdag (8u)`}</div>
      </Card>

      {/* KPI strip */}
      <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr) minmax(0, 1fr)" : "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <button onClick={() => go("workfloor")} className="text-left">
          <Card className="p-4 h-full">
            <div className="flex items-center justify-between"><Eyebrow>Kritiek open</Eyebrow><AlertTriangle size={15} color="#F0453F" /></div>
            <div style={{ fontFamily: "Oswald", fontSize: 30, fontWeight: 600, color: critical.length ? "#F0453F" : "#E7ECF3" }}>{critical.length}</div>
          </Card>
        </button>
        <button onClick={() => go("workfloor")} className="text-left">
          <Card className="p-4 h-full">
            <div className="flex items-center justify-between"><Eyebrow>In behandeling</Eyebrow><Wrench size={15} color="#FF8A00" /></div>
            <div style={{ fontFamily: "Oswald", fontSize: 30, fontWeight: 600, color: "#E7ECF3" }}>{inProgress.length}</div>
          </Card>
        </button>
        <button onClick={() => go("workfloor")} className="text-left">
          <Card className="p-4 h-full">
            <div className="flex items-center justify-between"><Eyebrow>Wacht op onderdeel</Eyebrow><Package size={15} color="#3B82F6" /></div>
            <div style={{ fontFamily: "Oswald", fontSize: 30, fontWeight: 600, color: "#E7ECF3" }}>{waiting.length}</div>
          </Card>
        </button>
        <button onClick={() => go("parts")} className="text-left">
          <Card className="p-4 h-full">
            <div className="flex items-center justify-between"><Eyebrow>Lage voorraad</Eyebrow><Package size={15} color="#B4BCC9" /></div>
            <div style={{ fontFamily: "Oswald", fontSize: 30, fontWeight: 600, color: lowStock.length ? "#FF8A00" : "#E7ECF3" }}>{lowStock.length}</div>
          </Card>
        </button>
      </div>

      {/* Today's schedule — the workshop's main focus */}
      <Card className="p-5">
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <Calendar size={16} color="#3B82F6" style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>Planning vandaag</div>
              <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9", textTransform: "capitalize" }}>{today.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
            </div>
          </div>
          <button onClick={() => go("planning")} style={{ color: "#3B82F6", fontFamily: "Inter", fontSize: 12, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>Volledige planning →</button>
        </div>
        {todayItems.length === 0 ? (
          <div className="flex items-center gap-2 py-3" style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }}><CheckCircle2 size={15} color="#34D399" /> Geen afspraken vandaag.</div>
        ) : (
          <div className="space-y-2">
            {todayItems.map((p) => (
              <button key={p.id} onClick={() => go("planning")} className="w-full flex items-stretch gap-3 text-left rounded-lg overflow-hidden" style={{ background: "#1A2129", border: "1px solid #232B38" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3B82F6")} onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#232B38")}>
                <div className="flex flex-col items-center justify-center px-3 py-2.5" style={{ background: "#3B82F618", minWidth: 62, flexShrink: 0 }}>
                  <span style={{ fontFamily: "JetBrains Mono", fontSize: 14, color: "#3B82F6", fontWeight: 700 }}>{p.tijd}</span>
                  <span style={{ fontFamily: "Inter", fontSize: 10, color: "#B4BCC9" }}>{p.duur} min</span>
                </div>
                <div className="flex items-center gap-3 py-2.5 pr-3" style={{ minWidth: 0, flex: 1 }}>
                  <Kenteken value={p.vehicle} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.taak}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 11, color: "#B4BCC9" }}>Monteur: {p.monteur}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Week strip */}
      <Card className="p-5">
        <Eyebrow>Komende 7 dagen</Eyebrow>
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
          {week.map((w) => {
            const isToday = w.key === todayKey;
            return (
              <button key={w.key} onClick={() => go("planning")} className="rounded-lg py-2 flex flex-col items-center" style={{ background: isToday ? "#3B82F6" : w.items.length ? "#3B82F618" : "#1A2129", border: `1px solid ${isToday ? "#3B82F6" : w.items.length ? "#3B82F655" : "#232B38"}` }}>
                <span style={{ fontFamily: "Inter", fontSize: 10, color: isToday ? "#FFFFFF" : "#B4BCC9", fontWeight: 600 }}>{dayNames[w.date.getDay()]}</span>
                <span style={{ fontFamily: "Oswald", fontSize: 18, fontWeight: 600, color: isToday ? "#FFFFFF" : "#E7ECF3" }}>{w.date.getDate()}</span>
                <span style={{ fontFamily: "Inter", fontSize: 10, color: isToday ? "#FFFFFF" : "#3B82F6", fontWeight: 700, minHeight: 14 }}>{w.items.length ? `${w.items.length}×` : ""}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))" }}>
        {/* In de werkplaats */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-1"><Eyebrow>In de werkplaats ({inWorkshop.length})</Eyebrow><button onClick={() => go("vehicles")} style={{ color: "#3B82F6", fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>Vloot</button></div>
          {inWorkshop.length === 0 ? (
            <div style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }} className="py-3">Geen voertuigen in de werkplaats.</div>
          ) : (
            <div className="space-y-2 mt-2">
              {inWorkshop.map((v) => (
                <button key={v.id} onClick={() => go("inspection")} className="text-left rounded-lg px-2 py-1.5" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", maxWidth: "100%", overflow: "hidden" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1A2129")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 0%", overflow: "hidden" }}><Kenteken value={v.kenteken} /><span style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{v.merk}</span></div>
                  <div style={{ flexShrink: 0 }}><StatusLamp status={v.status} /></div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Werk-wachtrij */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-1"><Eyebrow>Openstaand werk ({openReports.length})</Eyebrow><button onClick={() => go("workfloor")} style={{ color: "#3B82F6", fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>Werkvloer</button></div>
          {openReports.length === 0 ? (
            <div className="flex items-center gap-2 py-3" style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }}><CheckCircle2 size={15} color="#34D399" /> Niks openstaand. Goed werk!</div>
          ) : (
            <div className="space-y-2 mt-2">
              {openReports.sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, 5).map((r) => (
                <button key={r.id} onClick={() => go("workfloor")} className="text-left rounded-lg px-2 py-1.5" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, width: "100%", maxWidth: "100%", overflow: "hidden" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1A2129")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <div style={{ minWidth: 0, flex: "1 1 0%", overflow: "hidden" }}>
                    <div style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{r.vehicle} — {r.omschrijving}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 11, color: "#B4BCC9" }}>{KANBAN_COLS.find((c) => c.id === r.status)?.label}</div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ color: PRIO_META[r.prioriteit].color, border: `1px solid ${PRIO_META[r.prioriteit].color}55`, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>{PRIO_META[r.prioriteit].label}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Snelacties */}
      <Card className="p-5">
        <Eyebrow>Snel naar</Eyebrow>
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr) minmax(0, 1fr)" : "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {[
            { v: "planning", label: "Planning", icon: Calendar },
            { v: "workfloor", label: "Werkvloer", icon: KanbanSquare },
            { v: "parts", label: "Voorraad", icon: Package },
            { v: "ai", label: "AI Assistent", icon: Sparkles },
          ].map((a) => (
            <button key={a.v} onClick={() => go(a.v)} className="flex items-center gap-2 px-3 py-3 rounded-lg" style={{ background: "#1A2129", border: "1px solid #232B38" }}>
              <a.icon size={16} color="#3B82F6" /><span style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", fontWeight: 500 }}>{a.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ComplianceBadge({ vehicle, showOk = true }) {
  const status = vehicleWorstCompliance(vehicle);
  if (status === "ok" && !showOk) return null;
  const meta = COMPLIANCE_META[status];
  const label = status === "verlopen" ? "Keuring verlopen" : status === "binnenkort" ? "Keuring verloopt" : status === "onbekend" ? "Keuring onbekend" : "Keuringen ok";
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded" style={{ color: meta.color, border: `1px solid ${meta.color}55`, fontWeight: 600, whiteSpace: "nowrap" }}>
      <ShieldCheck size={11} /> {label}
    </span>
  );
}

function VehiclesView({ vehicles, onAdd, onSelect, filterType = null, title = "Vrachtwagens" }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kenteken: "", merk: "", type: filterType || "Truck", bouwjaar: "", km: "", apkTot: "" });
  const [aiLoading, setAiLoading] = useState(false);
  const [rdwLoading, setRdwLoading] = useState(false);
  const [aiMsg, setAiMsg] = useState("");

  const lookupRdwPlate = async () => {
    const plate = form.kenteken.trim();
    if (!plate) { setAiMsg("Vul eerst een kenteken in."); return; }
    setRdwLoading(true); setAiMsg("");
    try {
      const d = await lookupRDW(plate);
      setForm((f) => ({ ...f, merk: d.merk || f.merk, type: d.type, bouwjaar: d.bouwjaar ? String(d.bouwjaar) : f.bouwjaar, apkTot: d.apkTot || f.apkTot }));
      setAiMsg(d.apkTot ? `✓ RDW: ${d.merk || "gevonden"} · APK tot ${d.apkTot}` : `✓ RDW-gegevens ingevuld — controleer even.`);
    } catch (err) {
      setAiMsg(`RDW: ${err.message || "kon niet ophalen"}. Probeer 'AI invullen' of vul handmatig in.`);
    } finally {
      setRdwLoading(false);
    }
  };

  const lookupPlate = async () => {
    const plate = form.kenteken.trim().toUpperCase();
    if (!plate) { setAiMsg("Vul eerst een kenteken in."); return; }
    setAiLoading(true); setAiMsg("");
    try {
      const prompt = `Je bent een RDW-voertuigassistent. Geef voor het Nederlandse kenteken "${plate}" je beste inschatting van de voertuiggegevens. Antwoord UITSLUITEND met JSON, geen uitleg, in dit formaat:
{"merk":"<merk en model>","type":"Truck of Bestelwagen","bouwjaar":<jaartal>}
Als je het niet zeker weet, geef dan een plausibele inschatting op basis van het kentekenformaat. Geen extra tekst.`;
      const out = await callAI({ text: prompt, maxTokens: 300 });
      const parsed = parseAIJson(out);
      setForm((f) => ({ ...f, merk: parsed.merk || f.merk, type: parsed.type === "Bestelwagen" ? "Bestelwagen" : "Truck", bouwjaar: parsed.bouwjaar ? String(parsed.bouwjaar) : f.bouwjaar }));
      setAiMsg("✓ Gegevens ingevuld door AI — controleer en pas zo nodig aan.");
    } catch (err) {
      setAiMsg(`Kon gegevens niet ophalen (${err.message || "fout"}). Vul handmatig in.`);
    } finally {
      setAiLoading(false);
    }
  };

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const submit = () => {
    if (!form.kenteken || !form.merk) return;
    onAdd({ id: "v" + Date.now(), kenteken: form.kenteken.toUpperCase(), merk: form.merk, type: form.type, bouwjaar: Number(form.bouwjaar) || new Date().getFullYear(), km: Number(form.km) || 0, status: "operational", health: 100, driver: "—", apkTot: form.apkTot || "", tachoTot: "", tachoPlicht: form.type === "Truck", verzekeringTot: "" });
    setForm({ kenteken: "", merk: "", type: filterType || "Truck", bouwjaar: "", km: "", apkTot: "" }); setAiMsg(""); setOpen(false);
  };

  const q = query.trim().toLowerCase();
  const shown = vehicles.filter((v) => {
    if (filterType && v.type !== filterType) return false;
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (!q) return true;
    return [v.kenteken, v.merk, v.type, v.driver].filter(Boolean).some((s) => String(s).toLowerCase().includes(q));
  });
  const totalForType = filterType ? vehicles.filter((v) => v.type === filterType).length : vehicles.length;
  // Passend meervoud voor de teller onder de titel.
  const noun = filterType === "Bakwagen" ? "bakwagen(s)" : filterType === "Bestelwagen" ? "bestelwagen(s)" : filterType ? `${filterType.toLowerCase()}(s)` : "voertuig(en)";

  const exportCsv = () => {
    const label = { operational: "Operationeel", attention: "Let op", workshop: "In werkplaats" };
    const rows = shown.map((v) => [v.kenteken, v.merk, v.type, v.bouwjaar, v.km, label[v.status] || v.status, v.driver || "", v.apkTot || "", v.verzekeringTot || ""]);
    downloadCSV("voertuigen.csv", ["Kenteken", "Merk/model", "Type", "Bouwjaar", "KM-stand", "Status", "Chauffeur", "APK tot", "Verzekering tot"], rows);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2">{filterType === "Bakwagen" ? <IconBoxTruck size={24} color="#3B82F6" /> : filterType === "Bestelwagen" ? <IconVan size={24} color="#3B82F6" /> : filterType === "Trailer" ? <IconTrailer size={24} color="#3B82F6" /> : <IconTruckTrailer size={24} color="#3B82F6" />} {title}</h1><p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>{totalForType} {noun}{shown.length !== totalForType ? ` · ${shown.length} getoond` : ""}. Tik voor details.</p></div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon={Download} onClick={exportCsv} disabled={shown.length === 0}>CSV</Button>
          <Button icon={Plus} onClick={() => setOpen(true)}>Voertuig toevoegen</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative" style={{ flex: 1, minWidth: 180 }}>
          <Search size={15} color="#7B8698" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input className="tg-input" style={{ paddingLeft: 34 }} placeholder="Zoek op kenteken, merk of chauffeur…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[{ id: "all", label: "Alle" }, { id: "operational", label: "Operationeel" }, { id: "attention", label: "Let op" }, { id: "workshop", label: "Werkplaats" }].map((f) => (
            <Chip key={f.id} active={statusFilter === f.id} onClick={() => setStatusFilter(f.id)}>{f.label}</Chip>
          ))}
        </div>
      </div>
      {open && (
        <Card className="p-5">
          {/* Kenteken + AI lookup */}
          <div>
            <FieldLabel>Kenteken</FieldLabel>
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              <input placeholder="Bv. 84-BSX-2" value={form.kenteken} onChange={(e) => setForm({ ...form, kenteken: e.target.value })} className="tg-input" style={{ flex: isMobile ? "1 1 100%" : 1, minWidth: 0 }} />
              <Button icon={Search} onClick={lookupRdwPlate} disabled={rdwLoading || aiLoading} style={{ flexShrink: 0 }}>{rdwLoading ? "Zoeken..." : "RDW ophalen"}</Button>
              <Button variant="ghost" icon={Sparkles} onClick={lookupPlate} disabled={aiLoading || rdwLoading} style={{ flexShrink: 0 }}>{aiLoading ? "Zoeken..." : "AI"}</Button>
            </div>
            <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0", marginTop: 5 }}>Tik het kenteken in en haal merk, type, bouwjaar én APK-datum automatisch op bij de RDW.</div>
            {aiMsg && <div style={{ fontFamily: "Inter", fontSize: 12, color: aiMsg.startsWith("✓") ? "#34D399" : "#FF8A00", marginTop: 6 }}>{aiMsg}</div>}
          </div>

          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <div><FieldLabel>Merk/model</FieldLabel><input placeholder="Merk/model" value={form.merk} onChange={(e) => setForm({ ...form, merk: e.target.value })} className="tg-input" /></div>
            <div><FieldLabel>Type</FieldLabel><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="tg-input"><option>Truck</option><option>Trekker</option><option>Bakwagen</option><option>Bestelwagen</option></select></div>
            <div><FieldLabel>Bouwjaar</FieldLabel><input placeholder="Bouwjaar" value={form.bouwjaar} onChange={(e) => setForm({ ...form, bouwjaar: e.target.value })} className="tg-input" /></div>
            <div><FieldLabel>KM-stand</FieldLabel><input placeholder="KM-stand" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} className="tg-input" /></div>
            <div><FieldLabel>APK geldig tot</FieldLabel><input type="date" value={form.apkTot} onChange={(e) => setForm({ ...form, apkTot: e.target.value })} className="tg-input" /></div>
          </div>
          <div className="flex gap-2 mt-4"><Button onClick={submit}>Opslaan</Button><Button variant="ghost" onClick={() => { setOpen(false); setAiMsg(""); }}>Annuleren</Button></div>
        </Card>
      )}
      {vehicles.length === 0 ? <EmptyState icon={Truck} text='Nog geen voertuigen.' /> : shown.length === 0 ? <EmptyState icon={Search} text='Geen voertuigen gevonden voor deze zoekopdracht.' /> : isMobile ? (
        <div className="space-y-3">
          {shown.map((v) => (
            <button key={v.id} onClick={() => onSelect(v.id)} className="text-left" style={{ width: "100%" }}>
              <Card className="p-4" style={{ transition: "border-color .15s" }}>
                <div className="flex items-center justify-between mb-2">
                  <Kenteken value={v.kenteken} />
                  <StatusLamp status={v.status} />
                </div>
                <div style={{ fontFamily: "Inter", color: "#E7ECF3", fontWeight: 600, fontSize: 14 }}>{v.merk}</div>
                <div style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 12.5 }} className="mt-1">{v.type} · {v.bouwjaar}</div>
                <div className="mt-2"><ComplianceBadge vehicle={v} /></div>
                <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: "1px solid #1A2129" }}>
                  <span style={{ fontFamily: "JetBrains Mono", color: "#E7ECF3", fontSize: 13 }}>{v.km.toLocaleString("nl-NL")} km</span>
                  <span style={{ fontFamily: "Inter", color: "#3B82F6", fontSize: 12.5, fontWeight: 600 }}>Details ›</span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "Inter", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: "1px solid #232B38" }}>{["Kenteken", "Merk/model", "Type", "KM-stand", "Compliance", "Status"].map((h) => <th key={h} className="text-left px-4 py-3" style={{ color: "#B4BCC9", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>
              {shown.map((v) => (
                <tr key={v.id} onClick={() => onSelect(v.id)} style={{ borderBottom: "1px solid #1A2129", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1A2129")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <td className="px-4 py-3"><Kenteken value={v.kenteken} /></td>
                  <td className="px-4 py-3" style={{ color: "#E7ECF3" }}>{v.merk}</td>
                  <td className="px-4 py-3" style={{ color: "#B4BCC9" }}>{v.type}</td>
                  <td className="px-4 py-3" style={{ color: "#E7ECF3", fontFamily: "JetBrains Mono" }}>{v.km.toLocaleString("nl-NL")}</td>
                  <td className="px-4 py-3"><ComplianceBadge vehicle={v} /></td>
                  <td className="px-4 py-3"><StatusLamp status={v.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function VehicleDetailView({ vehicle, reports, planning, costs = [], checks = [], onAddCost, onDeleteCost, onUpdate, onAddPlanning, onBack, onGoInspection, isAdmin, onDelete, aiReady, inspectionOn = true, companyId = null, live = false }) {
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const [showInsp, setShowInsp] = useState(false);
  const [form, setForm] = useState(vehicle);
  const [note, setNote] = useState(vehicle.notitie || "");
  const docRef = useRef(null);
  const [docCat, setDocCat] = useState("kentekenbewijs");
  const [docBusy, setDocBusy] = useState(false);
  const [docErr, setDocErr] = useState("");
  const [confirmDoc, setConfirmDoc] = useState(null);
  const [confirmCost, setConfirmCost] = useState(null);
  const documenten = Array.isArray(vehicle.documenten) ? vehicle.documenten : [];
  const [sched, setSched] = useState({ open: false, datum: TODAY, tijd: "09:00", duur: "60", taak: "", monteur: "" });
  const [toast, setToast] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [costForm, setCostForm] = useState({ open: false, categorie: "onderhoud", bedrag: "", datum: TODAY, omschrijving: "" });
  const [predLoading, setPredLoading] = useState(false);
  const [predError, setPredError] = useState("");
  const [prediction, setPrediction] = useState(null); // { items: [{taak, urgentie, reden, binnen}] }

  const runPrediction = async () => {
    setPredLoading(true); setPredError(""); setPrediction(null);
    try {
      const ctx = {
        kenteken: vehicle.kenteken, merk: vehicle.merk, type: vehicle.type, bouwjaar: vehicle.bouwjaar,
        km: vehicle.km, health: vehicle.health,
        meldingen: vReports.map((r) => ({ omschrijving: r.omschrijving, prioriteit: r.prioriteit, datum: r.datum, status: r.status })),
        gepland: vPlanning.map((p) => ({ taak: p.taak, datum: p.datum })),
        vandaag: TODAY,
      };
      const prompt = `Je bent een ervaren truck-monteur die voorspellend onderhoud inschat. Op basis van onderstaande voertuigdata, geef 3 tot 5 concrete onderhoudspunten die binnenkort aandacht nodig hebben. Denk aan kilometerstand, leeftijd, gezondheidsscore en terugkerende meldingen.

Antwoord UITSLUITEND met JSON, geen uitleg eromheen:
{"items":[{"taak":"<korte taak>","urgentie":"hoog|gemiddeld|laag","binnen":"<bv. 2 weken / 5.000 km>","reden":"<1 zin waarom>"}]}

VOERTUIGDATA:
${JSON.stringify(ctx)}`;
      const out = await callAI({ text: prompt, maxTokens: 700 });
      const parsed = parseAIJson(out);
      setPrediction(parsed.items ? parsed : { items: Array.isArray(parsed) ? parsed : [] });
    } catch (err) {
      setPredError(`Kon voorspelling niet ophalen (${err.message || "fout"}).`);
    } finally {
      setPredLoading(false);
    }
  };

  useEffect(() => { setForm(vehicle); setNote(vehicle.notitie || ""); }, [vehicle.id]);

  const saveNote = () => { onUpdate({ ...vehicle, notitie: note }); setToast("Notitie opgeslagen."); };
  const noteChanged = (note || "") !== (vehicle.notitie || "");

  const DOC_CATS = [
    { id: "kentekenbewijs", label: "Kentekenbewijs" },
    { id: "verzekering", label: "Verzekering" },
    { id: "apk", label: "APK-rapport" },
    { id: "overig", label: "Overig" },
  ];
  const docCatLabel = (id) => (DOC_CATS.find((c) => c.id === id) || { label: "Overig" }).label;
  const uploadDoc = async (files) => {
    const file = files && files[0];
    if (!file) return;
    if (!live) { setDocErr("Documenten uploaden werkt in de live-app (met opslag). In de demo is dit uitgeschakeld."); return; }
    if (file.size > 15 * 1024 * 1024) { setDocErr("Bestand is te groot (max 15 MB)."); return; }
    setDocBusy(true); setDocErr("");
    try {
      const meta = await uploadVehicleDocument(companyId, vehicle.id, file, { categorie: docCat });
      onUpdate({ ...vehicle, documenten: [meta, ...documenten] });
      setToast("Document toegevoegd.");
    } catch (e) {
      setDocErr("Uploaden mislukt: " + (e?.message || "onbekende fout"));
    } finally {
      setDocBusy(false);
      if (docRef.current) docRef.current.value = "";
    }
  };
  const openDoc = async (doc) => {
    try {
      const url = await signedDocUrl(doc.path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setDocErr("Kon document niet openen.");
    } catch (e) { setDocErr("Kon document niet openen."); }
  };
  const removeDoc = async (doc) => {
    try { await deleteVehicleDocument(doc.path); } catch (e) { /* toch uit lijst halen */ }
    onUpdate({ ...vehicle, documenten: documenten.filter((d) => d.path !== doc.path) });
    setToast("Document verwijderd.");
  };

  const vReports = reports.filter((r) => r.vehicle === vehicle.kenteken).sort((a, b) => (a.datum < b.datum ? 1 : -1));
  const vPlanning = planning.filter((p) => p.vehicle === vehicle.kenteken).sort((a, b) => (a.datum + a.tijd < b.datum + b.tijd ? 1 : -1));

  const saveEdit = () => {
    // Alleen de velden die het formulier echt bewerkt op de NIEUWSTE voertuigdata
    // zetten. 'form' is een momentopname van het moment van openen; het hele
    // object terugschrijven zou intussen toegevoegde documenten, inspecties of
    // notities terugdraaien (bv. na een upload of realtime-refresh).
    onUpdate({
      ...vehicle,
      merk: form.merk, type: form.type, driver: form.driver, status: form.status,
      apkTot: form.apkTot || "", verzekeringTot: form.verzekeringTot || "",
      tachoPlicht: !!form.tachoPlicht, tachoTot: form.tachoPlicht ? (form.tachoTot || "") : "",
      km: Number(form.km) || 0,
      bouwjaar: Number(form.bouwjaar) || vehicle.bouwjaar,
    });
    setEditing(false);
    setToast("Voertuig bijgewerkt.");
  };

  const submitSchedule = (fromReport) => {
    const taak = fromReport ? fromReport.omschrijving : sched.taak;
    if (!taak) return;
    onAddPlanning({ id: "pl" + Date.now(), vehicle: vehicle.kenteken, datum: sched.datum, tijd: sched.tijd, duur: Number(sched.duur) || 60, taak, monteur: sched.monteur || "—", reportId: fromReport ? fromReport.id : null });
    setSched({ open: false, datum: TODAY, tijd: "09:00", duur: "60", taak: "", monteur: "" });
    setToast("Ingepland.");
  };

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
      <button onClick={onBack} className="flex items-center gap-1.5" style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13, fontWeight: 600 }}><ChevronLeft size={16} /> Terug naar voertuigen</button>

      <div className="tg-cols">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Kenteken value={vehicle.kenteken} />
            <div>
              <div style={{ fontFamily: "Oswald", fontSize: 22, fontWeight: 600, color: "#E7ECF3" }}>{vehicle.merk}</div>
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#B4BCC9" }}>{vehicle.type} · {vehicle.bouwjaar}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusLamp status={vehicle.status} />
            {!editing && <Button small variant="ghost" onClick={() => setEditing(true)}>Bewerken</Button>}
          </div>
        </div>

        {!editing ? (
          <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr) minmax(0,1fr)" : "repeat(auto-fit, minmax(130px, 1fr))" }}>
            <div><Eyebrow>KM-stand</Eyebrow><div style={{ fontFamily: "JetBrains Mono", fontSize: 16, color: "#E7ECF3", fontWeight: 700 }}>{vehicle.km.toLocaleString("nl-NL")}</div></div>
            <div><Eyebrow>Chauffeur</Eyebrow><div style={{ fontFamily: "Inter", fontSize: 14, color: "#E7ECF3" }}>{vehicle.driver}</div></div>
            <div><Eyebrow>Gezondheid</Eyebrow><div style={{ fontFamily: "Oswald", fontSize: 18, fontWeight: 600, color: vehicle.health > 75 ? "#34D399" : vehicle.health > 50 ? "#FF8A00" : "#F0453F" }}>{vehicle.health}%</div></div>
            <div><Eyebrow>Status</Eyebrow><div style={{ fontFamily: "Inter", fontSize: 14, color: STATUS_META[vehicle.status].color }}>{STATUS_META[vehicle.status].label}</div></div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))" }}>
              <div><Eyebrow>Merk/model</Eyebrow><input className="tg-input" style={{ width: "100%" }} value={form.merk} onChange={(e) => setForm({ ...form, merk: e.target.value })} /></div>
              <div><Eyebrow>Type</Eyebrow><select className="tg-input" style={{ width: "100%" }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Truck</option><option>Trekker</option><option>Bakwagen</option><option>Bestelwagen</option></select></div>
              <div><Eyebrow>Bouwjaar</Eyebrow><input className="tg-input" style={{ width: "100%" }} value={form.bouwjaar} onChange={(e) => setForm({ ...form, bouwjaar: e.target.value })} /></div>
              <div><Eyebrow>KM-stand</Eyebrow><input className="tg-input" style={{ width: "100%" }} value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} /></div>
              <div><Eyebrow>Chauffeur</Eyebrow><input className="tg-input" style={{ width: "100%" }} value={form.driver} onChange={(e) => setForm({ ...form, driver: e.target.value })} /></div>
              <div><Eyebrow>Status</Eyebrow><select className="tg-input" style={{ width: "100%" }} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="operational">Operationeel</option><option value="attention">Let op</option><option value="workshop">In werkplaats</option></select></div>
            </div>
            <div style={{ borderTop: "1px solid #232B38", paddingTop: 12 }}>
              <Eyebrow>Compliance & keuringen</Eyebrow>
              <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))" }}>
                <div><FieldLabel>APK geldig tot</FieldLabel><input type="date" className="tg-input" style={{ width: "100%", minWidth: 0 }} value={form.apkTot || ""} onChange={(e) => setForm({ ...form, apkTot: e.target.value })} /></div>
                <div><FieldLabel>Verzekering tot</FieldLabel><input type="date" className="tg-input" style={{ width: "100%", minWidth: 0 }} value={form.verzekeringTot || ""} onChange={(e) => setForm({ ...form, verzekeringTot: e.target.value })} /></div>
                <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}>
                  <label className="flex items-center gap-2" style={{ cursor: "pointer", padding: "4px 0" }}>
                    <input type="checkbox" checked={!!form.tachoPlicht} onChange={(e) => setForm({ ...form, tachoPlicht: e.target.checked })} style={{ width: 16, height: 16, accentColor: "#3B82F6" }} />
                    <span style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3" }}>Tachograafplichtig (SMT2 — o.a. internationaal &gt; 2.500 kg)</span>
                  </label>
                </div>
                {form.tachoPlicht && <div><FieldLabel>Tachograaf keuring tot</FieldLabel><input type="date" className="tg-input" style={{ width: "100%", minWidth: 0 }} value={form.tachoTot || ""} onChange={(e) => setForm({ ...form, tachoTot: e.target.value })} /></div>}
              </div>
            </div>
            <div className="flex gap-2"><Button onClick={saveEdit}>Opslaan</Button><Button variant="ghost" onClick={() => { setForm(vehicle); setEditing(false); }}>Annuleren</Button></div>
          </div>
        )}
      </Card>

      {/* Notities */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: "#3B82F618" }}><FileText size={15} color="#3B82F6" /></div>
            <span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>Notities</span>
          </div>
          {noteChanged && <Button small onClick={saveNote}>Opslaan</Button>}
        </div>
        <textarea className="tg-input" rows={3} style={{ width: "100%", resize: "vertical" }} placeholder="Bv. bijzonderheden, afspraken met de chauffeur, terugkerende klachten…" value={note} onChange={(e) => setNote(e.target.value)} />
      </Card>

      {/* Documenten */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: "#A855F718" }}><FileText size={15} color="#A855F7" /></div>
            <span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>Documenten</span>
            {documenten.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#A855F718", color: "#C99BFF", fontWeight: 600 }}>{documenten.length}</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="tg-input" style={{ width: "auto", padding: "6px 8px", fontSize: 12.5 }} value={docCat} onChange={(e) => setDocCat(e.target.value)}>
              {DOC_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <input ref={docRef} type="file" accept=".pdf,image/*" hidden onChange={(e) => uploadDoc(e.target.files)} />
            <Button small icon={Plus} onClick={() => docRef.current?.click()} disabled={docBusy}>{docBusy ? "Uploaden…" : "Uploaden"}</Button>
          </div>
        </div>
        {docErr && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#FF8A00", marginBottom: 8 }}>{docErr}</div>}
        {documenten.length === 0 ? (
          <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0" }}>Nog geen documenten. Voeg bijvoorbeeld het kentekenbewijs, de verzekeringspolis of het APK-rapport toe (PDF of foto, max 15 MB).</div>
        ) : (
          <div className="space-y-2">
            {documenten.map((d) => (
              <div key={d.path} className="flex items-center justify-between gap-2 p-3 rounded-lg" style={{ background: "#161C25", border: "1px solid #232B38" }}>
                <button onClick={() => openDoc(d)} className="flex items-center gap-2.5 text-left" style={{ minWidth: 0, flex: "1 1 0%" }}>
                  <FileText size={16} color="#A855F7" style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "Inter", fontSize: 13, fontWeight: 600, color: "#E7ECF3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0" }}>{docCatLabel(d.categorie)}{d.uploadedAt ? ` · ${new Date(d.uploadedAt).toLocaleDateString("nl-NL")}` : ""}</div>
                  </div>
                </button>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  {confirmDoc === d.path ? (
                    <span className="flex items-center gap-2"><button onClick={() => { removeDoc(d); setConfirmDoc(null); }} className="text-xs" style={{ color: "#F0453F", fontWeight: 700 }}>Bevestig</button><button onClick={() => setConfirmDoc(null)} className="text-xs" style={{ color: "#B4BCC9" }}>Nee</button></span>
                  ) : (
                    <>
                      <button onClick={() => openDoc(d)} aria-label="Document openen" title="Openen" style={{ color: "#3B82F6" }}><Download size={15} /></button>
                      {/* Verwijderen is beheerder-only (de storage-policy dwingt dat ook af). */}
                      {isAdmin && <button onClick={() => setConfirmDoc(d.path)} aria-label="Document verwijderen" title="Verwijderen" style={{ color: "#F0453F" }}><Trash2 size={15} /></button>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Compliance & keuringen */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: "#3B82F618" }}><ShieldCheck size={15} color="#3B82F6" /></div>
          <span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>Compliance & keuringen</span>
        </div>
        <div className="space-y-2">
          {vehicleComplianceItems(vehicle).map((it) => {
            const meta = COMPLIANCE_META[it.status];
            return (
              <div key={it.key} className="flex items-center justify-between gap-2 p-3 rounded-lg" style={{ background: "#161C25", border: `1px solid #232B38`, borderLeft: `3px solid ${meta.color}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, color: "#E7ECF3" }}>{it.label}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0" }}>
                    {it.datum ? new Date(it.datum).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "Geen datum ingesteld"}
                    {it.dagen !== null && it.status !== "onbekend" && (it.dagen < 0 ? ` · ${Math.abs(it.dagen)} dagen geleden` : ` · over ${it.dagen} dagen`)}
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded" style={{ color: meta.color, border: `1px solid ${meta.color}55`, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>{meta.label}</span>
              </div>
            );
          })}
        </div>
        {/* Laatste dagelijkse voertuigcheck van een chauffeur (DVIR). */}
        {checks.length > 0 && (() => {
          const last = checks[0];
          const fouten = (last.items || []).filter((it) => it && it.ok === false);
          const okAll = fouten.length === 0;
          return (
            <div className="p-3 rounded-lg mt-3" style={{ background: "#161C25", border: `1px solid ${okAll ? "#34D39944" : "#FF8A0044"}` }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span style={{ fontFamily: "Inter", fontSize: 12.5, fontWeight: 600, color: "#E7ECF3" }}>Laatste voertuigcheck</span>
                <span style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0" }}>{last.datum}{last.tijd ? ` · ${last.tijd}` : ""} · {last.chauffeur}</span>
              </div>
              <div style={{ fontFamily: "Inter", fontSize: 12, color: okAll ? "#34D399" : "#FF8A00", marginTop: 3 }}>
                {okAll ? "Alles in orde" : `${fouten.length} punt(en) niet in orde: ${fouten.map((f) => f.p + (f.note ? ` (${f.note})` : "")).join(", ")}`}
              </div>
            </div>
          );
        })()}
        {vehicle.rdwSync && (
          <div className="flex items-center gap-1.5" style={{ fontFamily: "Inter", fontSize: 11, color: "#34D399", marginTop: 8 }}>
            <ShieldCheck size={12} /> APK-datum automatisch gecontroleerd bij de RDW op {vehicle.rdwSync}.
          </div>
        )}
        <div style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0", marginTop: 8 }}>Tip: sinds 1 juli 2026 is de slimme tachograaf (SMT2) verplicht voor voertuigen vanaf 2.500 kg bij internationaal vervoer. Bewerk het voertuig om datums bij te werken.</div>
      </Card>

      {/* Kosten & TCO */}
      {(() => {
        const totaal = costs.reduce((a, c) => a + (Number(c.bedrag) || 0), 0);
        const perKm = vehicle.km > 0 ? totaal / vehicle.km : 0;
        const catMeta = { onderhoud: "#3B82F6", brandstof: "#FF8A00", reparatie: "#F0453F", verzekering: "#22D3B0", belasting: "#A855F7", overig: "#98A1B0" };
        const byCat = costs.reduce((m, c) => { m[c.categorie] = (m[c.categorie] || 0) + (Number(c.bedrag) || 0); return m; }, {});
        const fmt = (n) => "€ " + Math.round(n).toLocaleString("nl-NL");
        return (
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: "#22D3B018" }}><Package size={15} color="#22D3B0" /></div>
                <span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>Kosten & TCO</span>
              </div>
              {isAdmin && !costForm.open && <Button small icon={Plus} onClick={() => setCostForm({ ...costForm, open: true })}>Kosten</Button>}
            </div>

            <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr) minmax(0,1fr)" : "repeat(3, minmax(0,1fr))" }}>
              <div className="p-3 rounded-lg" style={{ background: "#161C25", border: "1px solid #232B38" }}>
                <div style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0", textTransform: "uppercase", letterSpacing: 0.5 }}>Totale kosten</div>
                <div style={{ fontFamily: "Oswald", fontSize: 24, fontWeight: 600, color: "#E7ECF3" }}>{fmt(totaal)}</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "#161C25", border: "1px solid #232B38" }}>
                <div style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0", textTransform: "uppercase", letterSpacing: 0.5 }}>Kosten per km</div>
                <div style={{ fontFamily: "Oswald", fontSize: 24, fontWeight: 600, color: "#E7ECF3" }}>€ {perKm.toFixed(2).replace(".", ",")}</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "#161C25", border: "1px solid #232B38" }}>
                <div style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0", textTransform: "uppercase", letterSpacing: 0.5 }}>Posten</div>
                <div style={{ fontFamily: "Oswald", fontSize: 24, fontWeight: 600, color: "#E7ECF3" }}>{costs.length}</div>
              </div>
            </div>

            {/* cost breakdown bar */}
            {totaal > 0 && (
              <div className="mb-3">
                <div className="flex rounded-full overflow-hidden" style={{ height: 8, background: "#161C25" }}>
                  {Object.entries(byCat).map(([cat, val]) => <div key={cat} style={{ width: `${(val / totaal) * 100}%`, background: catMeta[cat] || "#98A1B0" }} />)}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {Object.entries(byCat).map(([cat, val]) => (
                    <span key={cat} className="flex items-center gap-1" style={{ fontFamily: "Inter", fontSize: 11, color: "#B4BCC9" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: catMeta[cat] || "#98A1B0" }} /> {cat} {fmt(val)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {costForm.open && (
              <div className="p-3 rounded-lg mb-3 space-y-2" style={{ background: "#161C25", border: "1px solid #3B82F555" }}>
                <div className="grid gap-2" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr) minmax(0,1fr)" : "repeat(auto-fit, minmax(150px, 1fr))" }}>
                  <div><FieldLabel>Categorie</FieldLabel><select className="tg-input" style={{ width: "100%", minWidth: 0 }} value={costForm.categorie} onChange={(e) => setCostForm({ ...costForm, categorie: e.target.value })}><option value="onderhoud">Onderhoud</option><option value="brandstof">Brandstof</option><option value="reparatie">Reparatie</option><option value="verzekering">Verzekering</option><option value="belasting">Belasting</option><option value="overig">Overig</option></select></div>
                  <div><FieldLabel>Bedrag (€)</FieldLabel><input type="number" className="tg-input" style={{ width: "100%", minWidth: 0 }} value={costForm.bedrag} onChange={(e) => setCostForm({ ...costForm, bedrag: e.target.value })} /></div>
                  <div><FieldLabel>Datum</FieldLabel><input type="date" className="tg-input" style={{ width: "100%", minWidth: 0 }} value={costForm.datum} onChange={(e) => setCostForm({ ...costForm, datum: e.target.value })} /></div>
                  <div><FieldLabel>Omschrijving</FieldLabel><input className="tg-input" style={{ width: "100%", minWidth: 0 }} placeholder="Optioneel" value={costForm.omschrijving} onChange={(e) => setCostForm({ ...costForm, omschrijving: e.target.value })} /></div>
                </div>
                <div className="flex gap-2">
                  <Button small onClick={() => { if (!costForm.bedrag) return; onAddCost({ id: "c" + Date.now(), vehicle: vehicle.kenteken, categorie: costForm.categorie, bedrag: Number(costForm.bedrag), datum: costForm.datum, omschrijving: costForm.omschrijving }); setCostForm({ open: false, categorie: "onderhoud", bedrag: "", datum: TODAY, omschrijving: "" }); }}>Toevoegen</Button>
                  <Button small variant="ghost" onClick={() => setCostForm({ ...costForm, open: false })}>Annuleren</Button>
                </div>
              </div>
            )}

            {costs.length === 0 ? (
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#98A1B0" }}>Nog geen kosten geregistreerd.</div>
            ) : (
              <div className="space-y-1.5">
                {[...costs].sort((a, b) => (a.datum < b.datum ? 1 : -1)).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg" style={{ background: "#161C25", border: "1px solid #232B38" }}>
                    <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: catMeta[c.categorie] || "#98A1B0", flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.omschrijving || c.categorie}</div>
                        <div style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0" }}>{c.categorie} · {new Date(c.datum).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                      <span style={{ fontFamily: "JetBrains Mono", fontSize: 13, fontWeight: 700, color: "#E7ECF3" }}>{fmt(c.bedrag)}</span>
                      {isAdmin && (confirmCost === c.id ? (
                        <span className="flex items-center gap-2"><button onClick={() => { onDeleteCost && onDeleteCost(c.id); setConfirmCost(null); }} className="text-xs" style={{ color: "#F0453F", fontWeight: 700 }}>Bevestig</button><button onClick={() => setConfirmCost(null)} className="text-xs" style={{ color: "#B4BCC9" }}>Nee</button></span>
                      ) : (
                        <button onClick={() => setConfirmCost(c.id)} aria-label="Kostenpost verwijderen" title="Verwijderen" style={{ color: "#98A1B0" }}><X size={14} /></button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })()}

      {/* 360° inspectie — nu direct in het voertuigdetail (geen apart menu meer) */}
      {inspectionOn && (
        <Card className="p-5">
          <button onClick={() => setShowInsp((v) => !v)} className="w-full flex items-center justify-between gap-2">
            <span className="flex items-center gap-2" style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>
              <span className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: "#22D3B018" }}><ScanEye size={15} color="#22D3B0" /></span>
              360° inspectie
            </span>
            <ChevronDown size={18} color="#B4BCC9" style={{ transform: showInsp ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </button>
          {showInsp && (
            <div className="mt-4">
              <InspectionView vehicles={[vehicle]} reports={reports} onUpdate={onUpdate} aiReady={aiReady} lockVehicleId={vehicle.kenteken} embedded />
            </div>
          )}
        </Card>
      )}

      {/* Snel inplannen */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <Eyebrow>Werkplaats inplannen</Eyebrow>
        </div>
        {!sched.open ? (
          <Button icon={Plus} onClick={() => setSched({ ...sched, open: true })}>Afspraak inplannen</Button>
        ) : (
          <div className="space-y-3">
            <div><Eyebrow>Taak</Eyebrow><input className="tg-input" style={{ width: "100%" }} placeholder="Bv. Grote beurt" value={sched.taak} onChange={(e) => setSched({ ...sched, taak: e.target.value })} /></div>
            <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr) minmax(0,1fr)" : "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <div><Eyebrow>Datum</Eyebrow><input type="date" className="tg-input" style={{ width: "100%" }} value={sched.datum} onChange={(e) => setSched({ ...sched, datum: e.target.value })} /></div>
              <div><Eyebrow>Tijd</Eyebrow><input type="time" className="tg-input" style={{ width: "100%" }} value={sched.tijd} onChange={(e) => setSched({ ...sched, tijd: e.target.value })} /></div>
              <div><Eyebrow>Duur (min)</Eyebrow><input type="number" className="tg-input" style={{ width: "100%" }} value={sched.duur} onChange={(e) => setSched({ ...sched, duur: e.target.value })} /></div>
              <div><Eyebrow>Monteur</Eyebrow><input className="tg-input" style={{ width: "100%" }} value={sched.monteur} onChange={(e) => setSched({ ...sched, monteur: e.target.value })} /></div>
            </div>
            <div className="flex gap-2"><Button onClick={() => submitSchedule(null)} disabled={!sched.taak}>Inplannen</Button><Button variant="ghost" onClick={() => setSched({ ...sched, open: false })}>Annuleren</Button></div>
          </div>
        )}
      </Card>

      {/* Voorspellend onderhoud — automatisch (regels), AI optioneel als extra */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: "#3B82F618" }}><Wrench size={15} color="#3B82F6" /></div>
            <span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>Voorspellend onderhoud</span>
          </div>
          {aiReady && <Button small icon={Sparkles} variant="ghost" onClick={runPrediction} disabled={predLoading}>{predLoading ? "AI denkt na..." : prediction ? "AI opnieuw" : "AI-analyse"}</Button>}
        </div>
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", marginBottom: 12 }}>Automatisch berekend uit APK, km-stand, leeftijd, gezondheidsscore en terugkerende meldingen.{aiReady ? " Klik op AI-analyse voor een extra inschatting." : ""}</div>
        {predError && <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#FF8A00", marginBottom: 8 }}>{predError}</div>}
        {/* Regelgebaseerde items (altijd zichtbaar) */}
        {(() => {
          const local = rulePredictMaintenance(vehicle, vReports, TODAY);
          if (local.items.length === 0) return <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#34D399", marginBottom: prediction ? 12 : 0 }}>✓ Geen aandachtspunten gevonden op basis van de bekende gegevens.</div>;
          return (
          <div className="space-y-2" style={{ marginBottom: prediction ? 12 : 0 }}>
            {local.items.map((it, i) => {
              const col = it.urgentie === "hoog" ? "#F0453F" : it.urgentie === "gemiddeld" ? "#FF8A00" : "#34D399";
              return (
                <div key={i} className="p-3 rounded-lg" style={{ background: "#161C25", border: `1px solid #232B38`, borderLeft: `3px solid ${col}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <span style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, color: "#E7ECF3", minWidth: 0, flex: "1 1 0%" }}>{it.taak}</span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ color: col, border: `1px solid ${col}55`, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>{it.urgentie}</span>
                  </div>
                  {it.binnen && <div style={{ fontFamily: "JetBrains Mono", fontSize: 11.5, color: col, marginTop: 2 }}>⏱ {it.binnen}</div>}
                  {it.reden && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9", marginTop: 3 }}>{it.reden}</div>}
                  <button onClick={() => { setSched({ open: true, datum: TODAY, tijd: "09:00", duur: "60", taak: it.taak, monteur: "" }); document.getElementById("tt-main")?.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="mt-2 flex items-center gap-1 text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>
                    <Calendar size={12} /> Inplannen
                  </button>
                </div>
              );
            })}
          </div>
          );
        })()}
        {prediction && prediction.items && (
          <div className="space-y-2">
            <div style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 700, color: "#8FB8FF", textTransform: "uppercase", letterSpacing: 0.5 }}>AI-inschatting</div>
            {prediction.items.map((it, i) => {
              const col = it.urgentie === "hoog" ? "#F0453F" : it.urgentie === "gemiddeld" ? "#FF8A00" : "#34D399";
              return (
                <div key={i} className="p-3 rounded-lg" style={{ background: "#161C25", border: `1px solid #232B38`, borderLeft: `3px solid ${col}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <span style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, color: "#E7ECF3", minWidth: 0, flex: "1 1 0%" }}>{it.taak}</span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ color: col, border: `1px solid ${col}55`, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>{it.urgentie}</span>
                  </div>
                  {it.binnen && <div style={{ fontFamily: "JetBrains Mono", fontSize: 11.5, color: col, marginTop: 2 }}>⏱ {it.binnen}</div>}
                  {it.reden && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9", marginTop: 3 }}>{it.reden}</div>}
                  <button onClick={() => { setSched({ open: true, datum: TODAY, tijd: "09:00", duur: "60", taak: it.taak, monteur: "" }); document.getElementById("tt-main")?.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="mt-2 flex items-center gap-1 text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>
                    <Calendar size={12} /> Inplannen
                  </button>
                </div>
              );
            })}
            <div style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0", marginTop: 4 }}>AI-inschatting — geen vervanging voor een fysieke inspectie.</div>
          </div>
        )}
      </Card>

      {/* Meldingen van dit voertuig — direct inplanbaar */}
      <Card className="p-5">
        <Eyebrow>Meldingen ({vReports.length})</Eyebrow>
        {vReports.length === 0 ? (
          <div style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }} className="py-2">Geen meldingen voor dit voertuig.</div>
        ) : (
          <div className="space-y-2 mt-2">
            {vReports.map((r) => (
              <div key={r.id} className="p-3 rounded-lg" style={{ background: "#1A2129", border: "1px solid #232B38" }}>
                <div className="flex items-start justify-between gap-2">
                  <div style={{ minWidth: 0, flex: "1 1 0%" }}>
                    <div style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", fontWeight: 500 }}>{r.omschrijving}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 11, color: "#B4BCC9" }}>{r.chauffeur} · {r.datum} · {KANBAN_COLS.find((c) => c.id === r.status)?.label}</div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ color: PRIO_META[r.prioriteit].color, border: `1px solid ${PRIO_META[r.prioriteit].color}55`, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>{PRIO_META[r.prioriteit].label}</span>
                </div>
                {r.status !== "klaar" && (
                  <button onClick={() => { setSched({ open: true, datum: TODAY, tijd: "09:00", duur: "60", taak: r.omschrijving, monteur: "" }); document.getElementById("tt-main")?.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="mt-2 flex items-center gap-1 text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>
                    <Calendar size={12} /> Deze melding inplannen
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Geplande werkzaamheden */}
      <Card className="p-5">
        <Eyebrow>Geplande werkzaamheden ({vPlanning.length})</Eyebrow>
        {vPlanning.length === 0 ? (
          <div style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }} className="py-2">Niets ingepland.</div>
        ) : (
          <div className="space-y-2 mt-2">
            {vPlanning.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "#1A2129", border: "1px solid #232B38" }}>
                <div className="flex flex-col items-center justify-center px-2 py-1 rounded" style={{ background: "#3B82F618", minWidth: 56, flexShrink: 0 }}>
                  <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: "#3B82F6", fontWeight: 700 }}>{p.tijd}</span>
                  <span style={{ fontFamily: "Inter", fontSize: 9, color: "#B4BCC9" }}>{p.duur} min</span>
                </div>
                <div style={{ minWidth: 0, flex: "1 1 0%" }}>
                  <div style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.taak}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 11, color: "#B4BCC9" }}>{p.datum} · {p.monteur}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Danger zone — alleen beheerder */}
      {isAdmin && (
        <Card className="p-5" style={{ border: "1px solid #F0453F44" }}>
          <Eyebrow>Voertuig verwijderen</Eyebrow>
          {!confirmDel ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span style={{ fontFamily: "Inter", fontSize: 13, color: "#B4BCC9" }}>Verwijdert {vehicle.kenteken} permanent uit de vloot.</span>
              <Button variant="danger" icon={Trash2} onClick={() => setConfirmDel(true)}>Verwijderen</Button>
            </div>
          ) : (
            <div className="p-3 rounded-lg" style={{ background: "#F0453F14", border: "1px solid #F0453F44" }}>
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", marginBottom: 10 }}>Weet je zeker dat je <strong>{vehicle.kenteken}</strong> ({vehicle.merk}) wilt verwijderen? Dit kan niet ongedaan worden gemaakt.</div>
              <div className="flex gap-2">
                <Button variant="danger" icon={Trash2} onClick={() => onDelete(vehicle.id)}>Definitief verwijderen</Button>
                <Button variant="ghost" onClick={() => setConfirmDel(false)}>Annuleren</Button>
              </div>
            </div>
          )}
        </Card>
      )}
      </div>
    </div>
  );
}

const STATUS_CYCLE = ["operational", "attention", "workshop"];

function TrailersView({ trailers, onAdd, onUpdate, onDelete }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kenteken: "", merk: "", type: "", bouwjaar: "", apkTot: "" });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ kenteken: "", merk: "", type: "" });
  const [confirmDel, setConfirmDel] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [rdwLoading, setRdwLoading] = useState(false);
  const [aiMsg, setAiMsg] = useState("");

  // RDW-opzoeken voor trailers, net als bij vrachtwagens.
  const lookupRdwPlate = async () => {
    const plate = form.kenteken.trim();
    if (!plate) { setAiMsg("Vul eerst een kenteken in."); return; }
    setRdwLoading(true); setAiMsg("");
    try {
      const d = await lookupRDW(plate);
      setForm((f) => ({ ...f, merk: d.merk || f.merk, type: d.type || f.type, bouwjaar: d.bouwjaar ? String(d.bouwjaar) : f.bouwjaar, apkTot: d.apkTot || f.apkTot }));
      setAiMsg(d.apkTot ? `✓ RDW: ${d.merk || "gevonden"} · APK tot ${d.apkTot}` : `✓ RDW-gegevens ingevuld — controleer even.`);
    } catch (err) {
      setAiMsg(`RDW: ${err.message || "kon niet ophalen"}. Probeer 'AI' of vul handmatig in.`);
    } finally {
      setRdwLoading(false);
    }
  };
  const lookupPlate = async () => {
    const plate = form.kenteken.trim().toUpperCase();
    if (!plate) { setAiMsg("Vul eerst een kenteken in."); return; }
    setAiLoading(true); setAiMsg("");
    try {
      const prompt = `Je bent een RDW-voertuigassistent. Geef voor het Nederlandse kenteken "${plate}" van een aanhanger/oplegger (trailer) je beste inschatting. Antwoord UITSLUITEND met JSON, geen uitleg, in dit formaat:
{"merk":"<merk en model>","type":"<soort trailer, bv. Oplegger of Aanhanger>","bouwjaar":<jaartal>}
Als je het niet zeker weet, geef dan een plausibele inschatting op basis van het kentekenformaat. Geen extra tekst.`;
      const out = await callAI({ text: prompt, maxTokens: 300 });
      const parsed = parseAIJson(out);
      setForm((f) => ({ ...f, merk: parsed.merk || f.merk, type: parsed.type || f.type, bouwjaar: parsed.bouwjaar ? String(parsed.bouwjaar) : f.bouwjaar }));
      setAiMsg("✓ Gegevens ingevuld door AI — controleer en pas zo nodig aan.");
    } catch (err) {
      setAiMsg(`Kon gegevens niet ophalen (${err.message || "fout"}). Vul handmatig in.`);
    } finally {
      setAiLoading(false);
    }
  };

  const submit = () => { if (!form.kenteken || !form.merk) return; onAdd({ id: "t" + Date.now(), kenteken: form.kenteken.toUpperCase(), merk: form.merk, type: form.type || "Trailer", bouwjaar: Number(form.bouwjaar) || new Date().getFullYear(), apkTot: form.apkTot || "", status: "operational" }); setForm({ kenteken: "", merk: "", type: "", bouwjaar: "", apkTot: "" }); setAiMsg(""); setOpen(false); };
  const startEdit = (t) => { setEditId(t.id); setEditForm({ kenteken: t.kenteken, merk: t.merk, type: t.type }); };
  const saveEdit = (t) => { if (!editForm.kenteken || !editForm.merk) return; onUpdate({ ...t, kenteken: editForm.kenteken.toUpperCase(), merk: editForm.merk, type: editForm.type || "Trailer" }); setEditId(null); };
  const cycleStatus = (t) => { const i = STATUS_CYCLE.indexOf(t.status); onUpdate({ ...t, status: STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length] }); };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><IconTrailer size={24} color="#3B82F6" /> Trailers</h1><p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Beheer je trailers en aanhangwagens. Tik op de status om te wisselen.</p></div>
        <Button icon={Plus} onClick={() => setOpen(true)}>Trailer toevoegen</Button>
      </div>
      {open && (
        <Card className="p-5">
          <FieldLabel>Kenteken</FieldLabel>
          <div className="flex gap-2 flex-wrap">
            <input placeholder="bv. OP-12-XY" value={form.kenteken} onChange={(e) => setForm({ ...form, kenteken: e.target.value })} className="tg-input" style={{ flex: 1, minWidth: 140 }} />
            <Button icon={Search} onClick={lookupRdwPlate} disabled={rdwLoading || aiLoading} style={{ flexShrink: 0 }}>{rdwLoading ? "Zoeken..." : "RDW ophalen"}</Button>
            <Button variant="ghost" icon={Sparkles} onClick={lookupPlate} disabled={aiLoading || rdwLoading} style={{ flexShrink: 0 }}>{aiLoading ? "Zoeken..." : "AI"}</Button>
          </div>
          <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0", marginTop: 5 }}>Tik het kenteken in en haal merk, type, bouwjaar én APK-datum automatisch op bij de RDW.</div>
          {aiMsg && <div style={{ fontFamily: "Inter", fontSize: 12, color: aiMsg.startsWith("✓") ? "#34D399" : "#FF8A00", marginTop: 6 }}>{aiMsg}</div>}
          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))" }}>
            <div><FieldLabel>Merk</FieldLabel><input placeholder="Merk" value={form.merk} onChange={(e) => setForm({ ...form, merk: e.target.value })} className="tg-input w-full" /></div>
            <div><FieldLabel>Type</FieldLabel><input placeholder="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="tg-input w-full" /></div>
            <div><FieldLabel>APK tot (optioneel)</FieldLabel><input type="date" value={form.apkTot} onChange={(e) => setForm({ ...form, apkTot: e.target.value })} className="tg-input w-full" /></div>
          </div>
          <div className="flex gap-2 mt-4"><Button onClick={submit}>Opslaan</Button><Button variant="ghost" onClick={() => { setOpen(false); setAiMsg(""); }}>Annuleren</Button></div>
        </Card>
      )}
      {trailers.length === 0 ? <EmptyState icon={IconTrailer} text="Nog geen aanhangers." /> : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {trailers.map((t) => (
            <Card key={t.id} className="p-4">
              {editId === t.id ? (
                <div className="space-y-2">
                  <input className="tg-input" value={editForm.kenteken} onChange={(e) => setEditForm({ ...editForm, kenteken: e.target.value })} placeholder="Kenteken" />
                  <input className="tg-input" value={editForm.merk} onChange={(e) => setEditForm({ ...editForm, merk: e.target.value })} placeholder="Merk" />
                  <input className="tg-input" value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })} placeholder="Type" />
                  <div className="flex gap-2"><Button small onClick={() => saveEdit(t)}>Opslaan</Button><Button small variant="ghost" onClick={() => setEditId(null)}>Annuleren</Button></div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3"><Kenteken value={t.kenteken} /><button onClick={() => cycleStatus(t)} title="Klik om status te wisselen"><StatusLamp status={t.status} /></button></div>
                  <div style={{ fontFamily: "Inter", color: "#E7ECF3", fontWeight: 600, fontSize: 14 }}>{t.merk}</div>
                  <div style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 13 }}>{t.type} · {t.bouwjaar}</div>
                  <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: "1px solid #1A2129" }}>
                    <button onClick={() => startEdit(t)} className="text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>Bewerken</button>
                    {confirmDel === t.id ? (
                      <span className="flex items-center gap-2"><button onClick={() => { onDelete(t.id); setConfirmDel(null); }} className="text-xs" style={{ color: "#F0453F", fontFamily: "Inter", fontWeight: 700 }}>Bevestig</button><button onClick={() => setConfirmDel(null)} className="text-xs" style={{ color: "#B4BCC9", fontFamily: "Inter" }}>Nee</button></span>
                    ) : (
                      <button onClick={() => setConfirmDel(t.id)} className="flex items-center gap-1 text-xs" style={{ color: "#F0453F", fontFamily: "Inter", fontWeight: 600 }}><Trash2 size={12} /> Verwijderen</button>
                    )}
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PartsView({ parts, onAdd, onUpdate, onDelete }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ naam: "", voorraad: "", min: "", prijs: "" });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ naam: "", voorraad: "", min: "", prijs: "" });
  const [confirmDel, setConfirmDel] = useState(null);
  const submit = () => { if (!form.naam) return; onAdd({ id: "p" + Date.now(), naam: form.naam, voorraad: Number(form.voorraad) || 0, min: Number(form.min) || 0, eenheid: "stuks", prijs: Number(form.prijs) || 0 }); setForm({ naam: "", voorraad: "", min: "", prijs: "" }); setOpen(false); };
  const changeStock = (p, delta) => onUpdate({ ...p, voorraad: Math.max(0, p.voorraad + delta) });
  const startEdit = (p) => { setEditId(p.id); setEditForm({ naam: p.naam, voorraad: String(p.voorraad), min: String(p.min), prijs: String(p.prijs) }); };
  const saveEdit = (p) => { if (!editForm.naam) return; onUpdate({ ...p, naam: editForm.naam, voorraad: Number(editForm.voorraad) || 0, min: Number(editForm.min) || 0, prijs: Number(editForm.prijs) || 0 }); setEditId(null); };
  const totalValue = parts.reduce((a, p) => a + p.voorraad * p.prijs, 0);

  const Stepper = ({ p }) => (
    <span className="inline-flex items-center gap-1.5">
      <button onClick={() => changeStock(p, -1)} className="flex items-center justify-center rounded" style={{ width: 24, height: 24, background: "#1A2129", border: "1px solid #2A3340", color: "#E7ECF3", fontWeight: 700, lineHeight: 1 }}>−</button>
      <span style={{ color: p.voorraad < p.min ? "#F0453F" : "#E7ECF3", fontFamily: "JetBrains Mono", fontWeight: 700, minWidth: 22, textAlign: "center" }}>{p.voorraad}</span>
      <button onClick={() => changeStock(p, 1)} className="flex items-center justify-center rounded" style={{ width: 24, height: 24, background: "#1A2129", border: "1px solid #2A3340", color: "#E7ECF3", fontWeight: 700, lineHeight: 1 }}>+</button>
    </span>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Package size={22} color="#3B82F6" /> Voorraad &amp; onderdelen</h1><p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Voorraadwaarde: <span style={{ color: "#E7ECF3", fontFamily: "JetBrains Mono" }}>€ {totalValue.toLocaleString("nl-NL")}</span></p></div>
        <Button icon={Plus} onClick={() => setOpen(true)}>Onderdeel toevoegen</Button>
      </div>
      {open && (
        <Card className="p-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "2fr 1fr 1fr 1fr" }}>
            <input placeholder="Naam" value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} className="tg-input" />
            <input placeholder="Voorraad" type="number" value={form.voorraad} onChange={(e) => setForm({ ...form, voorraad: e.target.value })} className="tg-input" />
            <input placeholder="Min." type="number" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} className="tg-input" />
            <input placeholder="Prijs €" type="number" value={form.prijs} onChange={(e) => setForm({ ...form, prijs: e.target.value })} className="tg-input" />
          </div>
          <div className="flex gap-2 mt-4"><Button onClick={submit}>Opslaan</Button><Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button></div>
        </Card>
      )}
      {parts.length === 0 ? <EmptyState icon={Package} text="Nog geen onderdelen." /> : isMobile ? (
        <div className="space-y-3">
          {parts.map((p) => { const low = p.voorraad < p.min; return (
            <Card key={p.id} className="p-4">
              {editId === p.id ? (
                <div className="space-y-2">
                  <input className="tg-input" value={editForm.naam} onChange={(e) => setEditForm({ ...editForm, naam: e.target.value })} placeholder="Naam" />
                  <div className="grid grid-cols-3 gap-2">
                    <input className="tg-input" type="number" value={editForm.voorraad} onChange={(e) => setEditForm({ ...editForm, voorraad: e.target.value })} placeholder="Voorraad" />
                    <input className="tg-input" type="number" value={editForm.min} onChange={(e) => setEditForm({ ...editForm, min: e.target.value })} placeholder="Min." />
                    <input className="tg-input" type="number" value={editForm.prijs} onChange={(e) => setEditForm({ ...editForm, prijs: e.target.value })} placeholder="Prijs" />
                  </div>
                  <div className="flex gap-2"><Button small onClick={() => saveEdit(p)}>Opslaan</Button><Button small variant="ghost" onClick={() => setEditId(null)}>Annuleren</Button></div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontFamily: "Inter", color: "#E7ECF3", fontWeight: 600, fontSize: 14 }}>{p.naam}</span>
                    {low && <span className="text-xs px-2 py-0.5 rounded" style={{ color: "#F0453F", border: "1px solid #F0453F55", fontWeight: 600, flexShrink: 0 }}>Laag</span>}
                  </div>
                  <div className="flex items-center justify-between" style={{ fontFamily: "Inter", fontSize: 13 }}>
                    <Stepper p={p} />
                    <span style={{ color: "#B4BCC9", fontFamily: "JetBrains Mono" }}>€ {p.prijs} · min. {p.min}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 pt-2" style={{ borderTop: "1px solid #1A2129" }}>
                    <button onClick={() => startEdit(p)} className="text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>Bewerken</button>
                    {confirmDel === p.id ? (
                      <span className="flex items-center gap-2"><button onClick={() => { onDelete(p.id); setConfirmDel(null); }} className="text-xs" style={{ color: "#F0453F", fontWeight: 700 }}>Bevestig</button><button onClick={() => setConfirmDel(null)} className="text-xs" style={{ color: "#B4BCC9" }}>Nee</button></span>
                    ) : (
                      <button onClick={() => setConfirmDel(p.id)} className="flex items-center gap-1 text-xs" style={{ color: "#F0453F", fontFamily: "Inter", fontWeight: 600 }}><Trash2 size={12} /> Verwijderen</button>
                    )}
                  </div>
                </>
              )}
            </Card>
          ); })}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "Inter", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: "1px solid #232B38" }}>{["Onderdeel", "Voorraad", "Min.", "Prijs", "Waarde", ""].map((h) => <th key={h} className="text-left px-4 py-3" style={{ color: "#B4BCC9", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>
              {parts.map((p) => { const low = p.voorraad < p.min; return (
                <tr key={p.id} style={{ borderBottom: "1px solid #1A2129" }}>
                  {editId === p.id ? (
                    <td colSpan={6} className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <input className="tg-input" style={{ width: 200 }} value={editForm.naam} onChange={(e) => setEditForm({ ...editForm, naam: e.target.value })} placeholder="Naam" />
                        <input className="tg-input" style={{ width: 90 }} type="number" value={editForm.voorraad} onChange={(e) => setEditForm({ ...editForm, voorraad: e.target.value })} placeholder="Voorraad" />
                        <input className="tg-input" style={{ width: 80 }} type="number" value={editForm.min} onChange={(e) => setEditForm({ ...editForm, min: e.target.value })} placeholder="Min." />
                        <input className="tg-input" style={{ width: 90 }} type="number" value={editForm.prijs} onChange={(e) => setEditForm({ ...editForm, prijs: e.target.value })} placeholder="Prijs" />
                        <Button small onClick={() => saveEdit(p)}>Opslaan</Button><Button small variant="ghost" onClick={() => setEditId(null)}>Annuleren</Button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3" style={{ color: "#E7ECF3" }}>{p.naam}</td>
                      <td className="px-4 py-3"><Stepper p={p} /></td>
                      <td className="px-4 py-3" style={{ color: "#B4BCC9" }}>{p.min}</td>
                      <td className="px-4 py-3" style={{ color: "#B4BCC9", fontFamily: "JetBrains Mono" }}>€ {p.prijs}</td>
                      <td className="px-4 py-3" style={{ color: "#B4BCC9", fontFamily: "JetBrains Mono" }}>€ {(p.voorraad * p.prijs).toLocaleString("nl-NL")}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {low && <span className="text-xs px-2 py-0.5 rounded" style={{ color: "#F0453F", border: "1px solid #F0453F55", fontWeight: 600 }}>Laag</span>}
                          <button onClick={() => startEdit(p)} className="text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>Bewerken</button>
                          {confirmDel === p.id ? (
                            <span className="flex items-center gap-2"><button onClick={() => { onDelete(p.id); setConfirmDel(null); }} className="text-xs" style={{ color: "#F0453F", fontWeight: 700 }}>Bevestig</button><button onClick={() => setConfirmDel(null)} className="text-xs" style={{ color: "#B4BCC9" }}>Nee</button></span>
                          ) : (
                            <button onClick={() => setConfirmDel(p.id)} className="text-xs" style={{ color: "#F0453F", fontFamily: "Inter", fontWeight: 600 }}>Verwijderen</button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ); })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

const MAINT_STATUS_CYCLE = ["gepland", "in_uitvoering", "urgent", "klaar"];
const maintStatusColor = { gepland: "#22D3B0", urgent: "#F0453F", in_uitvoering: "#FF8A00", klaar: "#34D399" };
const maintStatusLabel = { gepland: "Gepland", urgent: "Urgent", in_uitvoering: "In uitvoering", klaar: "Klaar" };

function MaintenanceView({ maintenance, vehicles = [], onAdd, onUpdate, onDelete }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vehicle: "", taak: "", dueDate: "", dueKm: "" });
  const [confirmDel, setConfirmDel] = useState(null);
  const submit = () => { if (!form.vehicle || !form.taak) return; onAdd({ id: "m" + Date.now(), vehicle: form.vehicle, taak: form.taak, dueKm: Number(form.dueKm) || null, dueDate: form.dueDate || "—", status: "gepland" }); setForm({ vehicle: "", taak: "", dueDate: "", dueKm: "" }); setOpen(false); };
  const cycleStatus = (m) => { const i = MAINT_STATUS_CYCLE.indexOf(m.status); onUpdate({ ...m, status: MAINT_STATUS_CYCLE[(i + 1) % MAINT_STATUS_CYCLE.length] }); };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Wrench size={22} color="#3B82F6" /> Onderhoudsschema's</h1><p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Geplande beurten op kilometerstand én tijd. Tik op de status om te wisselen.</p></div>
        <Button icon={Plus} onClick={() => setOpen(true)}>Nieuw schema</Button>
      </div>
      {open && (
        <Card className="p-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {vehicles.length > 0 ? (
              <select className="tg-input" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })}>
                <option value="">Kies voertuig…</option>
                {vehicles.map((v) => <option key={v.id} value={v.kenteken}>{v.kenteken} — {v.merk}</option>)}
              </select>
            ) : (
              <input placeholder="Kenteken" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} className="tg-input" />
            )}
            <input placeholder="Taak" value={form.taak} onChange={(e) => setForm({ ...form, taak: e.target.value })} className="tg-input" />
            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="tg-input" />
            <input placeholder="Bij km (optioneel)" type="number" value={form.dueKm} onChange={(e) => setForm({ ...form, dueKm: e.target.value })} className="tg-input" />
          </div>
          <div className="flex gap-2 mt-4"><Button onClick={submit}>Opslaan</Button><Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button></div>
        </Card>
      )}
      {maintenance.length === 0 ? <EmptyState icon={Calendar} text="Nog geen onderhoudsschema's." /> : (
        <div className="space-y-3">
          {maintenance.map((m) => (
            <Card key={m.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-4" style={{ minWidth: 0 }}>
                <Kenteken value={m.vehicle} />
                <div style={{ minWidth: 0 }}><div style={{ fontFamily: "Inter", color: "#E7ECF3", fontWeight: 600, fontSize: 14 }}>{m.taak}</div><div style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 12 }}>Verwacht: {m.dueDate}{m.dueKm ? ` · ${m.dueKm.toLocaleString("nl-NL")} km` : ""}</div></div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => cycleStatus(m)} className="text-xs px-2 py-1 rounded" style={{ color: maintStatusColor[m.status], border: `1px solid ${maintStatusColor[m.status]}55`, fontWeight: 600, fontFamily: "Inter" }}>{maintStatusLabel[m.status]}</button>
                {confirmDel === m.id ? (
                  <span className="flex items-center gap-2"><button onClick={() => { onDelete(m.id); setConfirmDel(null); }} className="text-xs" style={{ color: "#F0453F", fontWeight: 700 }}>Bevestig</button><button onClick={() => setConfirmDel(null)} className="text-xs" style={{ color: "#B4BCC9" }}>Nee</button></span>
                ) : (
                  <button onClick={() => setConfirmDel(m.id)} style={{ color: "#F0453F" }}><Trash2 size={15} /></button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   WERKBON — melding afronden met ondertekende PDF + kosten naar overzicht
--------------------------------------------------------------------- */
function WerkbonModal({ report, parts = [], mechanics = [], company, profiel = {}, onClose, onComplete, onUsePart }) {
  const [monteur, setMonteur] = useState(mechanics[0]?.naam || "");
  const [uren, setUren] = useState("1");
  const [tarief, setTarief] = useState(() => (profiel.uurtarief != null && profiel.uurtarief !== "" ? String(profiel.uurtarief) : "65"));
  const [lines, setLines] = useState([]);
  const [pick, setPick] = useState("");
  const [customNaam, setCustomNaam] = useState("");
  const [customPrijs, setCustomPrijs] = useState("");
  const [extraOms, setExtraOms] = useState("");
  const [extraBedrag, setExtraBedrag] = useState("");
  const [notities, setNotities] = useState(report?.omschrijving || "");
  const [categorie, setCategorie] = useState("reparatie");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const signedRef = useRef(false);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const addLine = () => {
    const part = parts.find((p) => p.id === pick);
    if (!part) return;
    setLines((l) => [...l, { key: part.id + "_" + Date.now(), partId: part.id, naam: part.naam, prijs: Number(part.prijs) || 0, aantal: 1 }]);
    setPick("");
  };
  // Los onderdeel dat niet in de voorraad staat (naam + prijs zelf invullen).
  const addCustomLine = () => {
    const naam = customNaam.trim();
    if (!naam) return;
    setLines((l) => [...l, { key: "custom_" + Date.now(), partId: null, naam, prijs: Number(customPrijs) || 0, aantal: 1 }]);
    setCustomNaam(""); setCustomPrijs("");
  };
  const setAantal = (key, n) => setLines((l) => l.map((x) => (x.key === key ? { ...x, aantal: Math.max(1, Number(n) || 1) } : x)));
  const removeLine = (key) => setLines((l) => l.filter((x) => x.key !== key));

  const arbeid = (Number(uren) || 0) * (Number(tarief) || 0);
  const ondTot = lines.reduce((a, x) => a + x.prijs * x.aantal, 0);
  const extra = Number(extraBedrag) || 0;
  const total = arbeid + ondTot + extra;

  const relPos = (e) => {
    const c = canvasRef.current; const rect = c.getBoundingClientRect();
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: (t.clientX - rect.left) * (c.width / rect.width), y: (t.clientY - rect.top) * (c.height / rect.height) };
  };
  const startDraw = (e) => { e.preventDefault(); drawing.current = true; const ctx = canvasRef.current.getContext("2d"); const p = relPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const moveDraw = (e) => { if (!drawing.current) return; e.preventDefault(); const ctx = canvasRef.current.getContext("2d"); const p = relPos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = "#0A0E14"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.stroke(); signedRef.current = true; };
  const endDraw = () => { drawing.current = false; };
  const clearSig = () => { const c = canvasRef.current; if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height); signedRef.current = false; };

  const euro = (n) => "€ " + (Math.round(n * 100) / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const finish = async () => {
    if (!notities.trim()) { setErr("Beschrijf kort het uitgevoerde werk."); return; }
    setBusy(true); setErr("");
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const M = 16; const R = 210 - M; let y = 18;
      // Paginering: vóór elke regel checken of hij nog past; anders nieuwe
      // pagina. Zo lopen lange werkbonnen niet over de voettekst/pagina heen.
      const br = (need = 10) => { if (y > 278 - need) { doc.addPage(); y = 18; } };
      const naam = profiel.bedrijfsnaam || company?.name || "";

      // Kop: logo links (indien aanwezig) + bedrijfsgegevens rechts.
      let headBottom = y;
      if (profiel.logo) {
        try {
          const props = doc.getImageProperties(profiel.logo);
          const w = 34, h = Math.min(24, (props.height / props.width) * w);
          doc.addImage(profiel.logo, "PNG", M, y, w, h);
          headBottom = Math.max(headBottom, y + h);
        } catch { /* ongeldig logo: overslaan */ }
      }
      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(naam, R, y + 4, { align: "right" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
      let hy = y + 9;
      const rl = (t) => { if (t) { doc.text(String(t), R, hy, { align: "right" }); hy += 4; } };
      rl(profiel.adres);
      rl([profiel.postcode, profiel.plaats].filter(Boolean).join("  "));
      rl(profiel.telefoon);
      rl(profiel.email);
      if (profiel.kvk) rl("KvK " + profiel.kvk);
      if (profiel.btw) rl("BTW " + profiel.btw);
      doc.setTextColor(0);
      headBottom = Math.max(headBottom, hy);

      y = headBottom + 4;
      doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("WERKBON", M, y);
      y += 3; doc.setDrawColor(200); doc.line(M, y, R, y); y += 8;
      doc.setFontSize(10);
      const row = (label, val) => { doc.setFont("helvetica", "bold"); doc.text(label, M, y); doc.setFont("helvetica", "normal"); doc.text(String(val || "-"), M + 40, y); y += 6; };
      row("Datum", TODAY);
      row("Voertuig", report?.vehicle);
      row("Melding door", report?.chauffeur);
      row("Monteur", monteur);
      y += 3; doc.setFont("helvetica", "bold"); doc.text("Uitgevoerd werk", M, y); y += 6;
      doc.setFont("helvetica", "normal");
      doc.splitTextToSize(notities, R - M).forEach((tl) => { br(6); doc.text(tl, M, y); y += 6; });
      y += 2;
      // Kostenregels
      br(20);
      doc.setFont("helvetica", "bold"); doc.text("Omschrijving", M, y); doc.text("Aantal", 120, y); doc.text("Prijs", 150, y); doc.text("Totaal", R, y, { align: "right" }); y += 2;
      doc.line(M, y, R, y); y += 6; doc.setFont("helvetica", "normal");
      const line = (oms, aantal, prijs, tot) => { br(8); doc.text(String(oms), M, y); doc.text(String(aantal), 120, y); doc.text(euro(prijs), 150, y); doc.text(euro(tot), R, y, { align: "right" }); y += 6; };
      line(`Arbeid (${uren} u × ${euro(Number(tarief) || 0)})`, uren, Number(tarief) || 0, arbeid);
      lines.forEach((l) => line(l.naam, l.aantal, l.prijs, l.prijs * l.aantal));
      if (extra > 0) line(extraOms || "Overig", 1, extra, extra);
      y += 1; doc.line(M, y, R, y); y += 7;
      // Totalen met BTW.
      br(60);
      const btwPct = profiel.btwPercentage != null ? Number(profiel.btwPercentage) : 21;
      const btwBedrag = total * (btwPct / 100);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text("Subtotaal", 150, y); doc.text(euro(total), R, y, { align: "right" }); y += 6;
      doc.text(`BTW ${btwPct}%`, 150, y); doc.text(euro(btwBedrag), R, y, { align: "right" }); y += 2;
      doc.line(150, y, R, y); y += 6;
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text("Totaal incl. btw", 150, y); doc.text(euro(total + btwBedrag), R, y, { align: "right" }); y += 14;
      // Handtekening
      if (signedRef.current && canvasRef.current) {
        try { doc.addImage(canvasRef.current.toDataURL("image/png"), "PNG", M, y, 60, 22); } catch {}
      }
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("Handtekening klant", M, y + 27);
      // Voettekst: betaalgegevens.
      if (profiel.iban || profiel.btw || profiel.kvk) {
        const fy = 285;
        doc.setDrawColor(220); doc.line(M, fy - 4, R, fy - 4);
        doc.setFontSize(8); doc.setTextColor(120);
        const foot = [profiel.iban ? "IBAN " + profiel.iban : "", profiel.kvk ? "KvK " + profiel.kvk : "", profiel.btw ? "BTW " + profiel.btw : ""].filter(Boolean).join("   •   ");
        doc.text(foot, 105, fy, { align: "center" });
        doc.setTextColor(0);
      }
      // Niet automatisch downloaden: we maken een download-link en tonen een
      // knop, zodat de gebruiker zelf kiest wanneer/of hij de PDF bewaart.
      const blob = doc.output("blob");
      setPdfUrl(URL.createObjectURL(blob));
      setSaved(true);

      // Gebruikte onderdelen van de voorraad afboeken.
      if (onUsePart) lines.forEach((l) => { if (l.partId) onUsePart(l.partId, l.aantal); });
      onComplete({
        id: "c" + Date.now(),
        vehicle: report?.vehicle || "",
        categorie,
        bedrag: Math.round(total),
        datum: TODAY,
        omschrijving: "Werkbon: " + notities.trim().slice(0, 60),
      });
    } catch (e) {
      setErr("Kon de werkbon niet maken: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(5,8,12,0.75)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: 12 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 540, background: "#0F141B", border: "1px solid #232B38", borderRadius: 16, margin: "12px 0" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1A2129" }}>
          <div className="flex items-center gap-2"><ClipboardList size={18} color="#3B82F6" /><span style={{ fontFamily: "Oswald", fontSize: 18, fontWeight: 600, color: "#E7ECF3" }}>Werkbon — {report?.vehicle}</span></div>
          <button onClick={onClose} aria-label="Sluiten"><X size={20} color="#B4BCC9" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div><FieldLabel>Uitgevoerd werk</FieldLabel><textarea className="tg-input w-full" rows={2} value={notities} onChange={(e) => setNotities(e.target.value)} /></div>
          <div><FieldLabel>Monteur</FieldLabel>{mechanics.length > 0 ? <select className="tg-input w-full" value={monteur} onChange={(e) => setMonteur(e.target.value)}>{mechanics.map((m) => <option key={m.id}>{m.naam}</option>)}</select> : <input className="tg-input w-full" value={monteur} onChange={(e) => setMonteur(e.target.value)} />}</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
            <div style={{ minWidth: 0 }}><FieldLabel>Arbeid (uren)</FieldLabel><input type="number" step="0.5" className="tg-input w-full" value={uren} onChange={(e) => setUren(e.target.value)} /></div>
            <div style={{ minWidth: 0 }}><FieldLabel>Uurtarief €</FieldLabel><input type="number" className="tg-input w-full" value={tarief} onChange={(e) => setTarief(e.target.value)} /></div>
          </div>

          <div>
            <FieldLabel>Onderdelen uit voorraad</FieldLabel>
            <div className="flex gap-2">
              <select className="tg-input" style={{ flex: 1, minWidth: 0 }} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Kies onderdeel...</option>
                {parts.map((p) => <option key={p.id} value={p.id}>{p.naam} — {euro(Number(p.prijs) || 0)}</option>)}
              </select>
              <Button small onClick={addLine} disabled={!pick}>Toevoegen</Button>
            </div>
            {/* Los onderdeel dat niet in de voorraad staat */}
            <div className="flex gap-2 mt-2">
              <input className="tg-input" style={{ flex: 1, minWidth: 0 }} placeholder="Los onderdeel (naam)" value={customNaam} onChange={(e) => setCustomNaam(e.target.value)} />
              <input type="number" className="tg-input" style={{ width: 92 }} placeholder="Prijs €" value={customPrijs} onChange={(e) => setCustomPrijs(e.target.value)} />
              <Button small variant="ghost" onClick={addCustomLine} disabled={!customNaam.trim()}>+ Los</Button>
            </div>
            {lines.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {lines.map((l) => (
                  <div key={l.key} className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ background: "#12171F", border: "1px solid #232B38" }}>
                    <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#E7ECF3", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.naam}</span>
                    <input type="number" value={l.aantal} onChange={(e) => setAantal(l.key, e.target.value)} className="tg-input" style={{ width: 56, textAlign: "center" }} />
                    <span style={{ fontFamily: "JetBrains Mono", fontSize: 12.5, color: "#B4BCC9", minWidth: 64, textAlign: "right" }}>{euro(l.prijs * l.aantal)}</span>
                    <button onClick={() => removeLine(l.key)} style={{ color: "#F0453F" }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
            <div style={{ minWidth: 0 }}><FieldLabel>Overige kosten (optioneel)</FieldLabel><input className="tg-input w-full" placeholder="Omschrijving" value={extraOms} onChange={(e) => setExtraOms(e.target.value)} /></div>
            <div style={{ minWidth: 0 }}><FieldLabel>Bedrag €</FieldLabel><input type="number" className="tg-input w-full" value={extraBedrag} onChange={(e) => setExtraBedrag(e.target.value)} /></div>
          </div>

          <div><FieldLabel>Kostencategorie</FieldLabel><select className="tg-input w-full" value={categorie} onChange={(e) => setCategorie(e.target.value)}><option value="reparatie">Reparatie</option><option value="onderhoud">Onderhoud</option></select></div>

          <div className="flex items-center justify-between px-3 py-3 rounded-lg" style={{ background: "#12233E", border: "1px solid #3B82F544" }}>
            <span style={{ fontFamily: "Inter", fontWeight: 600, color: "#E7ECF3" }}>Totaal (excl. btw)</span>
            <span style={{ fontFamily: "Oswald", fontSize: 22, fontWeight: 700, color: "#E7ECF3" }}>{euro(total)}</span>
          </div>

          <div>
            <div className="flex items-center justify-between"><FieldLabel>Handtekening klant</FieldLabel><button onClick={clearSig} style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 12 }}>Wissen</button></div>
            <canvas ref={canvasRef} width={480} height={150} style={{ width: "100%", height: 130, background: "#FFFFFF", borderRadius: 10, touchAction: "none", cursor: "crosshair" }}
              onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw} />
            <div style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0", marginTop: 4 }}>Laat de klant hierboven tekenen met vinger of muis (optioneel).</div>
          </div>

          {err && <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#F0453F" }}>{err}</div>}

          {saved ? (
            <>
              <div className="flex items-center gap-2 px-3 py-3 rounded-lg" style={{ background: "#12271C", border: "1px solid #34D39955" }}>
                <ShieldCheck size={16} color="#34D399" />
                <span style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", fontWeight: 600 }}>Werkbon opgeslagen — melding op Klaar en kosten toegevoegd.</span>
              </div>
              <div className="flex gap-2 pt-1">
                <a href={pdfUrl} download={`werkbon-${(report?.vehicle || "voertuig").replace(/[^A-Za-z0-9-]/g, "")}-${TODAY}.pdf`}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg" style={{ background: "linear-gradient(180deg,#4C8DFF,#3B82F6)", color: "#fff", fontFamily: "Inter", fontWeight: 600, fontSize: 13.5 }}>
                  <FileText size={15} /> Werkbon downloaden (PDF)
                </a>
                <Button variant="ghost" onClick={onClose}>Sluiten</Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2 pt-1">
                <Button icon={FileText} onClick={finish} disabled={busy}>{busy ? "Bezig..." : "Werkbon opslaan"}</Button>
                <Button variant="ghost" onClick={onClose}>Annuleren</Button>
              </div>
              <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0" }}>Bij opslaan wordt de melding op <b>Klaar</b> gezet en het totaalbedrag toegevoegd aan het kostenoverzicht. Daarna kun je de werkbon als PDF downloaden.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   SCHADEDOSSIER: één PDF per melding met alle gegevens + foto's — klaar om
   naar de verzekeraar of opdrachtgever te sturen.
--------------------------------------------------------------------- */
async function downloadSchadeDossier({ report, vehicle = null, profiel = {}, company = null }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 16, R = 210 - M; let y = 18;
  const br = (need = 10) => { if (y > 278 - need) { doc.addPage(); y = 18; } };
  const naam = profiel.bedrijfsnaam || company?.name || "";
  if (profiel.logo) {
    try { const props = doc.getImageProperties(profiel.logo); const w = 34, h = Math.min(24, (props.height / props.width) * w); doc.addImage(profiel.logo, "PNG", M, y, w, h); } catch { /* ongeldig logo */ }
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(naam, R, y + 4, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
  let hy = y + 9;
  [profiel.adres, [profiel.postcode, profiel.plaats].filter(Boolean).join("  "), profiel.telefoon, profiel.email, profiel.kvk ? "KvK " + profiel.kvk : ""].filter(Boolean).forEach((tl) => { doc.text(String(tl), R, hy, { align: "right" }); hy += 4; });
  doc.setTextColor(0);
  y = Math.max(y + 26, hy) + 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("SCHADEDOSSIER", M, y);
  y += 3; doc.setDrawColor(200); doc.line(M, y, R, y); y += 8;
  doc.setFontSize(10);
  const row = (label, val) => { if (!val) return; br(8); doc.setFont("helvetica", "bold"); doc.text(label, M, y); doc.setFont("helvetica", "normal"); doc.text(String(val), M + 42, y); y += 6; };
  row("Kenteken", report.vehicle);
  if (vehicle) row("Voertuig", [vehicle.merk, vehicle.type, vehicle.bouwjaar].filter(Boolean).join(" · "));
  row("Datum melding", report.datum);
  row("Gemeld door", report.chauffeur);
  row("Prioriteit", PRIO_META[report.prioriteit]?.label || report.prioriteit);
  row("Plek op de wagen", report.zone ? (ZONES.find((z) => z.id === report.zone)?.label || report.zone) : "");
  row("Wanneer", report.wanneer);
  row("Nog veilig te rijden", report.veilig);
  y += 2; doc.setFont("helvetica", "bold"); doc.text("Omschrijving", M, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.splitTextToSize(report.omschrijving || "-", R - M).forEach((tl) => { br(6); doc.text(tl, M, y); y += 6; });
  y += 2;
  // Foto's ophalen (tijdelijke links) en inbedden. Video's kunnen niet in een
  // PDF; die vermelden we alleen.
  const media = Array.isArray(report.media) ? report.media : [];
  let fotos = [], videos = 0;
  if (media.length) {
    try {
      const urls = await signedMediaUrls(media);
      for (const m of urls) {
        if (m.type === "video") { videos++; continue; }
        try {
          const res = await fetch(m.url);
          const blob = await res.blob();
          const dataUrl = await new Promise((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = fail; fr.readAsDataURL(blob); });
          fotos.push(dataUrl);
        } catch { /* foto niet op te halen: overslaan */ }
      }
    } catch { /* geen links: dossier zonder foto's */ }
  }
  if (fotos.length) {
    br(14); doc.setFont("helvetica", "bold"); doc.text(`Foto's (${fotos.length})`, M, y); y += 6;
    for (const f of fotos) {
      try {
        const props = doc.getImageProperties(f);
        const w = Math.min(120, R - M);
        const h = (props.height / props.width) * w;
        const hClamped = Math.min(h, 110);
        const wFinal = hClamped < h ? (props.width / props.height) * hClamped : w;
        br(hClamped + 6);
        doc.addImage(f, props.fileType === "PNG" ? "PNG" : "JPEG", M, y, wFinal, hClamped);
        y += hClamped + 6;
      } catch { /* onleesbare foto: overslaan */ }
    }
  }
  if (videos > 0) { br(8); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120); doc.text(`+ ${videos} video('s) bij deze melding (niet opneembaar in PDF — zie de app).`, M, y); doc.setTextColor(0); y += 6; }
  doc.save(`schadedossier-${(report.vehicle || "melding").replace(/[^\w-]+/g, "_")}-${report.datum || ""}.pdf`);
}

function WorkfloorView({ reports, onMove, onDelete, onSchedule, mechanics = [], availability = {}, hours, parts = [], company, profiel = {}, onAddCost, onUsePart, onRefresh, refreshing, vehicles = [] }) {
  const isMobile = useIsMobile();
  const device = useDevice();
  const [moveMenu, setMoveMenu] = useState(null); // report id whose menu is open
  const [schedFor, setSchedFor] = useState(null); // report id being scheduled
  const [schedForm, setSchedForm] = useState({ datum: TODAY, tijd: "09:00", duur: "60", monteurId: "", monteur: "" });
  const [toast, setToast] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [werkbonFor, setWerkbonFor] = useState(null);
  const [dossierBusy, setDossierBusy] = useState(null); // report id waarvoor het dossier wordt gemaakt

  const makeDossier = async (r) => {
    if (dossierBusy) return;
    setDossierBusy(r.id);
    try {
      await downloadSchadeDossier({ report: r, vehicle: vehicles.find((v) => v.kenteken === r.vehicle) || null, profiel, company });
      setToast("Schadedossier gedownload.");
    } catch (e) {
      setToast("Dossier maken mislukte — probeer opnieuw.");
    } finally { setDossierBusy(null); }
  };

  const openSchedule = (r) => {
    setMoveMenu(null);
    setSchedFor(r.id);
    const first = mechanics[0];
    setSchedForm({ datum: TODAY, tijd: "09:00", duur: "60", monteurId: first?.id || "", monteur: first?.naam || "" });
  };

  const avail = schedForm.monteurId ? checkAvailability(schedForm.datum, schedForm.tijd, availability[schedForm.monteurId], hours) : checkAvailability(schedForm.datum, schedForm.tijd, null, hours);

  const confirmSchedule = (r) => {
    onSchedule({ id: "pl" + Date.now(), vehicle: r.vehicle, datum: schedForm.datum, tijd: schedForm.tijd, duur: Number(schedForm.duur) || 60, taak: r.omschrijving, monteur: schedForm.monteur || "—", reportId: r.id });
    onMove(r.id, "in_behandeling");
    setSchedFor(null);
    const d = new Date(schedForm.datum).toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
    setToast(`${r.vehicle} ingepland op ${d} om ${schedForm.tijd}.`);
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div><h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><KanbanSquare size={22} color="#3B82F6" /> Werkvloer</h1><p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Meldingen van chauffeurs, direct in beeld.</p></div>
        {onRefresh && <Button variant="ghost" small icon={RefreshCw} onClick={async () => { const ok = await onRefresh(); setToast(ok === false ? "Verversen mislukt — controleer je verbinding." : "Bijgewerkt."); }} disabled={refreshing}>{refreshing ? "Ophalen..." : "Ververs"}</Button>}
      </div>
      {reports.length === 0 ? <EmptyState icon={CheckCircle2} text="Niks meer te doen. Goed werk!" /> : (
        <div className="grid gap-4" style={{ gridTemplateColumns: device === "phone" ? "minmax(0, 1fr)" : device === "tablet" ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))" }}>
          {KANBAN_COLS.map((col) => { const items = reports.filter((r) => r.status === col.id); return (
            <div key={col.id}>
              <Eyebrow>{col.label} ({items.length})</Eyebrow>
              <div className="space-y-3">
                {items.map((r) => (
                  <Card key={r.id} className="p-3" style={{ position: "relative" }}>
                    <div className="flex items-center justify-between mb-2">
                      <Kenteken value={r.vehicle} />
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: PRIO_META[r.prioriteit].color, border: `1px solid ${PRIO_META[r.prioriteit].color}55`, fontWeight: 600, flexShrink: 0 }}>{PRIO_META[r.prioriteit].label}</span>
                    </div>
                    <div style={{ fontFamily: "Inter", color: "#E7ECF3", fontSize: 13 }} className="mb-1">{r.omschrijving}</div>
                    <div style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 11 }} className="mb-2">{r.chauffeur} · {r.datum}{r.mediaCount ? ` · ${r.mediaCount} bijlage(n)` : ""}</div>
                    <ReportMedia media={r.media} />

                    {schedFor === r.id ? (
                      <div className="mt-2 p-2.5 rounded-lg space-y-2" style={{ background: "#1A2129", border: "1px solid #3B82F555" }}>
                        <div style={{ fontFamily: "Inter", fontSize: 11.5, fontWeight: 600, color: "#3B82F6" }}>Inplannen in de kalender</div>
                        <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                          <div style={{ minWidth: 0 }}><FieldLabel>Datum</FieldLabel><input type="date" className="tg-input" style={{ width: "100%", minWidth: 0 }} value={schedForm.datum} onChange={(e) => setSchedForm({ ...schedForm, datum: e.target.value })} /></div>
                          <div style={{ minWidth: 0 }}><FieldLabel>Tijd</FieldLabel><input type="time" className="tg-input" style={{ width: "100%", minWidth: 0 }} value={schedForm.tijd} onChange={(e) => setSchedForm({ ...schedForm, tijd: e.target.value })} /></div>
                          <div style={{ minWidth: 0 }}><FieldLabel>Duur (min)</FieldLabel><input type="number" className="tg-input" style={{ width: "100%", minWidth: 0 }} value={schedForm.duur} onChange={(e) => setSchedForm({ ...schedForm, duur: e.target.value })} /></div>
                          <div style={{ minWidth: 0 }}><FieldLabel>Monteur</FieldLabel>
                            {mechanics.length > 0 ? (
                              <select className="tg-input" style={{ width: "100%", minWidth: 0 }} value={schedForm.monteurId} onChange={(e) => { const m = mechanics.find((x) => x.id === e.target.value); setSchedForm({ ...schedForm, monteurId: e.target.value, monteur: m ? m.naam : "" }); }}>
                                {mechanics.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
                              </select>
                            ) : (
                              <input className="tg-input" style={{ width: "100%", minWidth: 0 }} placeholder="Naam" value={schedForm.monteur} onChange={(e) => setSchedForm({ ...schedForm, monteur: e.target.value })} />
                            )}
                          </div>
                        </div>
                        {!avail.available && (
                          <div className="flex items-start gap-1.5 p-2 rounded-lg" style={{ background: "#FF8A0014", border: "1px solid #FF8A0044" }}>
                            <AlertTriangle size={13} color="#FF8A00" style={{ flexShrink: 0, marginTop: 1 }} />
                            <span style={{ fontFamily: "Inter", fontSize: 11.5, color: "#FF8A00" }}>{avail.reason} Je kunt alsnog inplannen.</span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button small onClick={() => confirmSchedule(r)}>Inplannen</Button>
                          <Button small variant="ghost" onClick={() => setSchedFor(null)}>Annuleren</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        {col.id !== "klaar" && (
                          <button onClick={() => openSchedule(r)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "linear-gradient(180deg,#4C8DFF,#3B82F6)", color: "#fff", fontFamily: "Inter", fontWeight: 600, fontSize: 12.5, boxShadow: "0 1px 6px rgba(59,130,246,0.3)" }}><Calendar size={13} /> Inplannen</button>
                        )}
                        {col.id !== "klaar" && onAddCost && (
                          <button onClick={() => setWerkbonFor(r)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "#1A2129", border: "1px solid #34D39955", color: "#34D399", fontFamily: "Inter", fontWeight: 600, fontSize: 12.5 }}><ClipboardList size={13} /> Werkbon</button>
                        )}
                        <button onClick={() => makeDossier(r)} disabled={dossierBusy === r.id} title="Schadedossier: PDF met alle gegevens en foto's, voor de verzekeraar" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "#1A2129", border: "1px solid #A855F755", color: "#C99BFF", fontFamily: "Inter", fontWeight: 600, fontSize: 12.5, opacity: dossierBusy === r.id ? 0.6 : 1 }}><FileText size={13} /> {dossierBusy === r.id ? "Bezig..." : "Dossier"}</button>
                        <button onClick={() => setMoveMenu(moveMenu === r.id ? null : r.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "#1A2129", border: "1px solid #2A3340", color: "#E7ECF3", fontFamily: "Inter", fontWeight: 600, fontSize: 12.5 }}>Verplaatsen <ChevronDown size={13} /></button>
                        {onDelete && (confirmDel === r.id ? (
                          <span className="flex items-center gap-2" style={{ marginLeft: "auto" }}><button onClick={() => { onDelete(r.id); setConfirmDel(null); }} className="text-xs px-2 py-1 rounded" style={{ color: "#fff", background: "#F0453F", fontFamily: "Inter", fontWeight: 700 }}>Verwijder</button><button onClick={() => setConfirmDel(null)} className="text-xs" style={{ color: "#B4BCC9", fontFamily: "Inter" }}>Nee</button></span>
                        ) : (
                          <button onClick={() => setConfirmDel(r.id)} className="flex items-center justify-center rounded-lg" title="Verwijderen" style={{ marginLeft: "auto", width: 30, height: 30, background: "#1A2129", border: "1px solid #2A3340", color: "#F0453F" }}><Trash2 size={14} /></button>
                        ))}
                      </div>
                    )}

                    {moveMenu === r.id && (
                      <>
                        <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setMoveMenu(null)} />
                        <div style={{ position: "absolute", left: 8, right: 8, top: "100%", marginTop: 4, zIndex: 30, background: "#12171F", border: "1px solid #232B38", borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 30px #000000AA" }}>
                          {KANBAN_COLS.filter((c) => c.id !== r.status).map((c) => (
                            <button key={c.id} onClick={() => { onMove(r.id, c.id); setMoveMenu(null); }} className="w-full text-left px-3 py-2.5" style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", borderBottom: "1px solid #1A2129" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "#1A2129")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                              Verplaats naar {c.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </Card>
                ))}
                {items.length === 0 && <div style={{ color: "#98A1B0", fontSize: 12, fontFamily: "Inter" }}>—</div>}
              </div>
            </div>
          ); })}
        </div>
      )}
      {werkbonFor && (
        <WerkbonModal report={werkbonFor} parts={parts} mechanics={mechanics} company={company} profiel={profiel} onUsePart={onUsePart}
          onClose={() => setWerkbonFor(null)}
          onComplete={(cost) => { onAddCost && onAddCost(cost); onMove(werkbonFor.id, "klaar"); const v = werkbonFor.vehicle; setToast(`Werkbon voor ${v} opgeslagen — melding op Klaar, kosten toegevoegd.`); }} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   GEBRUIKERS (admin: invite / user management)
--------------------------------------------------------------------- */

function UsersView({ users, onAdd, onResend, onDelete, currentUserId, joinCode, companyName, onCreateAccount, onInviteEmail, live }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Als de server accounts kan aanmaken, start de "account aanmaken"-modus meteen.
  const [form, setForm] = useState({ naam: "", email: "", telefoon: "", rol: "chauffeur", mode: onInviteEmail ? "emailinvite" : onCreateAccount ? "account" : "invite", wachtwoord: "" });
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelId, setConfirmDelId] = useState(null);

  const roleOptions = [
    { id: "chauffeur", label: "Chauffeur", desc: "Meldingen maken", icon: AlertTriangle },
    { id: "garage", label: "Werkplaats", desc: "Werkvloer & planning", icon: Wrench },
    { id: "admin", label: "Beheerder", desc: "Volledige toegang", icon: ShieldCheck },
  ];

  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const reset = () => { setForm({ naam: "", email: "", telefoon: "", rol: "chauffeur", mode: onInviteEmail ? "emailinvite" : onCreateAccount ? "account" : "invite", wachtwoord: "" }); setError(""); setOpen(false); };

  const submit = async () => {
    if (busy) return;
    if (!form.naam.trim()) return setError("Vul een naam in.");
    if (form.mode !== "account" && !form.email && !form.telefoon) return setError("Vul een e-mail of telefoonnummer in.");
    if (form.email && !validEmail(form.email)) return setError("Vul een geldig e-mailadres in.");
    if (users.some((u) => form.email && u.email && u.email.toLowerCase() === form.email.toLowerCase())) return setError("Er bestaat al een gebruiker met dit e-mailadres.");

    if (form.mode === "emailinvite") {
      // Uitnodiging per e-mail: account wordt aangemaakt en Supabase mailt een
      // link waarmee de medewerker zelf een wachtwoord instelt.
      if (!validEmail(form.email)) return setError("Een e-mailadres is verplicht voor een e-mailuitnodiging.");
      setError(""); setBusy(true);
      try {
        const created = await onInviteEmail({ naam: form.naam.trim(), email: form.email.trim(), rol: form.rol, telefoon: form.telefoon });
        onAdd({ id: created?.id || "u" + Date.now(), naam: form.naam.trim(), email: form.email.trim(), telefoon: form.telefoon, rol: form.rol, status: "uitgenodigd", wachtwoord: null });
        setToast(`Uitnodiging gemaild naar ${form.email}. Zodra ze een wachtwoord kiezen, kunnen ze inloggen.`);
        reset();
      } catch (e) {
        setError(e.message || "Kon de uitnodiging niet versturen.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (form.mode === "account") {
      // Echt inlogaccount aanmaken via de server (service_role).
      if (!validEmail(form.email)) return setError("Een e-mailadres is verplicht voor een inlogaccount.");
      if (form.wachtwoord.length < 6) return setError("Kies een wachtwoord van minstens 6 tekens.");
      setError(""); setBusy(true);
      try {
        const created = await onCreateAccount({ naam: form.naam.trim(), email: form.email.trim(), wachtwoord: form.wachtwoord, rol: form.rol, telefoon: form.telefoon });
        onAdd({ id: created?.id || "u" + Date.now(), naam: form.naam.trim(), email: form.email.trim(), telefoon: form.telefoon, rol: form.rol, status: "actief", wachtwoord: null });
        setToast(`${form.naam} kan nu inloggen met dit e-mailadres en wachtwoord.`);
        reset();
      } catch (e) {
        setError(e.message || "Kon het account niet aanmaken.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (form.mode === "direct") {
      if (form.wachtwoord.length < 6) return setError("Kies een wachtwoord van minstens 6 tekens.");
      onAdd({ id: "u" + Date.now(), naam: form.naam.trim(), email: form.email, telefoon: form.telefoon, rol: form.rol, status: "actief", wachtwoord: form.wachtwoord });
      setToast(`${form.naam} is toegevoegd.`);
    } else {
      onAdd({ id: "u" + Date.now(), naam: form.naam.trim(), email: form.email, telefoon: form.telefoon, rol: form.rol, status: "uitgenodigd", wachtwoord: null });
      setToast(`Uitnodiging verstuurd naar ${form.naam} via ${form.email ? "e-mail" : "sms"} (gesimuleerd).`);
    }
    reset();
  };

  const activeCount = users.filter((u) => u.status === "actief").length;
  const invitedCount = users.filter((u) => u.status !== "actief").length;

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Users size={22} color="#3B82F6" /> Gebruikers</h1>
          <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>{activeCount} actief · {invitedCount} uitgenodigd</p>
        </div>
        {!open && <Button icon={Plus} onClick={() => setOpen(true)}>Nieuwe gebruiker</Button>}
      </div>

      {joinCode && (
        <Card className="p-4" style={{ border: "1px solid #3B82F633", background: "linear-gradient(180deg,#12233E,#0F1826)" }}>
          <div className="flex items-start gap-3">
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "#3B82F622", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <KeyRound size={18} color="#3B82F6" />
            </div>
            <div className="min-w-0 flex-1">
              <div style={{ fontFamily: "Oswald", fontSize: 16, fontWeight: 600, color: "#E7ECF3" }}>Medewerkers laten meedoen</div>
              <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 13, marginTop: 2, lineHeight: 1.5 }}>
                Deel deze code met je chauffeurs en monteurs. Ze openen de app, kiezen <b>"Meedoen met een bedrijfscode"</b> en maken hun eigen login voor {companyName}.
              </p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, letterSpacing: 4, color: "#E7ECF3", background: "#0A0E14", border: "1px solid #2A3340", borderRadius: 8, padding: "6px 14px" }}>{joinCode}</span>
                <button onClick={() => { try { navigator.clipboard?.writeText(joinCode); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} }}
                  className="text-sm px-3 py-2 rounded-lg" style={{ background: "#3B82F6", color: "#fff", fontFamily: "Inter", fontWeight: 600 }}>
                  {copied ? "Gekopieerd ✓" : "Kopieer code"}
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {open && (
        <Card className="p-5 space-y-4">
          <div style={{ fontFamily: "Oswald", fontSize: 18, fontWeight: 600, color: "#E7ECF3" }}>Nieuwe gebruiker</div>

          {/* Role picker */}
          <div>
            <FieldLabel>Rol</FieldLabel>
            <div className="grid gap-2" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(3, minmax(0,1fr))" }}>
              {roleOptions.map((r) => {
                const active = form.rol === r.id;
                return (
                  <button key={r.id} onClick={() => setForm({ ...form, rol: r.id })} className="flex items-center gap-2 p-3 rounded-lg text-left"
                    style={{ background: active ? "#3B82F618" : "#1A2129", border: `1px solid ${active ? "#3B82F6" : "#232B38"}` }}>
                    <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 8, background: active ? "#3B82F6" : "#12171F", flexShrink: 0 }}>
                      <r.icon size={17} color={active ? "#FFFFFF" : "#B4BCC9"} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, color: "#E7ECF3" }}>{r.label}</div>
                      <div style={{ fontFamily: "Inter", fontSize: 11, color: "#B4BCC9" }}>{r.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(3, minmax(0,1fr))" }}>
            <div><FieldLabel>Naam *</FieldLabel><input placeholder="Voor- en achternaam" value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} className="tg-input" style={{ width: "100%" }} /></div>
            <div><FieldLabel>E-mail</FieldLabel><input placeholder="naam@bedrijf.nl" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="tg-input" style={{ width: "100%" }} /></div>
            <div><FieldLabel>Telefoon</FieldLabel><input placeholder="+31 6 ..." value={form.telefoon} onChange={(e) => setForm({ ...form, telefoon: e.target.value })} className="tg-input" style={{ width: "100%" }} /></div>
          </div>

          {/* Toegang: echt account aanmaken (server) of uitnodigen.
             We tonen de keuzeknoppen alleen als er echt iets te kiezen valt —
             anders stond er een losse "Uitnodiging sturen"-knop boven de
             verstuurknop, wat als dubbel overkwam. */}
          {(() => {
            const opts = onCreateAccount
              ? [
                  ...(onInviteEmail ? [{ v: "emailinvite", t: "Uitnodigen via e-mail" }] : []),
                  { v: "account", t: "Inlogaccount aanmaken" },
                  { v: "invite", t: "Uitnodigen via code" },
                ]
              : live
                ? [{ v: "invite", t: "Uitnodigen via code" }]
                : [{ v: "invite", t: "Uitnodiging sturen" }, { v: "direct", t: "Direct actief" }];
            if (opts.length < 2) return null;
            return (
          <div>
            <FieldLabel>Toegang</FieldLabel>
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #232B38" }}>
              {opts.map((o) => (
                <button key={o.v} onClick={() => setForm({ ...form, mode: o.v })} className="flex-1 py-2.5 text-xs" style={{ fontFamily: "Inter", fontWeight: 600, background: form.mode === o.v ? "#1A2129" : "transparent", color: form.mode === o.v ? "#3B82F6" : "#B4BCC9" }}>{o.t}</button>
              ))}
            </div>
            <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0", marginTop: 6 }}>
              {form.mode === "emailinvite" ? "De medewerker krijgt een e-mail met een link om zelf een wachtwoord te kiezen en meteen in te loggen." : form.mode === "account" ? "Je maakt nu een echt inlogaccount aan. De medewerker logt direct in met dit e-mailadres en wachtwoord." : form.mode === "invite" ? "De medewerker maakt zelf een login met de bedrijfscode (hierboven)." : "Je stelt nu een wachtwoord in; de gebruiker kan meteen inloggen."}
            </div>
          </div>
            );
          })()}

          {(form.mode === "direct" || form.mode === "account") && (
            <div><FieldLabel>Wachtwoord *</FieldLabel><input type="password" placeholder={form.mode === "account" ? "Minstens 6 tekens" : "Minstens 6 tekens"} value={form.wachtwoord} onChange={(e) => setForm({ ...form, wachtwoord: e.target.value })} className="tg-input" style={{ width: isMobile ? "100%" : "50%" }} /></div>
          )}

          {error && <div style={{ color: "#F0453F", fontFamily: "Inter", fontSize: 12.5 }}>{error}</div>}

          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy} icon={form.mode === "invite" || form.mode === "emailinvite" ? Send : ShieldCheck}>{busy ? "Bezig..." : form.mode === "account" ? "Account aanmaken" : form.mode === "direct" ? "Toevoegen" : form.mode === "emailinvite" ? "E-mailuitnodiging versturen" : "Uitnodiging versturen"}</Button>
            <Button variant="ghost" onClick={reset} disabled={busy}>Annuleren</Button>
          </div>
        </Card>
      )}

      {isMobile ? (
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id} className="p-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <span style={{ fontFamily: "Inter", color: "#E7ECF3", fontWeight: 600, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.naam}</span>
                <span className="text-xs px-2 py-0.5 rounded" style={{ color: u.status === "actief" ? "#34D399" : "#FF8A00", border: `1px solid ${u.status === "actief" ? "#34D399" : "#FF8A00"}55`, fontWeight: 600, flexShrink: 0 }}>{u.status === "actief" ? "Actief" : "Uitgenodigd"}</span>
              </div>
              {u.email && <div className="flex items-center gap-1.5" style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 12.5 }}><Mail size={12} style={{ flexShrink: 0 }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span></div>}
              {u.telefoon && <div className="flex items-center gap-1.5 mt-0.5" style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 12.5 }}><Phone size={12} style={{ flexShrink: 0 }} />{u.telefoon}</div>}
              <div className="flex items-center justify-between mt-2 pt-2 gap-2" style={{ borderTop: "1px solid #1A2129" }}>
                <span className="text-xs px-2 py-0.5 rounded" style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 12, background: "#1A2129" }}>{ROLE_LABEL[u.rol]}</span>
                <div className="flex items-center gap-3">
                  {u.status !== "actief" && <button onClick={() => { onResend(u); setToast(joinCode ? `Deel de bedrijfscode ${joinCode} met ${u.naam} om mee te doen.` : `Herinner ${u.naam} eraan mee te doen.`); }} className="text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>Bedrijfscode delen</button>}
                  {u.id !== currentUserId && (
                    confirmDelId === u.id
                      ? <span className="flex items-center gap-2"><button onClick={() => { onDelete(u.id); setToast(`${u.naam} verwijderd.`); setConfirmDelId(null); }} className="text-xs" style={{ color: "#F0453F", fontFamily: "Inter", fontWeight: 700 }}>Bevestig</button><button onClick={() => setConfirmDelId(null)} className="text-xs" style={{ color: "#B4BCC9", fontFamily: "Inter" }}>Nee</button></span>
                      : <button onClick={() => setConfirmDelId(u.id)} className="flex items-center gap-1 text-xs" style={{ color: "#F0453F", fontFamily: "Inter", fontWeight: 600 }}><Trash2 size={12} /> Verwijderen</button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "Inter", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: "1px solid #232B38" }}>{["Naam", "Contact", "Rol", "Status", ""].map((h) => <th key={h} className="text-left px-4 py-3" style={{ color: "#B4BCC9", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #1A2129" }}>
                  <td className="px-4 py-3" style={{ color: "#E7ECF3", fontWeight: 500 }}>{u.naam}</td>
                  <td className="px-4 py-3" style={{ color: "#B4BCC9" }}>
                    <div className="flex items-center gap-1.5">{u.email && <><Mail size={12} />{u.email}</>}</div>
                    <div className="flex items-center gap-1.5">{u.telefoon && <><Phone size={12} />{u.telefoon}</>}</div>
                  </td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded" style={{ color: "#B4BCC9", background: "#1A2129" }}>{ROLE_LABEL[u.rol]}</span></td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded" style={{ color: u.status === "actief" ? "#34D399" : "#FF8A00", border: `1px solid ${u.status === "actief" ? "#34D399" : "#FF8A00"}55`, fontWeight: 600 }}>{u.status === "actief" ? "Actief" : "Uitgenodigd"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {u.status !== "actief" && <button onClick={() => { onResend(u); setToast(joinCode ? `Deel de bedrijfscode ${joinCode} met ${u.naam} om mee te doen.` : `Herinner ${u.naam} eraan mee te doen.`); }} className="text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>Bedrijfscode delen</button>}
                      {u.id !== currentUserId && (
                        confirmDelId === u.id
                          ? <span className="flex items-center gap-2"><button onClick={() => { onDelete(u.id); setToast(`${u.naam} verwijderd.`); setConfirmDelId(null); }} className="text-xs" style={{ color: "#F0453F", fontFamily: "Inter", fontWeight: 700 }}>Bevestig</button><button onClick={() => setConfirmDelId(null)} className="text-xs" style={{ color: "#B4BCC9", fontFamily: "Inter" }}>Nee</button></span>
                          : <button onClick={() => setConfirmDelId(u.id)} className="flex items-center gap-1 text-xs" style={{ color: "#F0453F", fontFamily: "Inter", fontWeight: 600 }}><Trash2 size={12} /> Verwijderen</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   INSTELLINGEN — werkplaatstijden + beschikbaarheid per monteur
--------------------------------------------------------------------- */

// Abonnementskaart: toont wanneer het abonnement is gestart en verlengt, of het
// gratis is, en laat de beheerder opzeggen (blijft werken tot de verlengdatum).
function SubscriptionCard({ subscription, onCancel, onReactivate }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState("");
  const s = subscription || {};
  const fmt = (d) => (d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "—");
  const free = s.plan_paid === false;
  const cancelled = !!s.cancelled;
  const run = async (fn) => { setErr(""); setBusy(true); try { await fn(); setConfirm(false); } catch (e) { setErr(e?.message || "Er ging iets mis."); } finally { setBusy(false); } };
  const badge = (txt, c) => <span className="text-xs px-2 py-0.5 rounded" style={{ color: c, border: `1px solid ${c}55`, fontWeight: 600 }}>{txt}</span>;
  const row = (k, v) => <div className="flex items-center justify-between" style={{ fontFamily: "Inter", fontSize: 13, padding: "5px 0" }}><span style={{ color: "#98A1B0" }}>{k}</span><span style={{ color: "#E7ECF3", fontWeight: 600 }}>{v}</span></div>;

  return (
    <Card className="p-5" style={{ border: "1px solid #232B38" }}>
      <div className="flex items-center justify-between">
        <Eyebrow>Abonnement</Eyebrow>
        {free ? badge("Gratis", "#34D399") : cancelled ? badge("Opgezegd", "#F59E0B") : badge("Actief", "#3B82F6")}
      </div>

      {free ? (
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", marginTop: 10, lineHeight: 1.5 }}>
          Dit is een <b style={{ color: "#E7ECF3" }}>gratis account</b>, geactiveerd door Truck &amp; Trailer. Je betaalt niets voor de app.
          {s.sub_created_at && <div style={{ marginTop: 8 }}>{row("Gestart op", fmt(s.sub_created_at))}</div>}
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {row("Gestart op", fmt(s.sub_created_at))}
          {cancelled
            ? row("Toegang tot", fmt(s.cancel_at))
            : row("Verlengt automatisch op", fmt(s.renews_at))}
          {cancelled ? (
            <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#F59E0B", marginTop: 8, lineHeight: 1.5 }}>
              Opgezegd. Je kunt de app nog gebruiken tot <b>{fmt(s.cancel_at)}</b>; daarna stopt de toegang.
            </div>
          ) : null}
          {err && <div style={{ color: "#F0453F", fontFamily: "Inter", fontSize: 12.5, marginTop: 8 }}>{err}</div>}

          {/* Alleen de beheerder kan op-/heractiveren (onCancel/onReactivate gezet). */}
          {cancelled && onReactivate && (
            <div style={{ marginTop: 12 }}><Button variant="ghost" onClick={() => run(onReactivate)} disabled={busy}>{busy ? "Bezig…" : "Toch doorgaan (heractiveren)"}</Button></div>
          )}
          {!cancelled && onCancel && (
            <div style={{ marginTop: 12 }}>
              {confirm ? (
                <span className="flex items-center gap-2 flex-wrap">
                  <Button variant="danger" onClick={() => run(onCancel)} disabled={busy}>{busy ? "Bezig…" : "Ja, opzeggen"}</Button>
                  <Button variant="ghost" onClick={() => setConfirm(false)}>Annuleren</Button>
                  <span style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0" }}>Je houdt toegang tot {fmt(s.renews_at)}.</span>
                </span>
              ) : (
                <Button variant="ghost" onClick={() => setConfirm(true)}>Abonnement opzeggen</Button>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Bedrijf meldt een probleem bij de platformbeheerder en ziet zijn eigen
// eerdere meldingen met status. Werkt alleen live (Supabase gekoppeld).
function CompanySupportCard() {
  const [onderwerp, setOnderwerp] = useState("");
  const [bericht, setBericht] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [mine, setMine] = useState([]);

  const load = async () => { try { setMine(await mySupportTickets()); } catch { /* stil */ } };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setErr(""); setMsg("");
    if (!bericht.trim()) return setErr("Beschrijf kort je probleem of vraag.");
    setBusy(true);
    try {
      await createSupportTicket({ onderwerp, bericht });
      setOnderwerp(""); setBericht("");
      setMsg("Verstuurd! We hebben je melding ontvangen.");
      load();
    } catch (e) {
      setErr(e?.message || "Versturen mislukt. Probeer het later opnieuw.");
    } finally { setBusy(false); }
  };

  return (
    <Card className="p-5" style={{ border: "1px solid #232B38" }}>
      <Eyebrow>Probleem of vraag melden</Eyebrow>
      <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", margin: "6px 0 12px", lineHeight: 1.5 }}>
        Loop je ergens tegenaan of heb je een vraag? Stuur het rechtstreeks naar de makers van Truck &amp; Trailer. Je krijgt zo snel mogelijk antwoord.
      </div>
      <div className="space-y-2.5">
        <input className="tg-input w-full" placeholder="Onderwerp (bv. Inloggen lukt niet)" value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} />
        <textarea className="tg-input w-full" style={{ minHeight: 90, resize: "vertical", fontFamily: "Inter" }} placeholder="Beschrijf je probleem of vraag…" value={bericht} onChange={(e) => setBericht(e.target.value)} />
        {err && <div style={{ color: "#F0453F", fontFamily: "Inter", fontSize: 12.5 }}>{err}</div>}
        {msg && <div style={{ color: "#34D399", fontFamily: "Inter", fontSize: 12.5 }}>{msg}</div>}
        <Button icon={LifeBuoy} onClick={submit} disabled={busy}>{busy ? "Versturen…" : "Melding versturen"}</Button>
      </div>
      {mine.length > 0 && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid #1A2129" }}>
          <div style={{ fontFamily: "Inter", fontSize: 12, fontWeight: 700, color: "#98A1B0", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Jouw eerdere meldingen</div>
          <div className="space-y-2">
            {mine.map((t) => {
              const meta = TICKET_STATUS[t.status] || TICKET_STATUS.open;
              return (
                <div key={t.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg" style={{ background: "#161C25", border: "1px solid #232B38" }}>
                  <span style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.onderwerp || "Probleemmelding"}</span>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ color: meta.color, border: `1px solid ${meta.color}55`, fontWeight: 600, flexShrink: 0 }}>{meta.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function DeviceNotificationsCard() {
  const [status, setStatus] = useState(() => (notifySupported() ? Notification.permission : "unsupported"));
  const [err, setErr] = useState("");
  // Echte push (ook als de app dicht is).
  const [pushState, setPushState] = useState("checking"); // checking | off | on | unavailable | busy
  const [pushErr, setPushErr] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!pushSupported()) { if (alive) setPushState("unavailable"); return; }
      const cfg = await getPushConfig();
      if (!alive) return;
      if (!cfg.enabled) { setPushState("unavailable"); return; }
      setPushState((await isPushSubscribed()) ? "on" : "off");
    })();
    return () => { alive = false; };
  }, []);
  const enable = async () => {
    setErr("");
    try {
      const p = await enableDeviceNotifications();
      setStatus(p);
      if (p === "granted") { try { new Notification("Truck & Trailer", { body: "Meldingen staan aan op dit apparaat.", icon: "/icon-192.png" }); } catch {} }
    } catch (e) { setErr(e.message || "Kon meldingen niet aanzetten."); }
  };
  const enablePush = async () => {
    setPushErr(""); setPushState("busy");
    try { await subscribeToPush(); setPushState("on"); }
    catch (e) { setPushErr(e.message || "Kon push niet aanzetten."); setPushState("off"); }
  };
  const disablePush = async () => {
    setPushState("busy");
    try { await unsubscribeFromPush(); } catch { /* stil */ }
    setPushState("off");
  };
  return (
    <Card className="p-5">
      <Eyebrow><span className="inline-flex items-center gap-1.5"><Bell size={13} color="#3B82F6" /> Meldingen op dit apparaat</span></Eyebrow>
      <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", margin: "6px 0 12px", lineHeight: 1.5 }}>
        Krijg een melding op dit apparaat bij een nieuwe melding op de werkvloer (werkt terwijl de app open of op de achtergrond staat). Zet dit op elke telefoon/computer los aan.
      </div>
      {status === "unsupported" ? (
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0" }}>Dit apparaat/deze browser ondersteunt geen meldingen.</div>
      ) : status === "granted" ? (
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#12271C", border: "1px solid #34D39955", color: "#34D399", fontFamily: "Inter", fontSize: 12.5, fontWeight: 600 }}><Check size={14} /> Meldingen staan aan op dit apparaat.</div>
      ) : status === "denied" ? (
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#FF8A00" }}>Meldingen zijn geblokkeerd. Zet ze aan bij de site-instellingen van je browser/telefoon en probeer opnieuw.</div>
      ) : (
        <Button small icon={Bell} onClick={enable}>Meldingen aanzetten</Button>
      )}
      {err && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#F0453F", marginTop: 8 }}>{err}</div>}

      {/* Echte push — ook als de app volledig gesloten is */}
      {pushState !== "unavailable" && pushState !== "checking" && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #1A2129" }}>
          <div style={{ fontFamily: "Inter", fontSize: 12.5, fontWeight: 600, color: "#E7ECF3" }}>Push-meldingen (ook als de app dicht is)</div>
          <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0", margin: "3px 0 10px", lineHeight: 1.5 }}>Ontvang direct een pushbericht bij een nieuwe chauffeursmelding, zelfs als je de app hebt afgesloten.</div>
          {pushState === "on" ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#12271C", border: "1px solid #34D39955", color: "#34D399", fontFamily: "Inter", fontSize: 12.5, fontWeight: 600 }}><Check size={14} /> Push staat aan</span>
              <button onClick={disablePush} style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9", textDecoration: "underline" }}>Uitzetten</button>
            </div>
          ) : (
            <Button small icon={BellRing} onClick={enablePush} disabled={pushState === "busy"}>{pushState === "busy" ? "Bezig…" : "Push aanzetten"}</Button>
          )}
          {pushErr && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#F0453F", marginTop: 8 }}>{pushErr}</div>}
        </div>
      )}
    </Card>
  );
}

// Bedrijfsgegevens + logo. Deze verschijnen op de werkbon/factuur zodat elk
// bedrijf op zijn eigen naam factureert. Het logo wordt verkleind naar een
// compacte data-URI en meebewaard in de dataset (geen aparte opslag nodig).
function CompanyProfileCard({ profiel = {}, onSave, companyName = "", onToast }) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState({
    bedrijfsnaam: profiel.bedrijfsnaam || companyName || "",
    adres: profiel.adres || "", postcode: profiel.postcode || "", plaats: profiel.plaats || "",
    telefoon: profiel.telefoon || "", email: profiel.email || "", website: profiel.website || "",
    kvk: profiel.kvk || "", btw: profiel.btw || "", iban: profiel.iban || "",
    btwPercentage: profiel.btwPercentage != null ? String(profiel.btwPercentage) : "21",
    uurtarief: profiel.uurtarief != null && profiel.uurtarief !== "" ? String(profiel.uurtarief) : "",
    logo: profiel.logo || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Logo inlezen en verkleinen (max 320px breed) tot een lichte PNG data-URI.
  const pickLogo = (files) => {
    const file = files && files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { setErr("Kies een afbeelding (PNG of JPG)."); return; }
    setErr("");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 320;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        try { set("logo", canvas.toDataURL("image/png")); } catch { setErr("Kon het logo niet verwerken."); }
      };
      img.onerror = () => setErr("Kon de afbeelding niet laden.");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const save = () => {
    setBusy(true);
    const clean = { ...form, btwPercentage: Math.max(0, Math.min(100, Number(form.btwPercentage) || 0)), uurtarief: form.uurtarief === "" ? "" : Math.max(0, Number(form.uurtarief) || 0) };
    onSave(clean);
    setBusy(false);
    onToast && onToast("Bedrijfsgegevens opgeslagen.");
  };

  // Let op: dit is een gewone render-helper (géén component), zodat de inputs
  // niet remounten en de focus niet verliezen bij elke toetsaanslag.
  const f = (label, k, { placeholder = "", type = "text", full = false } = {}) => (
    <div key={k} style={full ? { gridColumn: "1 / -1" } : undefined}>
      <FieldLabel>{label}</FieldLabel>
      <input className="tg-input" type={type} value={form[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <Card className="p-5">
      <Eyebrow><span className="inline-flex items-center gap-1.5"><Building2 size={13} color="#3B82F6" /> Bedrijfsgegevens & logo</span></Eyebrow>
      <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", margin: "6px 0 12px", lineHeight: 1.5 }}>
        Deze gegevens komen bovenaan je werkbon/factuur te staan — op je eigen naam en met je eigen logo.
      </div>

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center justify-center rounded-lg" style={{ width: 88, height: 88, background: "#12171F", border: "1px solid #232B38", overflow: "hidden", flexShrink: 0 }}>
          {form.logo ? <img src={form.logo} alt="logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <Building2 size={26} color="#3A4252" />}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickLogo(e.target.files)} />
          <Button small icon={Plus} onClick={() => fileRef.current?.click()}>{form.logo ? "Logo vervangen" : "Logo uploaden"}</Button>
          {form.logo && <button onClick={() => set("logo", "")} style={{ fontFamily: "Inter", fontSize: 12, color: "#F0453F" }}>Logo verwijderen</button>}
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)" }}>
        {f("Bedrijfsnaam", "bedrijfsnaam", { full: true })}
        {f("Adres", "adres", { placeholder: "Straat en huisnummer", full: true })}
        {f("Postcode", "postcode")}
        {f("Plaats", "plaats")}
        {f("Telefoon", "telefoon")}
        {f("E-mail", "email", { type: "email" })}
        {f("Website", "website", { placeholder: "www.jouwbedrijf.nl" })}
        {f("KvK-nummer", "kvk")}
        {f("BTW-nummer", "btw", { placeholder: "NL0000.00.000.B00" })}
        {f("IBAN", "iban", { placeholder: "NL00 BANK 0000 0000 00" })}
        <div>
          <FieldLabel>BTW-percentage (%)</FieldLabel>
          <input className="tg-input" type="number" inputMode="numeric" value={form.btwPercentage} onChange={(e) => set("btwPercentage", e.target.value)} placeholder="21" />
        </div>
        <div>
          <FieldLabel>Standaard uurtarief werkplaats (€)</FieldLabel>
          <input className="tg-input" type="number" inputMode="numeric" value={form.uurtarief} onChange={(e) => set("uurtarief", e.target.value)} placeholder="Bv. 65" />
        </div>
      </div>
      {err && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#F0453F", marginTop: 8 }}>{err}</div>}
      <div className="mt-4"><Button icon={Check} onClick={save} disabled={busy}>Opslaan</Button></div>
    </Card>
  );
}

function SettingsView({ mechanics, availability, hours, onSetMechanicWeek, onSetHours, onLoadSample, onClearData, hasData, modules, onSetModule, live, onReplayTutorial, subscription, onCancelSub, onReactivateSub, profiel = {}, onSaveProfiel = null, companyName = "" }) {
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState(mechanics[0]?.id || "");
  const [toast, setToast] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const selected = mechanics.find((m) => m.id === selectedId);
  const week = (availability[selectedId]) || defaultWeek();

  const updateDay = (dayKey, patch) => {
    onSetMechanicWeek(selectedId, { ...week, [dayKey]: { ...week[dayKey], ...patch } });
  };

  const applyToAllWeekdays = () => {
    const ref = week.ma;
    const next = { ...week };
    ["di", "wo", "do", "vr"].forEach((k) => { next[k] = { ...ref }; });
    onSetMechanicWeek(selectedId, next);
    setToast("Ma-tijden toegepast op alle werkdagen.");
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
      <div>
        <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><SlidersHorizontal size={22} color="#3B82F6" /> Instellingen</h1>
        <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Werkplaatstijden en beschikbaarheid van monteurs.</p>
        {live && onReplayTutorial && (
          <button onClick={onReplayTutorial} className="mt-2 inline-flex items-center gap-1.5 text-xs" style={{ color: "#8FB8FF", fontFamily: "Inter", fontWeight: 600 }}>
            <LifeBuoy size={13} /> Uitleg opnieuw bekijken
          </button>
        )}
      </div>

      <div className="tg-cols">
      {/* Bedrijfsgegevens & logo — komt terug op de werkbon/factuur (alleen beheerder). */}
      {onSaveProfiel && <CompanyProfileCard profiel={profiel} onSave={onSaveProfiel} companyName={companyName} onToast={setToast} />}

      {/* Abonnement — gestart/verlengt, gratis, en opzeggen (blijft tot verlengdatum). */}
      {live && subscription && <SubscriptionCard subscription={subscription} onCancel={onCancelSub} onReactivate={onReactivateSub} />}

      {/* Modules aan/uit — kies wat je bedrijf gebruikt. Uit = weg uit het menu. */}
      {onSetModule && (
        <Card className="p-5">
          <Eyebrow>Onderdelen die je gebruikt</Eyebrow>
          <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", margin: "6px 0 12px", lineHeight: 1.5 }}>
            Zet uit wat je niet nodig hebt — het verdwijnt dan uit je menu. Je kunt dit hier altijd weer aanzetten.
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)" }}>
            {MODULE_DEFS.map((m) => {
              const on = modOn(modules, m.key);
              return (
                <button key={m.key} onClick={() => onSetModule(m.key, !on)} className="flex items-center gap-3 p-3 rounded-lg text-left" style={{ background: "#161C25", border: `1px solid ${on ? "#3B82F655" : "#232B38"}`, opacity: on ? 1 : 0.7 }}>
                  <span className="rounded-full flex items-center" style={{ width: 34, height: 20, background: on ? "#3B82F6" : "#2A3340", padding: 2, flexShrink: 0, transition: "background .2s" }}>
                    <span className="rounded-full" style={{ width: 16, height: 16, background: "#fff", transform: on ? "translateX(14px)" : "translateX(0)", transition: "transform .2s" }} />
                  </span>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: "#12171F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><m.icon size={15} color={on ? "#3B82F6" : "#98A1B0"} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, color: "#E7ECF3" }}>{m.label}</span>
                    <span style={{ display: "block", fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Probleem melden bij de platformbeheerder (Truck & Trailer). */}
      {live && <CompanySupportCard />}

      {/* Testomgeving — voorbeelddata laden of alles wissen (alleen beheerder) */}
      {(onLoadSample || onClearData) && (
        <Card className="p-5" style={{ border: "1px solid #232B38" }}>
          <Eyebrow>Testomgeving</Eyebrow>
          <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", margin: "6px 0 12px", lineHeight: 1.5 }}>
            Vul de omgeving met voorbeelddata om alles uit te proberen, of wis alle data weer voordat je echt van start gaat. Dit raakt alleen voertuigen, meldingen, planning, onderhoud, voorraad en kosten — je gebruikers en instellingen blijven staan.
          </div>
          <div className="flex flex-wrap gap-2">
            {onLoadSample && <Button icon={Sparkles} onClick={() => { onLoadSample(); setToast("Voorbeelddata geladen."); }}>Voorbeelddata laden</Button>}
            {onClearData && (confirmClear ? (
              <span className="flex items-center gap-2">
                <Button variant="danger" onClick={() => { onClearData(); setConfirmClear(false); setToast("Voorbeelddata / alle data gewist."); }}>Ja, alles wissen</Button>
                <Button variant="ghost" onClick={() => setConfirmClear(false)}>Annuleren</Button>
              </span>
            ) : (
              <Button variant="ghost" icon={Trash2} onClick={() => setConfirmClear(true)} disabled={!hasData}>Voorbeelddata / alle data wissen</Button>
            ))}
          </div>
          {!hasData && <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#6B7585", marginTop: 8 }}>Er is nu geen data om te wissen.</div>}
        </Card>
      )}

      {/* Workshop hours */}
      <Card className="p-5">
        <Eyebrow>Openingstijden werkplaats</Eyebrow>
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", marginBottom: 12 }}>Buiten deze tijden waarschuwt de app bij het inplannen.</div>
        <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr) minmax(0,1fr)" : "180px 180px" }}>
          <div style={{ minWidth: 0 }}><FieldLabel>Open vanaf</FieldLabel><input type="time" className="tg-input" value={hours.van} onChange={(e) => onSetHours({ ...hours, van: e.target.value })} /></div>
          <div style={{ minWidth: 0 }}><FieldLabel>Sluit om</FieldLabel><input type="time" className="tg-input" value={hours.tot} onChange={(e) => onSetHours({ ...hours, tot: e.target.value })} /></div>
        </div>
      </Card>

      {/* Waarschuwingstermijn — hoeveel maanden vooraf je gewaarschuwd wordt voor
          aflopende APK, Code 95, rijbewijs, verzekering, ADR, medische keuring. */}
      <Card className="p-5">
        <Eyebrow><span className="inline-flex items-center gap-1.5"><BellRing size={13} color="#FF8A00" /> Waarschuwingstermijn</span></Eyebrow>
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", margin: "6px 0 12px", lineHeight: 1.5 }}>
          Hoeveel maanden van tevoren wil je een waarschuwing zien voor aflopende APK, Code 95, rijbewijs, verzekering, ADR en medische keuring?
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select className="tg-input" style={{ width: 160 }} value={String(hours.warnMonths ?? 1)} onChange={(e) => onSetHours({ ...hours, warnMonths: Number(e.target.value) })}>
            {[1, 2, 3, 4, 6].map((m) => <option key={m} value={m}>{m} {m === 1 ? "maand" : "maanden"} vooraf</option>)}
          </select>
          <span style={{ fontFamily: "Inter", fontSize: 12, color: "#98A1B0" }}>Standaard: 1 maand.</span>
        </div>
      </Card>

      {/* Meldingen op dit apparaat (browser/PWA) */}
      <DeviceNotificationsCard />


      {/* Mechanic availability */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <Eyebrow>Beschikbaarheid monteur</Eyebrow>
        </div>

        {mechanics.length === 0 ? (
          <div style={{ fontFamily: "Inter", fontSize: 13, color: "#B4BCC9" }}>Nog geen monteurs. Voeg via Gebruikers iemand met de rol Werkplaats toe.</div>
        ) : (
          <>
            {/* Mechanic picker */}
            <div className="flex flex-wrap gap-2 mb-4">
              {mechanics.map((m) => (
                <button key={m.id} onClick={() => setSelectedId(m.id)} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: selectedId === m.id ? "#3B82F618" : "#161C25", border: `1px solid ${selectedId === m.id ? "#3B82F6" : "#2A3340"}` }}>
                  <div className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: "50%", background: "#3B82F633", flexShrink: 0 }}>
                    <span style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 700, fontSize: 10 }}>{m.naam.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
                  </div>
                  <span style={{ fontFamily: "Inter", fontSize: 13, fontWeight: 600, color: selectedId === m.id ? "#E7ECF3" : "#C4CBD6" }}>{m.naam}</span>
                </button>
              ))}
            </div>

            {selected && (
              <div className="space-y-2">
                {WEEKDAYS.map((wd) => {
                  const day = week[wd.key] || { on: false, van: "08:00", tot: "17:00" };
                  return (
                    <div key={wd.key} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: "#161C25", border: "1px solid #232B38", opacity: day.on ? 1 : 0.6 }}>
                      {/* toggle */}
                      <button onClick={() => updateDay(wd.key, { on: !day.on })} className="flex items-center gap-2" style={{ minWidth: isMobile ? 88 : 110, flexShrink: 0 }}>
                        <span className="rounded-full flex items-center" style={{ width: 34, height: 20, background: day.on ? "#3B82F6" : "#2A3340", padding: 2, transition: "background .2s" }}>
                          <span className="rounded-full" style={{ width: 16, height: 16, background: "#fff", transform: day.on ? "translateX(14px)" : "translateX(0)", transition: "transform .2s" }} />
                        </span>
                        <span style={{ fontFamily: "Inter", fontSize: 13, fontWeight: 600, color: "#E7ECF3" }}>{isMobile ? wd.label.slice(0, 2) : wd.label}</span>
                      </button>

                      {day.on ? (
                        <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0 }}>
                          <input type="time" className="tg-input" style={{ flex: 1, minWidth: 0, textAlign: "center", padding: "8px 6px" }} value={day.van} onChange={(e) => updateDay(wd.key, { van: e.target.value })} />
                          <span style={{ color: "#98A1B0", flexShrink: 0 }}>–</span>
                          <input type="time" className="tg-input" style={{ flex: 1, minWidth: 0, textAlign: "center", padding: "8px 6px" }} value={day.tot} onChange={(e) => updateDay(wd.key, { tot: e.target.value })} />
                        </div>
                      ) : (
                        <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0", flex: 1 }}>Niet beschikbaar</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   AI ASSISTENT — echte Claude API call over de meldingen van dit bedrijf
--------------------------------------------------------------------- */

function AiAssistantView({ reports, vehicles, company, aiReady, onAddVehicle, onAddPlanning, onNavigate }) {
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState([
    { role: "assistant", content: `Hoi, ik ben de AI-assistent voor ${company.name}. Ik kan meedenken én dingen voor je regelen. Bijvoorbeeld:\n• "Welke meldingen gaan over remmen?"\n• "Plan een reparatie voor VX-77-KL morgen om 9:00"\n• "Voeg voertuig 68-BVG-4, DAF XF, bouwjaar 2023 toe"` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const runAction = (action) => {
    try {
      if (action.type === "add_vehicle" && action.kenteken) {
        onAddVehicle({
          id: "v" + Date.now(), kenteken: String(action.kenteken).toUpperCase(),
          merk: action.merk || "Onbekend", type: action.voertuigtype || "Truck",
          bouwjaar: Number(action.bouwjaar) || new Date().getFullYear(),
          km: Number(action.km) || 0, status: "operational", health: 100, driver: "—",
        });
        return `✓ Voertuig ${String(action.kenteken).toUpperCase()} toegevoegd aan de vloot.`;
      }
      if (action.type === "schedule_repair" && action.kenteken) {
        onAddPlanning({
          id: "pl" + Date.now(), vehicle: String(action.kenteken).toUpperCase(),
          datum: action.datum || TODAY, tijd: action.tijd || "09:00",
          duur: Number(action.duur) || 60, taak: action.taak || "Reparatie", monteur: action.monteur || "—",
        });
        return `✓ ${action.taak || "Reparatie"} ingepland voor ${String(action.kenteken).toUpperCase()} op ${action.datum || TODAY} om ${action.tijd || "09:00"}.`;
      }
    } catch (e) { return `Kon actie niet uitvoeren: ${e.message}`; }
    return null;
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const instructions = `Je bent de AI-assistent voor de truck-garage app van ${company.name}. Je kunt vragen beantwoorden EN acties uitvoeren.

Als de gebruiker om een actie vraagt, antwoord dan met een kort JSON-blok op een aparte regel tussen <actie> en </actie>, gevolgd door een korte bevestiging in gewone taal. Ondersteunde acties:
- Voertuig toevoegen: {"type":"add_vehicle","kenteken":"68-BVG-4","merk":"DAF XF","voertuigtype":"Truck","bouwjaar":2023}
- Reparatie inplannen: {"type":"schedule_repair","kenteken":"VX-77-KL","taak":"Remmen vervangen","datum":"2026-07-05","tijd":"09:00","duur":90}

Gebruik datum-formaat JJJJ-MM-DD. Vandaag is ${TODAY}. Als er geen datum genoemd is, gebruik vandaag. Verzin geen data die je niet hebt; vraag door als iets ontbreekt. Voor gewone vragen antwoord je kort en concreet in het Nederlands zonder <actie>-blok.

VOERTUIGEN:\n${JSON.stringify(vehicles)}\n\nMELDINGEN:\n${JSON.stringify(reports)}`;

    const apiMessages = newMessages.slice(1).map((m) => ({ role: m.role, content: m.content }));

    try {
      const text = await callAIRaw({ system: instructions, messages: apiMessages, maxTokens: 1000 });

      // Parse and execute any <actie> block
      const actieMatch = text.match(/<actie>([\s\S]*?)<\/actie>/i);
      let cleaned = text.replace(/<actie>[\s\S]*?<\/actie>/gi, "").trim();
      const results = [];
      if (actieMatch) {
        try {
          const jsonStr = actieMatch[1].trim().replace(/^```json\s*|```$/g, "").trim();
          const parsed = JSON.parse(jsonStr);
          const actions = Array.isArray(parsed) ? parsed : [parsed];
          actions.forEach((a) => { const r = runAction(a); if (r) results.push(r); });
        } catch (e) { /* ignore malformed action */ }
      }
      const finalText = [cleaned, ...results].filter(Boolean).join("\n\n") || "Gedaan.";
      setMessages((m) => [...m, { role: "assistant", content: finalText }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Kon geen antwoord ophalen (${err.message || "netwerkfout"}).` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: isMobile ? "calc(100dvh - 130px)" : "calc(100vh - 160px)" }}>
      <div className="mb-3">
        <h1 style={{ fontFamily: "Oswald", fontSize: isMobile ? 22 : 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Sparkles size={isMobile ? 18 : 22} color="#3B82F6" /> AI Assistent</h1>
        {!isMobile && <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Doorzoekt meldingen en denkt mee met de garage.</p>}
      </div>
      {!aiReady && (
        <div className="mb-3 flex items-start gap-2 p-3 rounded-lg" style={{ background: "#FF8A0014", border: "1px solid #FF8A0044" }}>
          <AlertTriangle size={15} color="#FF8A00" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#FF8A00" }}>AI is nog niet geconfigureerd. Zet <code>ANTHROPIC_API_KEY</code> op de server (zie README) om de assistent te activeren.</span>
        </div>
      )}
      <Card className="flex-1 p-4 overflow-y-auto space-y-4 mb-3" style={{ minHeight: 0 }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="px-4 py-2.5 rounded-xl" style={{ maxWidth: "82%", background: m.role === "user" ? "#3B82F6" : "#1A2129", color: m.role === "user" ? "#FFFFFF" : "#E7ECF3", fontFamily: "Inter", fontSize: 13.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && <div style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }}>Denkt na...</div>}
        <div ref={endRef} />
      </Card>
      <div className="flex gap-2">
        <input className="tg-input flex-1" style={{ minWidth: 0 }} placeholder={aiReady ? "Stel een vraag of geef een opdracht..." : "AI staat uit — niet beschikbaar"} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && aiReady && send()} disabled={!aiReady} />
        <Button icon={Send} onClick={send} disabled={loading || !aiReady}>Vraag</Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   360° INSPECTIE — multi-aanzicht hotspot-diagram (geen fotogrammetrie)
--------------------------------------------------------------------- */

const ANGLES = [
  { id: "voor", label: "Voor", hotspots: [
    { zone: "dak", x: 50, y: 15, label: "Cabinedak / verlichting" },
    { zone: "cabine", x: 50, y: 33, label: "Voorruit / cabine" },
    { zone: "voorkant", x: 50, y: 52, label: "Grille / bumper" },
    { zone: "wielen", x: 21, y: 76, label: "Wiel links" },
    { zone: "wielen", x: 79, y: 76, label: "Wiel rechts" },
  ]},
  { id: "zij", label: "Zijkant", hotspots: [
    { zone: "dak", x: 22, y: 24, label: "Cabinedak" },
    { zone: "cabine", x: 22, y: 44, label: "Cabine / portier" },
    { zone: "achterkant", x: 72, y: 40, label: "Laadbak" },
    { zone: "onder", x: 50, y: 66, label: "Chassis / onder" },
    { zone: "wielen", x: 30, y: 80, label: "Vooras" },
    { zone: "wielen", x: 72, y: 80, label: "Achteras" },
  ]},
  { id: "achter", label: "Achter", hotspots: [
    { zone: "dak", x: 50, y: 16, label: "Achterlicht boven" },
    { zone: "achterkant", x: 50, y: 40, label: "Deuren / laadklep" },
    { zone: "onder", x: 50, y: 63, label: "Bumper / onder" },
    { zone: "wielen", x: 23, y: 76, label: "Wiel links" },
    { zone: "wielen", x: 77, y: 76, label: "Wiel rechts" },
  ]},
  { id: "boven", label: "Boven", hotspots: [
    { zone: "voorkant", x: 14, y: 50, label: "Voorkant" },
    { zone: "cabine", x: 30, y: 50, label: "Cabine" },
    { zone: "dak", x: 62, y: 50, label: "Dak laadbak" },
    { zone: "achterkant", x: 88, y: 50, label: "Achterkant" },
  ]},
];

// Gestileerde SVG-weergave per aanzicht (viewBox 0 0 400 300).
function VehicleDiagram({ angleId }) {
  const panel = "#232B38", panel2 = "#2A3340", glass = "#324056", tyre = "#12171F", rim = "#3A4252", line = "#3A4252";
  const common = { fill: panel, stroke: line, strokeWidth: 2 };
  return (
    <svg viewBox="0 0 400 300" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      {angleId === "voor" && (
        <g>
          <rect x="118" y="70" width="164" height="150" rx="16" {...common} />
          <rect x="132" y="86" width="136" height="52" rx="8" fill={glass} stroke={line} strokeWidth="2" />
          <rect x="150" y="150" width="100" height="34" rx="6" fill={panel2} stroke={line} strokeWidth="2" />
          <circle cx="140" cy="167" r="7" fill="#FFD100" opacity="0.85" />
          <circle cx="260" cy="167" r="7" fill="#FFD100" opacity="0.85" />
          <rect x="112" y="196" width="176" height="16" rx="6" fill={panel2} stroke={line} strokeWidth="2" />
          <rect x="96" y="214" width="40" height="46" rx="8" fill={tyre} stroke={rim} strokeWidth="3" />
          <rect x="264" y="214" width="40" height="46" rx="8" fill={tyre} stroke={rim} strokeWidth="3" />
        </g>
      )}
      {angleId === "zij" && (
        <g>
          <rect x="150" y="96" width="200" height="104" rx="10" {...common} />
          <path d="M46 200 V150 q0-14 14-16 l70-14 q10-2 16 8 l16 30 v42 z" fill={panel} stroke={line} strokeWidth="2" />
          <path d="M66 150 l58-11 q7-1 11 5 l12 22 h-91 q-4 0-4-6 z" fill={glass} stroke={line} strokeWidth="2" />
          <rect x="150" y="200" width="200" height="10" fill={panel2} />
          <circle cx="96" cy="214" r="26" fill={tyre} stroke={rim} strokeWidth="5" /><circle cx="96" cy="214" r="8" fill={rim} />
          <circle cx="258" cy="214" r="26" fill={tyre} stroke={rim} strokeWidth="5" /><circle cx="258" cy="214" r="8" fill={rim} />
          <circle cx="316" cy="214" r="26" fill={tyre} stroke={rim} strokeWidth="5" /><circle cx="316" cy="214" r="8" fill={rim} />
        </g>
      )}
      {angleId === "achter" && (
        <g>
          <rect x="120" y="60" width="160" height="164" rx="12" {...common} />
          <line x1="200" y1="66" x2="200" y2="212" stroke={line} strokeWidth="2" />
          <rect x="132" y="72" width="136" height="18" rx="4" fill={panel2} stroke={line} strokeWidth="2" />
          <rect x="132" y="196" width="60" height="18" rx="4" fill="#F0453F" opacity="0.7" />
          <rect x="208" y="196" width="60" height="18" rx="4" fill="#F0453F" opacity="0.7" />
          <rect x="112" y="214" width="176" height="14" rx="6" fill={panel2} stroke={line} strokeWidth="2" />
          <rect x="96" y="220" width="40" height="44" rx="8" fill={tyre} stroke={rim} strokeWidth="3" />
          <rect x="264" y="220" width="40" height="44" rx="8" fill={tyre} stroke={rim} strokeWidth="3" />
        </g>
      )}
      {angleId === "boven" && (
        <g>
          <rect x="40" y="96" width="320" height="108" rx="16" {...common} />
          <rect x="40" y="104" width="70" height="92" rx="12" fill={panel2} stroke={line} strokeWidth="2" />
          <rect x="52" y="120" width="46" height="60" rx="6" fill={glass} stroke={line} strokeWidth="2" />
          <line x1="120" y1="100" x2="120" y2="200" stroke={line} strokeWidth="2" strokeDasharray="4 6" />
          <rect x="130" y="112" width="220" height="80" rx="8" fill={panel2} stroke={line} strokeWidth="1.5" opacity="0.6" />
        </g>
      )}
    </svg>
  );
}

const INSPECT_SEV = { kritiek: { rank: 3, color: "#F0453F", label: "Kritiek" }, gemiddeld: { rank: 2, color: "#FF8A00", label: "Aandacht" }, laag: { rank: 1, color: "#84CC16", label: "Licht" }, geen: { rank: 0, color: "#22D3B0", label: "In orde" } };
const sevFromReport = (r) => (r.prioriteit === "kritiek" ? "kritiek" : r.prioriteit === "gemiddeld" ? "gemiddeld" : "laag");

function InspectionView({ vehicles, reports, onUpdate, aiReady, lockVehicleId = null, embedded = false }) {
  const isMobile = useIsMobile();
  const [vehicleId, setVehicleId] = useState(lockVehicleId || vehicles[0]?.kenteken || "");
  const [angleIdx, setAngleIdx] = useState(0);
  const [activeZone, setActiveZone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [result, setResult] = useState(null); // { schade, ernst, onderdeel, aanbeveling }
  const fileRef = useRef(null);
  const angle = ANGLES[angleIdx];

  const vehicle = vehicles.find((v) => v.kenteken === vehicleId);
  const inspecties = (vehicle?.inspecties) || [];
  const zoneLabel = (id) => ZONES.find((z) => z.id === id)?.label || id;

  const zoneReports = (zoneId) => reports.filter((r) => r.vehicle === vehicleId && r.zone === zoneId).sort((a, b) => (a.datum < b.datum ? 1 : -1));
  const zoneFindings = (zoneId) => inspecties.filter((f) => f.zone === zoneId).sort((a, b) => (a.datum < b.datum ? 1 : -1));
  const zoneWorst = (zoneId) => {
    const sevs = [...zoneReports(zoneId).map(sevFromReport), ...zoneFindings(zoneId).map((f) => f.ernst)];
    return sevs.reduce((w, s) => (INSPECT_SEV[s]?.rank > INSPECT_SEV[w].rank ? s : w), "geen");
  };
  const zoneCount = (zoneId) => zoneReports(zoneId).length + zoneFindings(zoneId).length;

  const allZones = [...new Set(ANGLES.flatMap((a) => a.hotspots.map((h) => h.zone)))];
  const totalFindings = inspecties.length;
  const overallWorst = allZones.reduce((w, z) => (INSPECT_SEV[zoneWorst(z)].rank > INSPECT_SEV[w].rank ? zoneWorst(z) : w), "geen");

  const activeReports = activeZone ? zoneReports(activeZone) : [];
  const activeFindings = activeZone ? zoneFindings(activeZone) : [];

  if (vehicles.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><ScanEye size={22} color="#22D3B0" /> 360° Inspectie</h1>
          <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Laat de AI schade op foto's beoordelen, per onderdeel.</p>
        </div>
        <EmptyState icon={Truck} text="Voeg eerst een voertuig toe onder 'Vrachtwagens' om te kunnen inspecteren." />
      </div>
    );
  }

  const analyze = async (file) => {
    if (!file || !activeZone) return;
    setBusy(true); setAiErr(""); setResult(null);
    try {
      const b64 = await fileToBase64(file);
      const prompt = `Je bent een truck-schade-expert. Dit is een foto van het onderdeel "${zoneLabel(activeZone)}" van een ${vehicle?.merk || "voertuig"} (${vehicleId}). Bekijk de foto en beoordeel de zichtbare staat/schade. Antwoord UITSLUITEND met JSON, geen extra tekst:
{"schade":"<korte beschrijving van wat je ziet>","ernst":"laag|gemiddeld|kritiek","onderdeel":"<welk onderdeel>","aanbeveling":"<1 zin advies>"}
Zie je geen schade, zet dan schade op "Geen zichtbare schade" en ernst op "laag".`;
      const out = await callAI({ text: prompt, images: [{ media_type: file.type || "image/jpeg", data: b64 }], maxTokens: 500 });
      setResult(parseAIJson(out));
    } catch (e) {
      setAiErr(`Kon foto niet analyseren (${e.message || "fout"}).`);
    } finally {
      setBusy(false);
    }
  };

  const saveFinding = () => {
    if (!result || !vehicle) return;
    const ernst = ["laag", "gemiddeld", "kritiek"].includes(result.ernst) ? result.ernst : "laag";
    const finding = { id: "insp" + Date.now(), zone: activeZone, ernst, onderdeel: result.onderdeel || zoneLabel(activeZone), schade: result.schade || "", aanbeveling: result.aanbeveling || "", datum: TODAY };
    onUpdate({ ...vehicle, inspecties: [finding, ...inspecties] });
    setResult(null);
  };

  const deleteFinding = (id) => { if (vehicle) onUpdate({ ...vehicle, inspecties: inspecties.filter((f) => f.id !== id) }); };

  return (
    <div className="space-y-5">
      {!embedded && (
        <div>
          <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><ScanEye size={22} color="#22D3B0" /> 360° Inspectie</h1>
          <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Loop de aanzichten langs, tik een onderdeel aan en laat de AI een foto op schade beoordelen.</p>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {!lockVehicleId && (
          <select className="tg-input" style={{ maxWidth: 320 }} value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); setActiveZone(null); setResult(null); }}>
            {vehicles.map((v) => <option key={v.id} value={v.kenteken}>{v.kenteken} — {v.merk}</option>)}
          </select>
        )}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: `${INSPECT_SEV[overallWorst].color}18`, border: `1px solid ${INSPECT_SEV[overallWorst].color}44` }}>
          <span className="rounded-full" style={{ width: 8, height: 8, background: INSPECT_SEV[overallWorst].color }} />
          <span style={{ fontFamily: "Inter", fontSize: 12, fontWeight: 600, color: INSPECT_SEV[overallWorst].color }}>{INSPECT_SEV[overallWorst].label}</span>
        </span>
        <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9" }}>{totalFindings} AI-bevinding(en)</span>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "1.4fr 1fr" }}>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <button onClick={() => setAngleIdx((i) => (i - 1 + ANGLES.length) % ANGLES.length)} className="p-1" aria-label="Vorig aanzicht"><ChevronLeft color="#B4BCC9" /></button>
            <div className="flex gap-2 flex-wrap justify-center">
              {ANGLES.map((a, i) => <Chip key={a.id} active={i === angleIdx} onClick={() => setAngleIdx(i)}>{a.label}</Chip>)}
            </div>
            <button onClick={() => setAngleIdx((i) => (i + 1) % ANGLES.length)} className="p-1" aria-label="Volgend aanzicht"><ChevronRight color="#B4BCC9" /></button>
          </div>

          <div className="relative mx-auto" style={{ width: "100%", maxWidth: 440, aspectRatio: "4/3", background: "radial-gradient(circle at 50% 40%, #171E28, #12171F)", borderRadius: 14, border: "1px solid #232B38", overflow: "hidden" }}>
            <VehicleDiagram angleId={angle.id} />
            {angle.hotspots.map((h, i) => {
              const worst = zoneWorst(h.zone);
              const meta = INSPECT_SEV[worst];
              const count = zoneCount(h.zone);
              const active = activeZone === h.zone;
              return (
                <button key={i} onClick={() => { setActiveZone(h.zone); setResult(null); setAiErr(""); }}
                  className="absolute rounded-full flex items-center justify-center"
                  title={h.label}
                  style={{ left: `${h.x}%`, top: `${h.y}%`, transform: "translate(-50%,-50%)", width: active ? 28 : 24, height: active ? 28 : 24, background: meta.color, border: `2px solid ${active ? "#FFFFFF" : "#0A0E14"}`, boxShadow: worst !== "geen" ? `0 0 0 4px ${meta.color}22, 0 0 12px ${meta.color}88` : "0 0 0 3px #0A0E1466", cursor: "pointer", animation: worst === "kritiek" ? "tg-pulse 1.6s ease-in-out infinite" : "none", transition: "width .15s, height .15s" }}>
                  {count > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "#0A0E14" }}>{count}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
            {Object.entries(INSPECT_SEV).map(([k, m]) => (
              <span key={k} className="inline-flex items-center gap-1.5" style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0" }}>
                <span className="rounded-full" style={{ width: 9, height: 9, background: m.color }} /> {m.label}
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <Eyebrow>{activeZone ? zoneLabel(activeZone) : "Selecteer een onderdeel"}</Eyebrow>
          {!activeZone ? (
            <div style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }}>Tik op een stip in het diagram om meldingen, AI-bevindingen en foto-analyse te zien.</div>
          ) : (
            <div className="space-y-4">
              {/* AI foto-analyse */}
              <div>
                {/* Fotogids: welk onderdeel en hoe fotograferen */}
                <div className="mb-2 p-2.5 rounded-lg flex items-start gap-2" style={{ background: "#12233E", border: "1px solid #3B82F544" }}>
                  <Camera size={14} color="#8FB8FF" style={{ marginTop: 1, flexShrink: 0 }} />
                  <span style={{ fontFamily: "Inter", fontSize: 11.5, color: "#B9C6DA", lineHeight: 1.45 }}>
                    Fotografeer <b style={{ color: "#E7ECF3" }}>{zoneLabel(activeZone)}</b> — houd het hele onderdeel in beeld, ga dichtbij genoeg om schade te zien en zorg voor goed licht. <span style={{ color: "#98A1B0" }}>iPhone: blijft de camera zwart, kies dan "Fotobibliotheek".</span>
                  </span>
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) analyze(f); e.target.value = ""; }} />
                <button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg" style={{ background: busy ? "#1A2129" : "linear-gradient(180deg,#4C8DFF,#3B82F6)", color: "#fff", fontFamily: "Inter", fontWeight: 600, fontSize: 13, boxShadow: "0 2px 10px rgba(59,130,246,0.3)" }}>
                  <Camera size={15} /> {busy ? "Analyseren…" : "Foto toevoegen & AI-check"}
                </button>
                {!aiReady && <div style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0", marginTop: 6, textAlign: "center" }}>AI staat uit — zet ANTHROPIC_API_KEY op de server om schade te laten herkennen.</div>}
                {aiErr && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#FF8A00", marginTop: 6 }}>{aiErr}</div>}
                {result && (() => {
                  const col = INSPECT_SEV[result.ernst]?.color || "#84CC16";
                  return (
                    <div className="mt-3 p-3 rounded-lg" style={{ background: "#161C25", border: `1px solid ${col}55`, borderLeft: `3px solid ${col}` }}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 700, color: col, letterSpacing: 0.5, textTransform: "uppercase" }}>AI-analyse</span>
                        <span className="text-xs px-2 py-0.5 rounded" style={{ color: col, border: `1px solid ${col}55`, fontWeight: 600 }}>{result.ernst}</span>
                      </div>
                      {result.onderdeel && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#98A1B0" }}>{result.onderdeel}</div>}
                      <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#E7ECF3", fontWeight: 500, marginTop: 2 }}>{result.schade}</div>
                      {result.aanbeveling && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9", marginTop: 3 }}>{result.aanbeveling}</div>}
                      <div className="flex gap-2 mt-2"><Button small onClick={saveFinding}>Bevinding opslaan</Button><Button small variant="ghost" onClick={() => setResult(null)}>Verwerpen</Button></div>
                    </div>
                  );
                })()}
              </div>

              {/* Opgeslagen AI-bevindingen */}
              {activeFindings.length > 0 && (
                <div>
                  <div style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 700, color: "#98A1B0", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>AI-bevindingen</div>
                  <div className="space-y-2">
                    {activeFindings.map((f) => { const col = INSPECT_SEV[f.ernst]?.color || "#84CC16"; return (
                      <div key={f.id} className="p-2.5 rounded-lg" style={{ background: "#12171F", border: "1px solid #232B38" }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: col, border: `1px solid ${col}55`, fontWeight: 600 }}>{INSPECT_SEV[f.ernst]?.label || f.ernst}</span>
                          <div className="flex items-center gap-2"><span style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 11 }}>{f.datum}</span><button onClick={() => deleteFinding(f.id)} style={{ color: "#F0453F" }}><Trash2 size={12} /></button></div>
                        </div>
                        <div style={{ color: "#E7ECF3", fontFamily: "Inter", fontSize: 13 }}>{f.schade}</div>
                        {f.aanbeveling && <div style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 11 }} className="mt-1">{f.aanbeveling}</div>}
                      </div>
                    ); })}
                  </div>
                </div>
              )}

              {/* Chauffeur-meldingen op dit onderdeel */}
              <div>
                <div style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 700, color: "#98A1B0", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Meldingen</div>
                {activeReports.length === 0 ? (
                  <div style={{ color: "#34D399", fontFamily: "Inter", fontSize: 12.5 }}>Geen meldingen voor dit onderdeel.</div>
                ) : (
                  <div className="space-y-2">
                    {activeReports.map((r) => (
                      <div key={r.id} className="p-2.5 rounded-lg" style={{ background: "#12171F", border: "1px solid #232B38" }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: PRIO_META[r.prioriteit].color, border: `1px solid ${PRIO_META[r.prioriteit].color}55`, fontWeight: 600 }}>{PRIO_META[r.prioriteit].label}</span>
                          <span style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 11 }}>{r.datum}</span>
                        </div>
                        <div style={{ color: "#E7ECF3", fontFamily: "Inter", fontSize: 13 }}>{r.omschrijving}</div>
                        <div style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 11 }} className="mt-1">{r.chauffeur} · {KANBAN_COLS.find((c) => c.id === r.status)?.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   PLANNING — werkplaatskalender: wagens inplannen op datum/tijd
--------------------------------------------------------------------- */

function toDateKey(d) { return toLocalKey(d); }

function FieldLabel({ children }) {
  return <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#B4BCC9", fontWeight: 600, marginBottom: 4 }}>{children}</div>;
}

function PlanningView({ vehicles, planning, reports, onAdd, onDelete, onRefresh, refreshing }) {
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [open, setOpen] = useState(false);
  const [confirmPl, setConfirmPl] = useState(null);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({ vehicle: "", tijd: "09:00", duur: "60", taak: "", monteur: "", reportId: null });

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // maandag = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const planningByDate = {};
  planning.forEach((p) => { (planningByDate[p.datum] = planningByDate[p.datum] || []).push(p); });

  const dayItems = (planningByDate[selectedDate] || []).sort((a, b) => a.tijd.localeCompare(b.tijd));
  const monthNames = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

  const openReportsForVehicle = form.vehicle ? reports.filter((r) => r.vehicle === form.vehicle && r.status !== "klaar") : [];
  const pickReport = (r) => setForm({ ...form, taak: r.omschrijving, reportId: r.id });

  // Snel inplannen: alle openstaande meldingen die nog niet zijn ingepland,
  // zodat de werkplaats meteen vanuit een melding een afspraak kan maken —
  // voertuig én taak worden dan ineens ingevuld.
  const plannedReportIds = new Set(planning.map((p) => p.reportId).filter(Boolean));
  const allOpenReports = reports
    .filter((r) => r.status !== "klaar" && !plannedReportIds.has(r.id))
    .sort((a, b) => (PRIO_RANK[a.prioriteit] ?? 9) - (PRIO_RANK[b.prioriteit] ?? 9));
  const pickReportFull = (r) => setForm({ ...form, vehicle: r.vehicle, taak: r.omschrijving, reportId: r.id });
  const openForm = (r) => { setForm(r ? { vehicle: r.vehicle, tijd: "09:00", duur: "60", taak: r.omschrijving, monteur: "", reportId: r.id } : { vehicle: "", tijd: "09:00", duur: "60", taak: "", monteur: "", reportId: null }); setOpen(true); };

  const submit = () => {
    if (!form.vehicle || !form.taak) return;
    onAdd({ id: "pl" + Date.now(), vehicle: form.vehicle, datum: selectedDate, tijd: form.tijd, duur: Number(form.duur) || 60, taak: form.taak, monteur: form.monteur || "—", reportId: form.reportId });
    setForm({ vehicle: "", tijd: "09:00", duur: "60", taak: "", monteur: "", reportId: null });
    setOpen(false);
  };

  // hours shown in the visual day timeline
  const dayStart = 7, dayEnd = 18; // 07:00 - 18:00
  const totalMin = (dayEnd - dayStart) * 60;
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return (h - dayStart) * 60 + m; };
  const monthTotal = planning.filter((p) => p.datum.slice(0, 7) === `${year}-${String(month + 1).padStart(2, "0")}`).length;

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Calendar size={22} color="#3B82F6" /> Planning</h1>
          <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Tik een dag aan om de werkplaats-agenda te zien.</p>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && <Button variant="ghost" small icon={RefreshCw} onClick={async () => { const ok = await onRefresh(); setToast(ok === false ? "Verversen mislukt — controleer je verbinding." : "Bijgewerkt."); }} disabled={refreshing}>{refreshing ? "..." : "Ververs"}</Button>}
          <Button variant="ghost" small onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); setSelectedDate(TODAY); }}>Vandaag</Button>
          <Button icon={Plus} onClick={() => openForm()}>Inplannen</Button>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "1.3fr 1fr" }}>
        {/* Month calendar */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-1 rounded-lg" style={{ background: "#1A2129" }}><ChevronLeft size={18} color="#B4BCC9" /></button>
            <div className="text-center">
              <div style={{ fontFamily: "Oswald", fontWeight: 600, color: "#E7ECF3", fontSize: 18, textTransform: "capitalize" }}>{monthNames[month]} {year}</div>
              <div style={{ fontFamily: "Inter", fontSize: 11, color: "#B4BCC9" }}>{monthTotal} afspraken deze maand</div>
            </div>
            <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-1 rounded-lg" style={{ background: "#1A2129" }}><ChevronRight size={18} color="#B4BCC9" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["ma", "di", "wo", "do", "vr", "za", "zo"].map((d) => <div key={d} className="text-center" style={{ color: "#98A1B0", fontFamily: "Inter", fontSize: 11, fontWeight: 600 }}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const key = toDateKey(d);
              const items = planningByDate[key] || [];
              const count = items.length;
              const selected = key === selectedDate;
              const isToday = key === TODAY;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <button key={i} onClick={() => setSelectedDate(key)} className="rounded-lg flex flex-col items-center justify-start relative"
                  style={{ aspectRatio: "1", paddingTop: 4, background: selected ? "#3B82F6" : count > 0 ? "#3B82F614" : isWeekend ? "#0E131A" : "transparent", border: selected ? "none" : isToday ? "1.5px solid #3B82F6" : count > 0 ? "1px solid #3B82F544" : "1px solid #161C25" }}>
                  <span style={{ fontFamily: "Inter", fontSize: 12.5, color: selected ? "#FFFFFF" : isToday ? "#3B82F6" : "#E7ECF3", fontWeight: selected || isToday ? 700 : 500 }}>{d.getDate()}</span>
                  {count > 0 && (
                    <div className="flex items-center gap-0.5 mt-0.5 flex-wrap justify-center" style={{ maxWidth: "90%" }}>
                      {items.slice(0, 3).map((_, idx) => <span key={idx} className="rounded-full" style={{ width: 4, height: 4, background: selected ? "#FFFFFF" : "#3B82F6" }} />)}
                      {count > 3 && <span style={{ fontSize: 8, color: selected ? "#FFFFFF" : "#3B82F6", fontWeight: 700 }}>+{count - 3}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 3, border: "1.5px solid #3B82F6" }} /><span style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0" }}>Vandaag</span></div>
            <div className="flex items-center gap-1.5"><span className="rounded-full" style={{ width: 5, height: 5, background: "#3B82F6" }} /><span style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0" }}>Afspraak</span></div>
          </div>
        </Card>

        {/* Day agenda — visual timeline */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div style={{ fontFamily: "Oswald", fontSize: 16, fontWeight: 600, color: "#E7ECF3", textTransform: "capitalize" }}>{new Date(selectedDate).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</div>
            <span style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>{dayItems.length} afspra{dayItems.length === 1 ? "ak" : "ken"}</span>
          </div>

          {open && (
            <div className="mb-4 space-y-3 p-3 rounded-lg" style={{ background: "#1A2129", border: "1px solid #232B38" }}>
              {allOpenReports.length > 0 && (
                <div>
                  <FieldLabel>Snel inplannen — kies een openstaande melding</FieldLabel>
                  <div className="space-y-1.5" style={{ maxHeight: 190, overflowY: "auto" }}>
                    {allOpenReports.map((r) => (
                      <button key={r.id} onClick={() => pickReportFull(r)} className="w-full text-left p-2 rounded-lg flex items-center gap-2"
                        style={{ background: form.reportId === r.id ? "#3B82F618" : "#12171F", border: `1px solid ${form.reportId === r.id ? "#3B82F6" : "#232B38"}` }}>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ fontFamily: "JetBrains Mono", color: "#E7ECF3", background: "#0E131A", border: "1px solid #232B38", fontWeight: 700, flexShrink: 0 }}>{r.vehicle}</span>
                        <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#C4CBD6", minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.omschrijving}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: PRIO_META[r.prioriteit].color, border: `1px solid ${PRIO_META[r.prioriteit].color}55`, fontWeight: 600, flexShrink: 0 }}>{PRIO_META[r.prioriteit].label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 my-1" style={{ color: "#6B7585" }}>
                    <span style={{ flex: 1, height: 1, background: "#232B38" }} /><span style={{ fontFamily: "Inter", fontSize: 11 }}>of vul handmatig in</span><span style={{ flex: 1, height: 1, background: "#232B38" }} />
                  </div>
                </div>
              )}
              <div>
                <FieldLabel>Voertuig</FieldLabel>
                <select className="tg-input w-full" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value, taak: "", reportId: null })}>
                  <option value="">Kies voertuig...</option>
                  {vehicles.map((v) => <option key={v.id} value={v.kenteken}>{v.kenteken} — {v.merk}</option>)}
                </select>
              </div>
              {form.vehicle && openReportsForVehicle.length > 0 && (
                <div>
                  <FieldLabel>Openstaande melding — tik om te gebruiken</FieldLabel>
                  <div className="space-y-1.5">
                    {openReportsForVehicle.map((r) => (
                      <button key={r.id} onClick={() => pickReport(r)} className="w-full text-left p-2 rounded-lg flex items-start justify-between gap-2"
                        style={{ background: form.reportId === r.id ? "#3B82F618" : "#12171F", border: `1px solid ${form.reportId === r.id ? "#3B82F6" : "#232B38"}` }}>
                        <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#E7ECF3", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.omschrijving}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: PRIO_META[r.prioriteit].color, border: `1px solid ${PRIO_META[r.prioriteit].color}55`, fontWeight: 600, flexShrink: 0 }}>{PRIO_META[r.prioriteit].label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <FieldLabel>Taak {form.reportId && <span style={{ color: "#3B82F6" }}>(uit melding)</span>}</FieldLabel>
                <input placeholder="Bv. Grote beurt, APK..." value={form.taak} onChange={(e) => setForm({ ...form, taak: e.target.value, reportId: null })} className="tg-input w-full" />
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                <div style={{ minWidth: 0 }}><FieldLabel>Tijd</FieldLabel><input type="time" value={form.tijd} onChange={(e) => setForm({ ...form, tijd: e.target.value })} className="tg-input w-full" /></div>
                <div style={{ minWidth: 0 }}><FieldLabel>Duur (min)</FieldLabel><input type="number" placeholder="60" value={form.duur} onChange={(e) => setForm({ ...form, duur: e.target.value })} className="tg-input w-full" /></div>
              </div>
              <div><FieldLabel>Monteur (optioneel)</FieldLabel><input placeholder="Naam monteur" value={form.monteur} onChange={(e) => setForm({ ...form, monteur: e.target.value })} className="tg-input w-full" /></div>
              <div className="flex gap-2 pt-1"><Button small onClick={submit} disabled={!form.vehicle || !form.taak}>Inplannen</Button><Button small variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button></div>
            </div>
          )}

          {dayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8" style={{ color: "#98A1B0" }}>
              <Calendar size={28} color="#6B7585" />
              <span style={{ fontFamily: "Inter", fontSize: 13, marginTop: 8 }}>Niets ingepland op deze dag.</span>
              <button onClick={() => openForm()} style={{ fontFamily: "Inter", fontSize: 12.5, color: "#3B82F6", fontWeight: 600, marginTop: 6 }}>+ Afspraak toevoegen</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {dayItems.map((p) => (
                <div key={p.id} className="flex items-stretch gap-3 rounded-xl overflow-hidden" style={{ background: "#141A23", border: "1px solid #232B38" }}>
                  <div className="flex flex-col items-center justify-center px-3 py-3" style={{ background: "#3B82F618", minWidth: 66, flexShrink: 0 }}>
                    <span style={{ fontFamily: "JetBrains Mono", fontSize: 16, color: "#3B82F6", fontWeight: 700 }}>{p.tijd}</span>
                    <span style={{ fontFamily: "Inter", fontSize: 10.5, color: "#B4BCC9" }}>{p.duur} min</span>
                  </div>
                  <div className="flex-1 py-2.5 pr-2" style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                      <Kenteken value={p.vehicle} />
                      {p.reportId && <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: "#3B82F6", border: "1px solid #3B82F655", flexShrink: 0 }}>melding</span>}
                      {onDelete && (confirmPl === p.id ? (
                        <span className="flex items-center gap-2" style={{ marginLeft: "auto", flexShrink: 0 }}><button onClick={() => { onDelete(p.id); setConfirmPl(null); }} className="text-xs" style={{ color: "#F0453F", fontWeight: 700 }}>Bevestig</button><button onClick={() => setConfirmPl(null)} className="text-xs" style={{ color: "#B4BCC9" }}>Nee</button></span>
                      ) : (
                        <button onClick={() => setConfirmPl(p.id)} aria-label="Afspraak verwijderen" title="Afspraak verwijderen" style={{ marginLeft: "auto", color: "#F0453F", flexShrink: 0, padding: 4 }}><Trash2 size={16} /></button>
                      ))}
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 14, color: "#E7ECF3", fontWeight: 600, marginTop: 4 }}>{p.taak}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9", marginTop: 1 }}>Monteur: {p.monteur}</div>
                  </div>
                </div>
              ))}
              <button onClick={() => openForm()} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl" style={{ border: "1px dashed #2A3340", color: "#3B82F6", fontFamily: "Inter", fontSize: 13, fontWeight: 600 }}>
                <Plus size={15} /> Afspraak toevoegen
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   KOSTEN — overzicht per categorie en per voertuig, met toevoegen/verwijderen
--------------------------------------------------------------------- */

const COST_CATEGORIES = [
  { id: "onderhoud", label: "Onderhoud", color: "#22D3B0" },
  { id: "brandstof", label: "Brandstof", color: "#3B82F6" },
  { id: "reparatie", label: "Reparatie", color: "#FF8A00" },
  { id: "verzekering", label: "Verzekering", color: "#A855F7" },
  { id: "belasting", label: "Belasting", color: "#EC4899" },
  { id: "overig", label: "Overig", color: "#98A1B0" },
];
const costCatMeta = (id) => COST_CATEGORIES.find((c) => c.id === id) || COST_CATEGORIES[5];
const euro = (n) => "€ " + Math.round(n).toLocaleString("nl-NL");

function CostsView({ costs, vehicles, onAdd, onDelete }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vehicle: "", categorie: "onderhoud", bedrag: "", datum: TODAY, omschrijving: "" });
  const [year, setYear] = useState("all");
  const [month, setMonth] = useState("all");
  const [confirmDel, setConfirmDel] = useState(null);

  const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  const MONTH_LABELS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const years = Array.from(new Set(costs.map((c) => (c.datum || "").slice(0, 4)).filter(Boolean))).sort().reverse();
  // Periode: heel jaar, of een specifieke maand binnen dat jaar.
  const periodPrefix = year === "all" ? "" : month === "all" ? year : `${year}-${month}`;
  const filtered = periodPrefix ? costs.filter((c) => (c.datum || "").startsWith(periodPrefix)) : costs;
  const total = filtered.reduce((a, c) => a + (Number(c.bedrag) || 0), 0);

  const byCat = COST_CATEGORIES.map((cat) => ({ ...cat, bedrag: filtered.filter((c) => c.categorie === cat.id).reduce((a, c) => a + (Number(c.bedrag) || 0), 0) })).filter((c) => c.bedrag > 0);
  const byVehicle = Object.entries(filtered.reduce((acc, c) => { acc[c.vehicle] = (acc[c.vehicle] || 0) + (Number(c.bedrag) || 0); return acc; }, {})).map(([vehicle, bedrag]) => ({ vehicle, bedrag })).sort((a, b) => b.bedrag - a.bedrag);
  const maxCat = Math.max(1, ...byCat.map((c) => c.bedrag));

  // Maandtrend: bij een gekozen jaar de 12 maanden van dat jaar, anders de
  // laatste 12 maanden waarin er kosten zijn. Toont uitgaven over tijd.
  const trend = (() => {
    if (year !== "all") {
      return MONTHS.map((m, i) => {
        const bedrag = costs.filter((c) => (c.datum || "").startsWith(`${year}-${m}`)).reduce((a, c) => a + (Number(c.bedrag) || 0), 0);
        return { key: `${year}-${m}`, label: MONTH_LABELS[i].slice(0, 3), bedrag };
      });
    }
    // Alle jaren: verzamel per YYYY-MM, sorteer en neem de laatste 12 met data.
    const acc = {};
    costs.forEach((c) => { const k = (c.datum || "").slice(0, 7); if (/^\d{4}-\d{2}$/.test(k)) acc[k] = (acc[k] || 0) + (Number(c.bedrag) || 0); });
    return Object.keys(acc).sort().slice(-12).map((k) => ({ key: k, label: `${MONTH_LABELS[Number(k.slice(5, 7)) - 1].slice(0, 3)} '${k.slice(2, 4)}`, bedrag: acc[k] }));
  })();
  const trendMax = Math.max(1, ...trend.map((t) => t.bedrag));
  const trendTotal = trend.reduce((a, t) => a + t.bedrag, 0);
  const trendMonths = trend.filter((t) => t.bedrag > 0).length;
  const trendAvg = trendMonths ? trendTotal / trendMonths : 0;

  const submit = () => {
    if (!form.vehicle || !form.bedrag) return;
    onAdd({ id: "c" + Date.now(), vehicle: form.vehicle, categorie: form.categorie, bedrag: Number(form.bedrag), datum: form.datum, omschrijving: form.omschrijving });
    setForm({ vehicle: "", categorie: "onderhoud", bedrag: "", datum: TODAY, omschrijving: "" });
    setOpen(false);
  };

  const sorted = [...filtered].sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));

  const periodLabel = year === "all" ? "alle" : month === "all" ? year : `${year}-${month}`;
  const exportCsv = () => {
    const rows = sorted.map((c) => [c.datum, c.vehicle, costCatMeta(c.categorie).label, c.omschrijving || "", Number(c.bedrag) || 0]);
    downloadCSV(`kosten-${periodLabel}.csv`, ["Datum", "Voertuig", "Categorie", "Omschrijving", "Bedrag (EUR)"], rows);
  };
  // Alleen de werkbonnen uit de gekozen periode (kostenposten met "Werkbon:").
  const werkbonnen = sorted.filter((c) => /^werkbon/i.test(c.omschrijving || ""));
  const exportWerkbonnen = () => {
    const rows = werkbonnen.map((c) => [c.datum, c.vehicle, costCatMeta(c.categorie).label, (c.omschrijving || "").replace(/^werkbon:\s*/i, ""), Number(c.bedrag) || 0]);
    downloadCSV(`werkbonnen-${periodLabel}.csv`, ["Datum", "Voertuig", "Categorie", "Werk", "Bedrag (EUR)"], rows);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Euro size={22} color="#3B82F6" /> Kosten</h1><p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Uitgaven per categorie en per voertuig.</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="tg-input" style={{ width: "auto" }} value={year} onChange={(e) => { setYear(e.target.value); setMonth("all"); }}>
            <option value="all">Alle jaren</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {year !== "all" && (
            <select className="tg-input" style={{ width: "auto" }} value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="all">Hele jaar</option>
              {MONTHS.map((m, i) => <option key={m} value={m}>{MONTH_LABELS[i]}</option>)}
            </select>
          )}
          <Button variant="ghost" icon={Download} onClick={exportCsv} disabled={filtered.length === 0}>Kosten CSV</Button>
          <Button variant="ghost" icon={FileText} onClick={exportWerkbonnen} disabled={werkbonnen.length === 0}>Werkbonnen ({werkbonnen.length})</Button>
          <Button icon={Plus} onClick={() => setOpen(true)}>Kostenpost</Button>
        </div>
      </div>

      {open && (
        <Card className="p-5 space-y-3">
          <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))" }}>
            <div><FieldLabel>Voertuig</FieldLabel>
              {vehicles.length > 0 ? (
                <select className="tg-input" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })}>
                  <option value="">Kies voertuig…</option>
                  {vehicles.map((v) => <option key={v.id} value={v.kenteken}>{v.kenteken} — {v.merk}</option>)}
                </select>
              ) : <input className="tg-input" placeholder="Kenteken" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} />}
            </div>
            <div><FieldLabel>Categorie</FieldLabel>
              <select className="tg-input" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}>
                {COST_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div><FieldLabel>Bedrag (€)</FieldLabel><input className="tg-input" type="number" value={form.bedrag} onChange={(e) => setForm({ ...form, bedrag: e.target.value })} placeholder="0" /></div>
            <div><FieldLabel>Datum</FieldLabel><input className="tg-input" type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></div>
          </div>
          <div><FieldLabel>Omschrijving (optioneel)</FieldLabel><input className="tg-input" value={form.omschrijving} onChange={(e) => setForm({ ...form, omschrijving: e.target.value })} placeholder="Bv. Grote beurt" /></div>
          <div className="flex gap-2"><Button onClick={submit}>Opslaan</Button><Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button></div>
        </Card>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(3, minmax(0,1fr))" }}>
        <Card className="p-5"><Eyebrow>Totaal {year !== "all" ? year : ""}</Eyebrow><div style={{ fontFamily: "Oswald", fontSize: 32, fontWeight: 600, color: "#E7ECF3" }}>{euro(total)}</div><div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>{filtered.length} kostenpost(en)</div></Card>
        <Card className="p-5"><Eyebrow>Grootste categorie</Eyebrow>{byCat.length ? (() => { const top = [...byCat].sort((a, b) => b.bedrag - a.bedrag)[0]; return <><div style={{ fontFamily: "Oswald", fontSize: 26, fontWeight: 600, color: top.color }}>{top.label}</div><div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>{euro(top.bedrag)}</div></>; })() : <div style={{ color: "#98A1B0", fontFamily: "Inter", fontSize: 13 }}>—</div>}</Card>
        <Card className="p-5"><Eyebrow>Duurste voertuig</Eyebrow>{byVehicle.length ? <><div style={{ fontFamily: "Oswald", fontSize: 22, fontWeight: 600, color: "#E7ECF3" }}>{byVehicle[0].vehicle}</div><div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>{euro(byVehicle[0].bedrag)}</div></> : <div style={{ color: "#98A1B0", fontFamily: "Inter", fontSize: 13 }}>—</div>}</Card>
      </div>

      {byCat.length > 0 && (
        <Card className="p-5">
          <Eyebrow>Per categorie</Eyebrow>
          <div className="space-y-2.5 mt-2">
            {byCat.sort((a, b) => b.bedrag - a.bedrag).map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <span style={{ width: 110, fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", flexShrink: 0 }}>{c.label}</span>
                <div className="flex-1 h-3 rounded-full" style={{ background: "#1A2129", overflow: "hidden" }}><div className="h-full rounded-full" style={{ width: `${(c.bedrag / maxCat) * 100}%`, background: c.color }} /></div>
                <span style={{ width: 90, textAlign: "right", fontFamily: "JetBrains Mono", fontSize: 12.5, color: "#E7ECF3", flexShrink: 0 }}>{euro(c.bedrag)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {trend.some((t) => t.bedrag > 0) && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Eyebrow>Kosten per maand {year !== "all" ? `— ${year}` : "— laatste 12 maanden"}</Eyebrow>
            <span style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>Gem. {euro(trendAvg)}/mnd</span>
          </div>
          <div className="flex items-end gap-1.5 mt-4" style={{ height: 140 }}>
            {trend.map((t) => (
              <div key={t.key} className="flex-1 flex flex-col items-center justify-end gap-1.5" style={{ height: "100%", minWidth: 0 }} title={`${t.label}: ${euro(t.bedrag)}`}>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 9.5, color: "#98A1B0", whiteSpace: "nowrap" }}>{t.bedrag > 0 ? (t.bedrag >= 1000 ? `€${Math.round(t.bedrag / 1000)}k` : `€${Math.round(t.bedrag)}`) : ""}</span>
                <div className="w-full rounded-t" style={{ height: `${(t.bedrag / trendMax) * 100}%`, minHeight: t.bedrag > 0 ? 3 : 0, background: t.bedrag > 0 ? "linear-gradient(180deg,#3B82F6,#2563EB)" : "transparent", transition: "height .3s" }} />
                <span style={{ fontFamily: "Inter", fontSize: 10, color: "#B4BCC9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{t.label}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {filtered.length === 0 ? <EmptyState icon={Euro} text="Nog geen kosten geregistreerd." /> : isMobile ? (
        <div className="space-y-3">
          {sorted.map((c) => { const meta = costCatMeta(c.categorie); return (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ color: "#E7ECF3", fontWeight: 700, fontSize: 15 }}>{c.vehicle}</span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ color: meta.color, border: `1px solid ${meta.color}55`, fontWeight: 600 }}>{meta.label}</span>
                  </div>
                  <div style={{ color: "#B4BCC9", fontFamily: "JetBrains Mono", fontSize: 12, marginTop: 4 }}>{c.datum}</div>
                </div>
                <span style={{ color: "#E7ECF3", fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 17, flexShrink: 0 }}>{euro(Number(c.bedrag) || 0)}</span>
              </div>
              {c.omschrijving && <div style={{ color: "#B4BCC9", fontSize: 13.5, marginTop: 8 }}>{c.omschrijving}</div>}
              <div className="flex justify-end mt-3 pt-3" style={{ borderTop: "1px solid #1A2129" }}>
                {confirmDel === c.id ? (
                  <span className="flex items-center gap-3"><button onClick={() => { onDelete(c.id); setConfirmDel(null); }} className="text-sm" style={{ color: "#F0453F", fontWeight: 700 }}>Bevestig verwijderen</button><button onClick={() => setConfirmDel(null)} className="text-sm" style={{ color: "#B4BCC9" }}>Nee</button></span>
                ) : (
                  <button onClick={() => setConfirmDel(c.id)} className="flex items-center gap-1.5 text-sm" style={{ color: "#F0453F", fontWeight: 600 }}><Trash2 size={14} /> Verwijderen</button>
                )}
              </div>
            </Card>
          ); })}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "Inter", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: "1px solid #232B38" }}>{["Datum", "Voertuig", "Categorie", "Omschrijving", "Bedrag", ""].map((h) => <th key={h} className="text-left px-4 py-3" style={{ color: "#B4BCC9", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>
              {sorted.map((c) => { const meta = costCatMeta(c.categorie); return (
                <tr key={c.id} style={{ borderBottom: "1px solid #1A2129" }}>
                  <td className="px-4 py-3" style={{ color: "#B4BCC9", fontFamily: "JetBrains Mono" }}>{c.datum}</td>
                  <td className="px-4 py-3" style={{ color: "#E7ECF3" }}>{c.vehicle}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded" style={{ color: meta.color, border: `1px solid ${meta.color}55`, fontWeight: 600 }}>{meta.label}</span></td>
                  <td className="px-4 py-3" style={{ color: "#B4BCC9" }}>{c.omschrijving || "—"}</td>
                  <td className="px-4 py-3" style={{ color: "#E7ECF3", fontFamily: "JetBrains Mono", fontWeight: 700 }}>{euro(Number(c.bedrag) || 0)}</td>
                  <td className="px-4 py-3">
                    {confirmDel === c.id ? (
                      <span className="flex items-center gap-2"><button onClick={() => { onDelete(c.id); setConfirmDel(null); }} className="text-xs" style={{ color: "#F0453F", fontWeight: 700 }}>Bevestig</button><button onClick={() => setConfirmDel(null)} className="text-xs" style={{ color: "#B4BCC9" }}>Nee</button></span>
                    ) : (
                      <button onClick={() => setConfirmDel(c.id)} style={{ color: "#F0453F" }}><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   ABONNEMENTSCODES — alleen de platformbeheerder (superadmin) maakt hier
   codes aan. Codes die jij aanmaakt zijn standaard GRATIS (paid = false);
   voor de rest zet je de schakelaar op "Betaald". De gegevens die je hier
   invult, staan straks al klaar bij "Bedrijf activeren".
--------------------------------------------------------------------- */
function CodesView({ live, companies = [] }) {
  const isMobile = useIsMobile();
  const blank = () => ({ companyName: "", adminNaam: "", adminEmail: "", adminTelefoon: "", note: "", paid: false, periodMonths: 1 });
  const [form, setForm] = useState(blank());
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const [toast, setToast] = useState("");
  const [emailNew, setEmailNew] = useState(true);
  const compName = (c) => c.company_name || (companies.find((x) => x.id === c.company_id) || {}).name || "—";

  const load = async () => {
    if (!live) return;
    setLoading(true); setErr("");
    try { setCodes(await listActivationCodes()); }
    catch (e) { setErr(e?.message || "Kon codes niet laden."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [live]);

  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");
  const submit = async () => {
    setErr("");
    try {
      setBusy(true);
      const code = await createActivationCode(form);
      // Nieuw bedrijf meteen mailen met de code (als er een e-mailadres is en de
      // schakelaar "mailen" aan staat).
      if (emailNew && validEmail(form.adminEmail) && code) {
        try {
          await sendActivationEmail({ email: form.adminEmail.trim(), code, companyName: form.companyName, adminNaam: form.adminNaam });
          setToast(`Code gemaild naar ${form.adminEmail.trim()}.`);
        } catch (mailErr) {
          setToast(`Code aangemaakt, maar mailen mislukte: ${mailErr.message || "fout"}. Je kunt 'm nog kopiëren.`);
        }
      } else {
        setToast("Code aangemaakt.");
      }
      setForm(blank());
      await load();
    } catch (e) {
      setErr(e?.message || "Kon de code niet aanmaken.");
    } finally { setBusy(false); }
  };

  const copy = async (code) => {
    try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(""), 1500); } catch {}
  };
  const fmtCode = (c) => (c || "").replace(/(\d{4})(?=\d)/g, "$1 ");

  if (!live) {
    return (
      <div className="space-y-5">
        <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Ticket size={22} color="#3B82F6" /> Abonnementscodes</h1>
        <Card><div style={{ padding: 16, fontFamily: "Inter", fontSize: 14, color: "#B4BCC9" }}>Codes aanmaken werkt alleen op de live-omgeving (met Supabase gekoppeld).</div></Card>
      </div>
    );
  }

  const active = codes.filter((c) => c.status === "used");
  const unusedCount = codes.length - active.length;
  const paidActive = active.filter((c) => c.paid).length;
  const freeActive = active.length - paidActive;

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
      <div>
        <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Ticket size={22} color="#3B82F6" /> Abonnementen</h1>
        <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Overzicht van lopende abonnementen en 12-cijferige activatiecodes. Codes die jij aanmaakt zijn standaard gratis; zet de schakelaar op "Betaald" wanneer nodig.</p>
      </div>

      {/* Overzicht lopende abonnementen */}
      <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {[
          { label: "Lopende abonnementen", val: active.length, color: "#3B82F6" },
          { label: "Betaald", val: paidActive, color: "#F59E0B" },
          { label: "Gratis (door jou)", val: freeActive, color: "#34D399" },
          { label: "Ongebruikte codes", val: unusedCount, color: "#98A1B0" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div style={{ fontFamily: "Oswald", fontSize: 30, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontFamily: "Inter", fontSize: 12, color: "#98A1B0", marginTop: 4 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {active.length > 0 && (
        <Card className="overflow-x-auto">
          <div style={{ padding: "12px 16px 0", fontFamily: "Inter", fontSize: 12, fontWeight: 700, color: "#98A1B0", textTransform: "uppercase", letterSpacing: 0.5 }}>Lopende abonnementen</div>
          <table className="w-full" style={{ fontFamily: "Inter", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: "1px solid #232B38" }}>{["Bedrijf", "Type", "Sinds", "Verlengt / status", "Code"].map((h) => <th key={h} className="text-left px-4 py-3" style={{ color: "#B4BCC9", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>
              {active.map((c) => {
                const comp = companies.find((x) => x.id === c.company_id) || {};
                const sub = c.paid === false
                  ? { txt: "Gratis — geen verlenging", col: "#34D399" }
                  : comp.cancelled
                    ? { txt: `Opgezegd — tot ${(comp.cancel_at || "").slice(0, 10) || "?"}`, col: "#F59E0B" }
                    : comp.renews_at
                      ? { txt: (comp.renews_at || "").slice(0, 10), col: "#B4BCC9" }
                      : { txt: "—", col: "#6B7585" };
                return (
                <tr key={c.code} style={{ borderBottom: "1px solid #1A2129" }}>
                  <td className="px-4 py-3" style={{ color: "#E7ECF3", fontWeight: 600 }}>{compName(c)}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded" style={{ color: c.paid ? "#F59E0B" : "#34D399", border: `1px solid ${(c.paid ? "#F59E0B" : "#34D399")}55`, fontWeight: 600 }}>{c.paid ? "Betaald" : "Gratis"}</span></td>
                  <td className="px-4 py-3" style={{ color: "#B4BCC9", fontFamily: "JetBrains Mono" }}>{(c.used_at || "").slice(0, 10) || "—"}</td>
                  <td className="px-4 py-3" style={{ color: sub.col, fontFamily: "JetBrains Mono", fontSize: 12 }}>{sub.txt}</td>
                  <td className="px-4 py-3" style={{ color: "#6B7585", fontFamily: "JetBrains Mono" }}>{fmtCode(c.code)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Card>
        <div style={{ padding: 16 }}>
          <div style={{ fontFamily: "Inter", fontSize: 12, fontWeight: 700, color: "#98A1B0", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Nieuwe code</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)" }}>
            <label style={fieldLabel}>Bedrijfsnaam<input style={codeInput} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Bv. Jansen Transport" /></label>
            <label style={fieldLabel}>Naam beheerder<input style={codeInput} value={form.adminNaam} onChange={(e) => setForm({ ...form, adminNaam: e.target.value })} placeholder="Voor- en achternaam" /></label>
            <label style={fieldLabel}>E-mail beheerder<input style={codeInput} value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} placeholder="naam@bedrijf.nl" /></label>
            <label style={fieldLabel}>Telefoon (optioneel)<input style={codeInput} value={form.adminTelefoon} onChange={(e) => setForm({ ...form, adminTelefoon: e.target.value })} placeholder="+31 6 …" /></label>
            <label style={{ ...fieldLabel, gridColumn: isMobile ? "auto" : "1 / -1" }}>Notitie (optioneel, alleen voor jezelf)<input style={codeInput} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Bv. jaarabonnement 2026" /></label>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 14 }}>
            <button type="button" onClick={() => setForm({ ...form, paid: !form.paid })} className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ border: "1px solid #232B38", background: "#12171F" }}>
              <span className="rounded-full flex items-center" style={{ width: 34, height: 20, background: form.paid ? "#3B82F6" : "#2A3340", padding: 2 }}>
                <span className="rounded-full" style={{ width: 16, height: 16, background: "#fff", transform: form.paid ? "translateX(14px)" : "translateX(0)", transition: "transform .2s" }} />
              </span>
              <span style={{ fontFamily: "Inter", fontSize: 13, fontWeight: 600, color: "#E7ECF3" }}>{form.paid ? "Betaald abonnement" : "Gratis (door jou uitgegeven)"}</span>
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              {form.paid && (
                <label className="flex items-center gap-2" style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0" }}>
                  Verlengt per
                  <select className="tg-input" style={{ width: "auto" }} value={form.periodMonths} onChange={(e) => setForm({ ...form, periodMonths: Number(e.target.value) })}>
                    <option value={1}>maand</option>
                    <option value={12}>jaar</option>
                  </select>
                </label>
              )}
              <Button icon={Plus} onClick={submit} disabled={busy}>{busy ? "Aanmaken…" : "Code aanmaken"}</Button>
            </div>
          </div>
          {/* Nieuw bedrijf direct de code mailen */}
          <label className="flex items-center gap-2.5 mt-3" style={{ cursor: "pointer" }}>
            <span onClick={() => setEmailNew((v) => !v)} className="rounded-full flex items-center" style={{ width: 34, height: 20, background: emailNew ? "#3B82F6" : "#2A3340", padding: 2, flexShrink: 0 }}>
              <span className="rounded-full" style={{ width: 16, height: 16, background: "#fff", transform: emailNew ? "translateX(14px)" : "translateX(0)", transition: "transform .2s" }} />
            </span>
            <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9" }}>Code direct per e-mail naar de beheerder sturen (als er een e-mailadres is ingevuld)</span>
          </label>
          {err && <div style={{ color: "#F0453F", fontFamily: "Inter", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <div style={{ padding: "12px 16px 0", fontFamily: "Inter", fontSize: 12, fontWeight: 700, color: "#98A1B0", textTransform: "uppercase", letterSpacing: 0.5 }}>Alle uitgegeven codes</div>
        <table className="w-full" style={{ fontFamily: "Inter", fontSize: 13 }}>
          <thead><tr style={{ borderBottom: "1px solid #232B38" }}>{["Code", "Bedrijf", "Type", "Status", ""].map((h) => <th key={h} className="text-left px-4 py-3" style={{ color: "#B4BCC9", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-6" style={{ color: "#98A1B0", textAlign: "center" }}>Laden…</td></tr>
            ) : codes.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6" style={{ color: "#98A1B0", textAlign: "center" }}>Nog geen codes uitgegeven.</td></tr>
            ) : codes.map((c) => (
              <tr key={c.code} style={{ borderBottom: "1px solid #1A2129" }}>
                <td className="px-4 py-3" style={{ color: "#E7ECF3", fontFamily: "JetBrains Mono", fontWeight: 700, letterSpacing: 1 }}>{fmtCode(c.code)}</td>
                <td className="px-4 py-3" style={{ color: "#B4BCC9" }}>{compName(c)}</td>
                <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded" style={{ color: c.paid ? "#F59E0B" : "#34D399", border: `1px solid ${(c.paid ? "#F59E0B" : "#34D399")}55`, fontWeight: 600 }}>{c.paid ? "Betaald" : "Gratis"}</span></td>
                <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded" style={{ color: c.status === "used" ? "#98A1B0" : "#3B82F6", border: `1px solid ${(c.status === "used" ? "#98A1B0" : "#3B82F6")}55`, fontWeight: 600 }}>{c.status === "used" ? "Gebruikt" : "Ongebruikt"}</span></td>
                <td className="px-4 py-3">
                  {c.status !== "used" && (
                    <button onClick={() => copy(c.code)} className="flex items-center gap-1.5 text-xs" style={{ color: copied === c.code ? "#34D399" : "#8FB8FF", fontWeight: 600 }}>
                      {copied === c.code ? <><Check size={13} /> Gekopieerd</> : <><Copy size={13} /> Kopieer</>}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
const fieldLabel = { display: "flex", flexDirection: "column", gap: 5, fontFamily: "Inter", fontSize: 12, fontWeight: 600, color: "#98A1B0" };
const codeInput = { background: "#161C25", border: "1px solid #2A3340", color: "#E7ECF3", borderRadius: 9, padding: "10px 11px", fontFamily: "Inter", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" };

/* ---------------------------------------------------------------------
   BEDRIJVEN & GEBRUIKERS — platformbeheer: bedrijven/gebruikers verwijderen
   en superadmins benoemen. Alleen zichtbaar voor de superadmin.
--------------------------------------------------------------------- */
function CompaniesAdminView({ live, companies = [], currentUserId, currentCompanyId, onRemoveCompany }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [confirmComp, setConfirmComp] = useState(null);
  const [confirmUser, setConfirmUser] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!live) return;
    setLoading(true); setErr("");
    try { setProfiles(await adminListProfiles()); }
    catch (e) { setErr(e?.message || "Kon gebruikers niet laden."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [live]);

  const roleLabel = (u) => (u.is_superadmin ? "Superadmin" : u.rol === "admin" ? "Beheerder" : u.rol === "garage" ? "Werkplaats" : "Chauffeur");
  const usersOf = (cid) => profiles.filter((p) => p.company_id === cid);

  const delCompany = async (c) => {
    setErr(""); setBusy(true);
    try { await adminDeleteCompany(c.id); onRemoveCompany && onRemoveCompany(c.id); setConfirmComp(null); await load(); }
    catch (e) { setErr(mapAdminErr(e)); }
    finally { setBusy(false); }
  };
  const delUser = async (u) => {
    setErr(""); setBusy(true);
    try { await adminDeleteUser(u.id); setConfirmUser(null); await load(); }
    catch (e) { setErr(mapAdminErr(e)); }
    finally { setBusy(false); }
  };
  const toggleSuper = async (u) => {
    setErr(""); setBusy(true);
    try { await setUserSuperadmin(u.id, !u.is_superadmin); await load(); }
    catch (e) { setErr(mapAdminErr(e)); }
    finally { setBusy(false); }
  };

  if (!live) {
    return (
      <div className="space-y-5">
        <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Building2 size={22} color="#3B82F6" /> Bedrijven &amp; gebruikers</h1>
        <Card><div style={{ padding: 16, fontFamily: "Inter", fontSize: 14, color: "#B4BCC9" }}>Werkt alleen op de live-omgeving (met Supabase gekoppeld).</div></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Building2 size={22} color="#3B82F6" /> Bedrijven &amp; gebruikers</h1>
        <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>{companies.length} bedrijf/bedrijven · {profiles.length} gebruiker(s). Verwijder bedrijven of gebruikers, of benoem een superadmin.</p>
      </div>
      {err && <div style={{ color: "#F0453F", fontFamily: "Inter", fontSize: 12.5 }}>{err}</div>}
      {loading ? (
        <Card><div style={{ padding: 20, textAlign: "center", color: "#98A1B0", fontFamily: "Inter" }}>Laden…</div></Card>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => {
            const users = usersOf(c.id);
            const open = expanded === c.id;
            const isOwn = c.id === currentCompanyId;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button onClick={() => setExpanded(open ? null : c.id)} className="flex items-center gap-2 text-left" style={{ minWidth: 0 }}>
                    <ChevronRight size={16} color="#98A1B0" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
                    <span style={{ width: 9, height: 9, borderRadius: 5, background: c.accent || "#3B82F6", flexShrink: 0 }} />
                    <span style={{ fontFamily: "Inter", fontSize: 15, fontWeight: 700, color: "#E7ECF3" }}>{c.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ color: "#98A1B0", border: "1px solid #232B38" }}>{users.length} gebr.</span>
                    {isOwn && <span className="text-xs px-1.5 rounded" style={{ color: "#F5B301", background: "#F5B30118", fontWeight: 600 }}>jouw bedrijf</span>}
                  </button>
                  {!isOwn && (confirmComp === c.id ? (
                    <span className="flex items-center gap-2">
                      <Button small variant="danger" onClick={() => delCompany(c)} disabled={busy}>{busy ? "Bezig…" : "Ja, bedrijf wissen"}</Button>
                      <Button small variant="ghost" onClick={() => setConfirmComp(null)}>Nee</Button>
                    </span>
                  ) : (
                    <Button small variant="ghost" icon={Trash2} onClick={() => setConfirmComp(c.id)}>Bedrijf verwijderen</Button>
                  ))}
                </div>

                {open && (
                  <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid #1A2129" }}>
                    {users.length === 0 ? <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0" }}>Geen gebruikers.</div> : users.map((u) => {
                      const self = u.id === currentUserId;
                      return (
                        <div key={u.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg flex-wrap" style={{ background: "#161C25", border: "1px solid #232B38" }}>
                          <div style={{ minWidth: 0 }}>
                            <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                              {u.is_superadmin && <Crown size={13} color="#F5B301" style={{ flexShrink: 0 }} />}
                              <span style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, color: "#E7ECF3" }}>{u.naam}</span>
                              <span className="text-xs px-1.5 rounded" style={{ color: u.is_superadmin ? "#F5B301" : "#3B82F6", background: (u.is_superadmin ? "#F5B301" : "#3B82F6") + "18", flexShrink: 0 }}>{roleLabel(u)}</span>
                            </div>
                            <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0" }}>{u.email}</div>
                          </div>
                          {self ? (
                            <span style={{ fontFamily: "Inter", fontSize: 11.5, color: "#6B7585" }}>jij</span>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <button onClick={() => toggleSuper(u)} disabled={busy} className="text-xs px-2 py-1 rounded-lg flex items-center gap-1" style={{ border: "1px solid #232B38", color: u.is_superadmin ? "#98A1B0" : "#F5B301", fontFamily: "Inter", fontWeight: 600 }}>
                                <Crown size={12} /> {u.is_superadmin ? "Superadmin af" : "Maak superadmin"}
                              </button>
                              {confirmUser === u.id ? (
                                <span className="flex items-center gap-1.5">
                                  <button onClick={() => delUser(u)} disabled={busy} className="text-xs px-2 py-1 rounded-lg" style={{ background: "#F0453F", color: "#fff", fontWeight: 700 }}>{busy ? "…" : "Wissen"}</button>
                                  <button onClick={() => setConfirmUser(null)} className="text-xs px-2 py-1" style={{ color: "#B4BCC9" }}>Nee</button>
                                </span>
                              ) : (
                                <button onClick={() => setConfirmUser(u.id)} className="text-xs flex items-center gap-1" style={{ color: "#F0453F", fontWeight: 600 }}><Trash2 size={13} /> Verwijderen</button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
function mapAdminErr(e) {
  const m = (e && e.message) || String(e);
  if (/CANNOT_DELETE_SELF/i.test(m)) return "Je kunt je eigen account niet verwijderen.";
  if (/CANNOT_DELETE_OWN/i.test(m)) return "Je kunt je eigen bedrijf niet verwijderen.";
  if (/CANNOT_CHANGE_SELF/i.test(m)) return "Je kunt je eigen superadmin-status niet wijzigen.";
  if (/NOT_ALLOWED/i.test(m)) return "Alleen de platformbeheerder mag dit.";
  return m;
}

/* ---------------------------------------------------------------------
   MELDINGEN-INBOX — de platformbeheerder ziet hier alle probleemmeldingen
   die bedrijven vanuit hun Instellingen insturen, en zet de status.
--------------------------------------------------------------------- */
const TICKET_STATUS = { open: { label: "Open", color: "#F0453F" }, in_behandeling: { label: "In behandeling", color: "#F59E0B" }, opgelost: { label: "Opgelost", color: "#34D399" } };
function SupportInboxView({ live }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("alle");

  const load = async () => {
    if (!live) return;
    setLoading(true); setErr("");
    try { setTickets(await listSupportTickets()); }
    catch (e) { setErr(e?.message || "Kon meldingen niet laden."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [live]);

  const setStatus = async (t, status) => {
    setErr("");
    setTickets((s) => s.map((x) => (x.id === t.id ? { ...x, status } : x))); // optimistisch
    try { await setSupportTicketStatus(t.id, status); } catch (e) { setErr(e?.message || "Bijwerken mislukt."); load(); }
  };

  const shown = filter === "alle" ? tickets : tickets.filter((t) => t.status === filter);
  const openCount = tickets.filter((t) => t.status === "open").length;

  if (!live) {
    return (
      <div className="space-y-5">
        <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Inbox size={22} color="#3B82F6" /> Meldingen</h1>
        <Card><div style={{ padding: 16, fontFamily: "Inter", fontSize: 14, color: "#B4BCC9" }}>Meldingen werken alleen op de live-omgeving (met Supabase gekoppeld).</div></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Inbox size={22} color="#3B82F6" /> Meldingen</h1>
          <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Problemen en vragen die bedrijven insturen{openCount > 0 ? ` · ${openCount} open` : ""}.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {["alle", "open", "in_behandeling", "opgelost"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ fontFamily: "Inter", fontWeight: 600, border: `1px solid ${filter === f ? "#3B82F6" : "#232B38"}`, background: filter === f ? "#3B82F618" : "transparent", color: filter === f ? "#3B82F6" : "#B4BCC9" }}>{f === "alle" ? "Alle" : (TICKET_STATUS[f]?.label || f)}</button>
          ))}
        </div>
      </div>
      {err && <div style={{ color: "#F0453F", fontFamily: "Inter", fontSize: 12.5 }}>{err}</div>}
      {loading ? (
        <Card><div style={{ padding: 20, textAlign: "center", color: "#98A1B0", fontFamily: "Inter" }}>Laden…</div></Card>
      ) : shown.length === 0 ? (
        <EmptyState icon={Inbox} text="Geen meldingen." />
      ) : (
        <div className="space-y-3">
          {shown.map((t) => {
            const meta = TICKET_STATUS[t.status] || TICKET_STATUS.open;
            return (
              <Card key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontFamily: "Inter", fontSize: 15, fontWeight: 700, color: "#E7ECF3" }}>{t.onderwerp || "Probleemmelding"}</span>
                      <span className="text-xs px-2 py-0.5 rounded" style={{ color: meta.color, border: `1px solid ${meta.color}55`, fontWeight: 600 }}>{meta.label}</span>
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0", marginTop: 2 }}>
                      {t.company_name || "Onbekend bedrijf"} · {t.reporter_naam || "—"}{t.reporter_email ? ` · ${t.reporter_email}` : ""} · {(t.created_at || "").slice(0, 10)}
                    </div>
                  </div>
                </div>
                <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#C4CBD6", marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{t.bericht}</div>
                <div className="flex items-center gap-2 mt-3 pt-3 flex-wrap" style={{ borderTop: "1px solid #1A2129" }}>
                  {t.reporter_email && <a href={`mailto:${t.reporter_email}?subject=${encodeURIComponent("Re: " + (t.onderwerp || "je melding"))}`} className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5" style={{ fontFamily: "Inter", fontWeight: 600, border: "1px solid #232B38", color: "#8FB8FF" }}><Mail size={13} /> Reageren</a>}
                  {["open", "in_behandeling", "opgelost"].filter((s) => s !== t.status).map((s) => (
                    <button key={s} onClick={() => setStatus(t, s)} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ fontFamily: "Inter", fontWeight: 600, border: "1px solid #232B38", color: TICKET_STATUS[s].color }}>→ {TICKET_STATUS[s].label}</button>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   SIDEBAR (grouped, matches Blex Fleet menu structure)
--------------------------------------------------------------------- */

function SidebarContent({ view, setView, openCount, company, currentUser, role, isSuperAdmin, onCompanyClick, onLogout, onClose, modules }) {
  // Onderste blok inklapbaar: zo hou je meer ruimte over voor het menu zelf.
  const [footOpen, setFootOpen] = useState(() => {
    try { return localStorage.getItem("tt_sidebar_foot") !== "0"; } catch { return true; }
  });
  const toggleFoot = () => setFootOpen((v) => { const nv = !v; try { localStorage.setItem("tt_sidebar_foot", nv ? "1" : "0"); } catch {} return nv; });
  return (
    <div className="flex flex-col py-6 px-4" style={{ height: "100%", minHeight: 0 }}>
      <div className="flex items-center justify-between px-2 mb-6" style={{ flexShrink: 0 }}>
        <button onClick={() => { setView("dashboard"); onClose && onClose(); }} className="flex items-center gap-2">
          <div style={{ fontFamily: "Oswald", fontSize: 18, fontWeight: 700, color: "#E7ECF3", letterSpacing: 0.5 }}>TRUCK <span style={{ color: "#3B82F6" }}>&amp;</span> TRAILER</div>
        </button>
        {onClose && <button onClick={onClose} aria-label="Menu sluiten"><X size={20} color="#B4BCC9" /></button>}
      </div>

      <nav className="space-y-5 flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {NAV_GROUPS.filter((g) => g.roles.includes(role)).map((g, gi) => {
          const items = g.items.filter((n) => (!n.roles || n.roles.includes(role)) && modOn(modules, n.module));
          if (items.length === 0) return null;
          return (
          <div key={g.group + gi}>
            <div className="px-3 mb-1.5" style={{ color: "#98A1B0", fontFamily: "Inter", fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>{g.group}</div>
            <div className="space-y-1">
              {items.map((n) => {
                const active = view === n.id;
                return (
                  <button key={n.id} onClick={() => { setView(n.id); onClose && onClose(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left"
                    style={{ background: active ? "#3B82F618" : "transparent", color: active ? "#3B82F6" : "#C4CBD6", fontSize: 14, fontWeight: active ? 600 : 500 }}>
                    <n.icon size={16} />
                    <span className="flex-1">{n.label}</span>
                    {n.badgeKey === "openCount" && openCount > 0 && <span className="w-2 h-2 rounded-full" style={{ background: "#3B82F6" }} />}
                    {n.id === "workfloor" && openCount > 0 && <span className="text-xs px-1.5 rounded-full" style={{ background: "#F0453F", color: "#fff", fontWeight: 700 }}>{openCount}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          );
        })}

        {isSuperAdmin && (
          <div>
            <div className="px-3 mb-1.5 flex items-center gap-1.5" style={{ color: "#F5B301", fontFamily: "Inter", fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}><Crown size={13} /> Platform (superadmin)</div>
            <div className="space-y-1">
              <button onClick={() => { setView("codes"); onClose && onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left"
                style={{ background: view === "codes" ? "#3B82F618" : "transparent", color: view === "codes" ? "#3B82F6" : "#C4CBD6", fontSize: 14, fontWeight: view === "codes" ? 600 : 500 }}>
                <Ticket size={16} />
                <span className="flex-1">Abonnementen</span>
              </button>
              <button onClick={() => { setView("support"); onClose && onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left"
                style={{ background: view === "support" ? "#3B82F618" : "transparent", color: view === "support" ? "#3B82F6" : "#C4CBD6", fontSize: 14, fontWeight: view === "support" ? 600 : 500 }}>
                <Inbox size={16} />
                <span className="flex-1">Meldingen</span>
              </button>
              <button onClick={() => { setView("admincompanies"); onClose && onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left"
                style={{ background: view === "admincompanies" ? "#3B82F618" : "transparent", color: view === "admincompanies" ? "#3B82F6" : "#C4CBD6", fontSize: 14, fontWeight: view === "admincompanies" ? 600 : 500 }}>
                <Building2 size={16} />
                <span className="flex-1">Bedrijven &amp; gebruikers</span>
              </button>
            </div>
          </div>
        )}
      </nav>

      <div className="pt-3 mt-3" style={{ borderTop: "1px solid #1A2129", flexShrink: 0 }}>
        <button onClick={toggleFoot} className="w-full flex items-center gap-2 px-2 pb-2" aria-label={footOpen ? "Account inklappen" : "Account uitklappen"}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", position: "relative", background: isSuperAdmin ? "#F5B30122" : "#3B82F633", border: `1px solid ${isSuperAdmin ? "#F5B30188" : "#3B82F655"}`, flexShrink: 0 }} className="flex items-center justify-center">
            <span style={{ color: isSuperAdmin ? "#F5B301" : "#3B82F6", fontFamily: "Inter", fontWeight: 700, fontSize: 10 }}>{currentUser.naam.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
          </div>
          <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#E7ECF3", fontWeight: 600, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.naam}</span>
          <ChevronDown size={15} color="#B4BCC9" style={{ flexShrink: 0, transform: footOpen ? "rotate(0deg)" : "rotate(180deg)", transition: "transform .15s" }} />
        </button>
        {footOpen && (
          <div className="space-y-2 pb-1">
            <button onClick={isSuperAdmin ? onCompanyClick : undefined} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-full" style={{ border: "1px solid #232B38", background: "#12171F", cursor: isSuperAdmin ? "pointer" : "default" }}>
              <Building2 size={14} color={company.accent} style={{ flexShrink: 0 }} />
              <span style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", fontWeight: 500, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{company.name}</span>
              {isSuperAdmin && <ChevronDown size={14} color="#B4BCC9" style={{ flexShrink: 0 }} />}
            </button>
            <div className="px-1">
              {isSuperAdmin
                ? <span className="text-xs px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ color: "#F5B301", background: "#F5B30118" }}><Crown size={11} /> Superadmin</span>
                : <span className="text-xs px-1.5 py-0.5 rounded inline-flex" style={{ color: "#3B82F6", background: "#3B82F618" }}>{ROLE_LABEL[role]}</span>}
            </div>
          </div>
        )}
        <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2 mt-2 rounded-lg" style={{ color: "#B4BCC9" }}>
          <LogOut size={15} /><span style={{ fontFamily: "Inter", fontSize: 13.5 }}>Uitloggen</span>
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   APP SHELL
--------------------------------------------------------------------- */

/* ---------------------------------------------------------------------
   CHAUFFEURS — certificatenbeheer (rijbewijs, Code 95, ADR, medische keuring)
--------------------------------------------------------------------- */
function ChauffeursView({ drivers, onAdd, onUpdate, onDelete, uren = [], isAdmin = false }) {
  const isMobile = useIsMobile();
  const blank = () => ({ naam: "", telefoon: "", rijbewijsTot: "", code95Tot: "", adrTot: "", medischTot: "", adrNvt: false, medischNvt: false });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(blank());
  const [confirmDel, setConfirmDel] = useState(null);
  const [sort, setSort] = useState("naam"); // naam | nieuw | oud
  const [urenMaand, setUrenMaand] = useState(TODAY.slice(0, 7)); // JJJJ-MM

  // Sorteervolgorde. 'nieuw'/'oud' op basis van id (dat bevat de aanmaaktijd: "d"+Date.now()).
  const idTime = (d) => Number(String(d.id || "").replace(/\D/g, "")) || 0;
  const sortedDrivers = [...drivers].sort((a, b) =>
    sort === "naam" ? (a.naam || "").localeCompare(b.naam || "")
    : sort === "oud" ? idTime(a) - idTime(b)
    : idTime(b) - idTime(a));

  const startAdd = () => { setForm(blank()); setEditId(null); setOpen(true); };
  const startEdit = (d) => { setForm({ ...blank(), ...d }); setEditId(d.id); setOpen(true); };
  const submit = () => {
    if (!form.naam.trim()) return;
    if (editId) onUpdate({ ...form, id: editId }); else onAdd({ ...form, id: "d" + Date.now() });
    setOpen(false); setForm(blank()); setEditId(null);
  };

  const attention = drivers.filter((d) => { const w = driverWorstCompliance(d); return w === "verlopen" || w === "binnenkort"; }).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Contact size={22} color="#3B82F6" /> Chauffeurs</h1>
          <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>{drivers.length} chauffeur(s){attention > 0 ? ` · ${attention} met aandacht nodig` : ""}. Papieren & certificaten.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {drivers.length > 1 && (
            <select className="tg-input" style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="naam">Sorteer: naam (A–Z)</option>
              <option value="nieuw">Sorteer: nieuw → oud</option>
              <option value="oud">Sorteer: oud → nieuw</option>
            </select>
          )}
          {!open && <Button icon={Plus} onClick={startAdd}>Chauffeur toevoegen</Button>}
        </div>
      </div>

      {open && (
        <Card className="p-5">
          <div style={{ fontFamily: "Oswald", fontSize: 18, fontWeight: 600, color: "#E7ECF3", marginBottom: 12 }}>{editId ? "Chauffeur bewerken" : "Nieuwe chauffeur"}</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)" }}>
            <div style={{ minWidth: 0 }}><FieldLabel>Naam</FieldLabel><input className="tg-input w-full" placeholder="Bv. R. Postma" value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} /></div>
            <div style={{ minWidth: 0 }}><FieldLabel>Telefoon (optioneel)</FieldLabel><input className="tg-input w-full" placeholder="+31 6 ..." value={form.telefoon} onChange={(e) => setForm({ ...form, telefoon: e.target.value })} /></div>
            <div style={{ minWidth: 0 }}><FieldLabel>Rijbewijs C/CE geldig tot</FieldLabel><input type="date" className="tg-input w-full" value={form.rijbewijsTot} onChange={(e) => setForm({ ...form, rijbewijsTot: e.target.value })} /></div>
            <div style={{ minWidth: 0 }}><FieldLabel>Code 95 geldig tot</FieldLabel><input type="date" className="tg-input w-full" value={form.code95Tot} onChange={(e) => setForm({ ...form, code95Tot: e.target.value })} /></div>
            <div style={{ minWidth: 0 }}>
              <div className="flex items-center justify-between"><FieldLabel>ADR-certificaat tot</FieldLabel>
                <label className="flex items-center gap-1" style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0", cursor: "pointer" }}><input type="checkbox" checked={!!form.adrNvt} onChange={(e) => setForm({ ...form, adrNvt: e.target.checked })} /> n.v.t.</label>
              </div>
              <input type="date" className="tg-input w-full" disabled={!!form.adrNvt} value={form.adrTot} onChange={(e) => setForm({ ...form, adrTot: e.target.value })} style={form.adrNvt ? { opacity: 0.4 } : undefined} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="flex items-center justify-between"><FieldLabel>Medische keuring tot</FieldLabel>
                <label className="flex items-center gap-1" style={{ fontFamily: "Inter", fontSize: 11, color: "#98A1B0", cursor: "pointer" }}><input type="checkbox" checked={!!form.medischNvt} onChange={(e) => setForm({ ...form, medischNvt: e.target.checked })} /> n.v.t.</label>
              </div>
              <input type="date" className="tg-input w-full" disabled={!!form.medischNvt} value={form.medischTot} onChange={(e) => setForm({ ...form, medischTot: e.target.value })} style={form.medischNvt ? { opacity: 0.4 } : undefined} />
            </div>
          </div>
          <div className="flex gap-2 mt-4"><Button onClick={submit} disabled={!form.naam.trim()}>{editId ? "Opslaan" : "Toevoegen"}</Button><Button variant="ghost" onClick={() => { setOpen(false); setEditId(null); }}>Annuleren</Button></div>
        </Card>
      )}

      {drivers.length === 0 && !open ? <EmptyState icon={Contact} text="Nog geen chauffeurs. Voeg er een toe om papieren te bewaken." /> : (
        <div className="space-y-3">
          {sortedDrivers.map((d) => {
            const items = driverComplianceItems(d);
            return (
              <Card key={d.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "Inter", fontSize: 15.5, fontWeight: 700, color: "#E7ECF3" }}>{d.naam}</div>
                    {d.telefoon && <a href={`tel:${(d.telefoon || "").replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 mt-1" style={{ color: "#8FB8FF", fontFamily: "Inter", fontSize: 12.5, fontWeight: 600 }}><Phone size={12} /> {d.telefoon}</a>}
                  </div>
                  {(() => { const w = driverWorstCompliance(d); const m = COMPLIANCE_META[w]; return <span className="text-xs px-2 py-1 rounded" style={{ color: m.color, border: `1px solid ${m.color}55`, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>{w === "ok" ? "Papieren in orde" : m.label}</span>; })()}
                </div>
                {items.length > 0 && (
                  <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                    {items.map((it) => { const m = COMPLIANCE_META[it.status]; return (
                      <div key={it.key} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg" style={{ background: "#12171F", border: "1px solid #232B38", minWidth: 0 }}>
                        <span style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                        <span className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, background: m.color }} title={m.label} />
                      </div>
                    ); })}
                  </div>
                )}
                <div className="flex items-center justify-end gap-3 mt-3 pt-3" style={{ borderTop: "1px solid #1A2129" }}>
                  <button onClick={() => startEdit(d)} className="text-sm" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>Bewerken</button>
                  {confirmDel === d.id ? (
                    <span className="flex items-center gap-2"><button onClick={() => { onDelete(d.id); setConfirmDel(null); }} className="text-sm" style={{ color: "#F0453F", fontWeight: 700 }}>Bevestig</button><button onClick={() => setConfirmDel(null)} className="text-sm" style={{ color: "#B4BCC9" }}>Nee</button></span>
                  ) : (
                    <button onClick={() => setConfirmDel(d.id)} className="flex items-center gap-1.5 text-sm" style={{ color: "#F0453F", fontFamily: "Inter", fontWeight: 600 }}><Trash2 size={14} /> Verwijderen</button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Urenoverzicht (loonexport) — chauffeurs registreren hun uren in de
          app; hier ziet de beheerder per maand wie hoeveel werkte. */}
      {isAdmin && (() => {
        const maandUren = uren.filter((u) => (u.datum || "").slice(0, 7) === urenMaand);
        const perChauffeur = {};
        maandUren.forEach((u) => {
          const key = u.chauffeurId || u.chauffeur || "?";
          if (!perChauffeur[key]) perChauffeur[key] = { naam: u.chauffeur || "Onbekend", min: 0, dagen: new Set() };
          perChauffeur[key].min += workedMinutes(u.start, u.eind, u.pauze) || 0;
          perChauffeur[key].dagen.add(u.datum);
        });
        const rows = Object.values(perChauffeur).sort((a, b) => b.min - a.min);
        const exportLoon = () => {
          const data = [...maandUren]
            .sort((a, b) => (a.chauffeur || "").localeCompare(b.chauffeur || "") || (a.datum || "").localeCompare(b.datum || ""))
            .map((u) => { const w = workedMinutes(u.start, u.eind, u.pauze); return [u.chauffeur || "", u.datum, u.start, u.eind, u.pauze ? "45" : "0", w == null ? "" : fmtDecUur(w), u.note || ""]; });
          downloadCSV(`loonexport-${urenMaand}.csv`, ["Chauffeur", "Datum", "Begin", "Einde", "Pauze (min)", "Uren", "Notitie"], data);
        };
        return (
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: "#3B82F618" }}><Clock size={15} color="#3B82F6" /></div>
                <span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>Urenregistratie</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="month" className="tg-input" style={{ padding: "6px 8px", fontSize: 12.5, width: "auto" }} value={urenMaand} onChange={(e) => setUrenMaand(e.target.value)} aria-label="Maand kiezen" />
                <Button small variant="ghost" icon={Download} onClick={exportLoon} disabled={maandUren.length === 0}>Loonexport CSV</Button>
              </div>
            </div>
            {rows.length === 0 ? (
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#98A1B0" }}>
                Nog geen uren in deze maand. Chauffeurs vullen hun uren in via het tabblad "Mijn uren" in de app — die verschijnen hier automatisch.
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-3 rounded-lg" style={{ background: "#161C25", border: "1px solid #232B38" }}>
                    <span style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, color: "#E7ECF3", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.naam}</span>
                    <span style={{ flexShrink: 0 }}>
                      <span style={{ fontFamily: "Oswald", fontSize: 17, fontWeight: 700, color: "#3B82F6" }}>{fmtHM(r.min)}</span>
                      <span style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0", marginLeft: 8 }}>{r.dagen.size} {r.dagen.size === 1 ? "dag" : "dagen"}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })()}
    </div>
  );
}

// Aan/uit te zetten onderdelen. Een bedrijf kiest bij de start (of later in
// Instellingen) welke het gebruikt; uitgezette modules verdwijnen uit het menu.
const MODULE_DEFS = [
  { key: "rides", label: "Ritten & aflevering", desc: "Ritten plannen + digitaal afleverbewijs", icon: MapPin },
  { key: "planning", label: "Planning", desc: "Werkplaats-agenda inplannen", icon: Calendar },
  { key: "maintenance", label: "Voorspellend onderhoud", desc: "Onderhoud op km-stand & tijd", icon: Wrench },
  { key: "parts", label: "Voorraad", desc: "Onderdelen & voorraadbeheer", icon: Package },
  { key: "trailers", label: "Trailers", desc: "Aanhangers & opleggers", icon: IconTrailer },
  { key: "bakwagens", label: "Bakwagens", desc: "Bakwagens apart bijhouden", icon: Boxes },
  { key: "bestelwagens", label: "Bestelwagens", desc: "Bestelwagens apart bijhouden", icon: Truck },
  { key: "drivers", label: "Chauffeurs", desc: "Rijbewijs, Code 95, ADR, keuring", icon: Contact },
  { key: "inspection", label: "360° Inspectie", desc: "AI-schadeherkenning op foto's", icon: ScanEye },
  { key: "costs", label: "Kosten", desc: "Uitgaven per categorie & voertuig", icon: Euro },
  { key: "ai", label: "AI Assistent", desc: "Slimme hulp die ook acties uitvoert", icon: Sparkles },
];
const DEFAULT_MODULES = MODULE_DEFS.reduce((a, m) => { a[m.key] = true; return a; }, {});
// modules aan? (ontbrekende sleutel = aan, zodat bestaande bedrijven niks kwijtraken)
const modOn = (modules, key) => !key || (modules ? modules[key] !== false : true);
// welk scherm hoort bij welke module (voor de terugval als een module uit staat)
const VIEW_MODULE = { rides: "rides", planning: "planning", maintenance: "maintenance", parts: "parts", bakwagens: "bakwagens", bestelwagens: "bestelwagens", trailers: "trailers", drivers: "drivers", inspection: "inspection", costs: "costs", ai: "ai" };

// --- Routing: elk scherm een eigen pad (bv. /werkvloer). Eén app, maar de URL
// loopt mee zodat de terug-knop werkt, je kunt bookmarken en verversen op
// hetzelfde scherm blijft. ---
// De app draait onder /app; de landingspagina staat op /. Elk scherm heeft een
// eigen subpad (bv. /app/werkvloer) zodat terug/delen/verversen blijft werken.
const APP_PREFIX = "/app";
const VIEW_SUBPATHS = {
  dashboard: "", driver: "melding", ai: "ai", workfloor: "werkvloer", rides: "ritten",
  planning: "planning", maintenance: "onderhoud", parts: "voorraad",
  vehicles: "vrachtwagens", bakwagens: "bakwagens", bestelwagens: "bestelwagens",
  trailers: "trailers", drivers: "chauffeurs", inspection: "inspectie",
  costs: "kosten", settings: "instellingen", users: "gebruikers",
  codes: "abonnementen", support: "meldingen", admincompanies: "bedrijven",
  rapportage: "rapportage",
};
const SUBPATH_VIEWS = Object.fromEntries(Object.entries(VIEW_SUBPATHS).map(([v, p]) => [p, v]));
function viewToPath(view, selectedVehicleId) {
  if (view === "vehicles" && selectedVehicleId) return APP_PREFIX + "/vrachtwagens/" + encodeURIComponent(selectedVehicleId);
  const sub = VIEW_SUBPATHS[view] || "";
  return sub ? APP_PREFIX + "/" + sub : APP_PREFIX;
}
function pathToView(pathname) {
  const clean = (pathname || "/").replace(/\/+$/, "") || "/";
  if (clean === APP_PREFIX) return { view: "dashboard", sel: null };
  if (!clean.startsWith(APP_PREFIX + "/")) return null; // buiten de app-zone
  const segs = clean.slice(APP_PREFIX.length + 1).split("/").filter(Boolean);
  if (segs.length === 0) return { view: "dashboard", sel: null };
  if (segs[0] === "vrachtwagens") {
    // Een kapotte percent-encoding mag de app niet laten crashen (wit scherm).
    let sel = null;
    if (segs[1]) { try { sel = decodeURIComponent(segs[1]); } catch { sel = segs[1]; } }
    return { view: "vehicles", sel };
  }
  const view = SUBPATH_VIEWS[segs[0]];
  return view ? { view, sel: null } : null;
}

const NAV_GROUPS = [
  { group: "Chauffeur", roles: ["admin", "garage", "chauffeur"], items: [
    { id: "driver", label: "Melding maken", icon: AlertTriangle, badgeKey: "openCount" },
  ]},
  { group: "Overzicht", roles: ["admin", "garage"], items: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "rides", label: "Ritten", icon: MapPin, roles: ["admin"], module: "rides" },
    { id: "rapportage", label: "Rapportage", icon: BarChart3, roles: ["admin"] },
    { id: "ai", label: "AI Assistent", icon: Sparkles, module: "ai" },
  ]},
  { group: "Werkplaats", roles: ["admin", "garage"], items: [
    { id: "workfloor", label: "Werkvloer", icon: KanbanSquare },
    { id: "planning", label: "Planning", icon: Calendar, module: "planning" },
    { id: "maintenance", label: "Onderhoud", icon: Wrench, module: "maintenance" },
    { id: "parts", label: "Voorraad", icon: Package, module: "parts" },
  ]},
  { group: "Vloot", roles: ["admin", "garage"], items: [
    { id: "vehicles", label: "Vrachtwagens", icon: IconTruckTrailer },
    { id: "bakwagens", label: "Bakwagens", icon: IconBoxTruck, module: "bakwagens" },
    { id: "bestelwagens", label: "Bestelwagens", icon: IconVan, module: "bestelwagens" },
    { id: "trailers", label: "Trailers", icon: IconTrailer, module: "trailers" },
    { id: "drivers", label: "Chauffeurs", icon: Contact, module: "drivers" },
  ]},
  { group: "Beheer", roles: ["admin", "garage"], items: [
    { id: "costs", label: "Kosten", icon: Euro, roles: ["admin"], module: "costs" },
    { id: "settings", label: "Instellingen", icon: SlidersHorizontal },
    { id: "users", label: "Gebruikers", icon: Users, roles: ["admin"] },
  ]},
];

/* ---------------------------------------------------------------------
   ONBOARDING — bij de eerste keer kiest het bedrijf welke onderdelen het gebruikt
--------------------------------------------------------------------- */
function OnboardingWizard({ company, onDone }) {
  const isMobile = useIsMobile();
  const [sel, setSel] = useState({ ...DEFAULT_MODULES });
  const toggle = (k) => setSel((s) => ({ ...s, [k]: !s[k] }));
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "#0A0E14", overflowY: "auto", padding: 16 }}>
      <div style={{ maxWidth: 560, margin: "0 auto", paddingTop: 22, paddingBottom: 40 }}>
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: "Oswald", fontSize: 24, fontWeight: 700, color: "#E7ECF3", letterSpacing: 0.5 }}>TRUCK <span style={{ color: "#3B82F6" }}>&amp;</span> TRAILER</span>
        </div>
        <h1 style={{ fontFamily: "Oswald", fontSize: 26, fontWeight: 600, color: "#E7ECF3", textAlign: "center", marginTop: 8 }}>Welkom{company?.name ? `, ${company.name}` : ""}!</h1>
        <p style={{ fontFamily: "Inter", fontSize: 14, color: "#B4BCC9", textAlign: "center", lineHeight: 1.5, margin: "8px auto 20px", maxWidth: 440 }}>
          Kies welke onderdelen je wilt gebruiken. Wat je uitzet zie je niet in het menu — je kunt het later altijd aanpassen bij <b>Instellingen</b>.
        </p>
        <div className="grid gap-2" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)" }}>
          {MODULE_DEFS.map((m) => {
            const on = sel[m.key] !== false;
            return (
              <button key={m.key} onClick={() => toggle(m.key)} className="flex items-center gap-3 p-3 rounded-xl text-left" style={{ background: on ? "#12233E" : "#12171F", border: `1px solid ${on ? "#3B82F6" : "#232B38"}` }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: on ? "#3B82F6" : "#1A2129", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><m.icon size={17} color={on ? "#fff" : "#98A1B0"} /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>{m.label}</span>
                  <span style={{ display: "block", fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0" }}>{m.desc}</span>
                </span>
                <span className="rounded-full flex items-center" style={{ width: 34, height: 20, background: on ? "#3B82F6" : "#2A3340", padding: 2, flexShrink: 0 }}>
                  <span className="rounded-full" style={{ width: 16, height: 16, background: "#fff", transform: on ? "translateX(14px)" : "translateX(0)", transition: "transform .2s" }} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={() => onDone(sel)}>Aan de slag →</Button>
          <button onClick={() => onDone({ ...DEFAULT_MODULES })} style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0", padding: 6 }}>Alles gebruiken</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   UITLEG PER ROL — de eerste keer krijgt elke gebruiker (chauffeur,
   werkplaats, beheerder) een korte rondleiding voor zijn eigen rol.
--------------------------------------------------------------------- */
const TUTORIALS = {
  chauffeur: {
    title: "Welkom, chauffeur!",
    intro: "Zo maak je met je telefoon snel een melding als er iets is met je wagen.",
    steps: [
      { icon: AlertTriangle, accent: "#3B82F6", visual: "melding", title: "Melding maken", text: "Tik op 'Melding maken', kies je voertuig en beschrijf kort wat er aan de hand is." },
      { icon: Camera, accent: "#A855F7", visual: "foto", title: "Foto erbij", text: "Maak een foto van het probleem. De app kan de schade zelfs automatisch herkennen." },
      { icon: Mic, accent: "#22D3B0", visual: "spraak", title: "Inspreken kan ook", text: "Geen zin om te typen? Spreek je melding gewoon in — de app zet het om in tekst." },
      { icon: CheckCircle2, accent: "#34D399", visual: "status", title: "Status volgen", text: "Onder 'Jouw meldingen' zie je of de werkplaats ermee bezig is: nieuw → in behandeling → klaar." },
    ],
  },
  garage: {
    title: "Welkom bij de werkplaats!",
    intro: "Hier houd je de werkvloer en de planning bij.",
    steps: [
      { icon: KanbanSquare, accent: "#3B82F6", visual: "kanban", title: "Werkvloer", text: "Binnengekomen meldingen zie je als kaarten. Verplaats ze van Nieuw → In behandeling → Klaar." },
      { icon: Calendar, accent: "#F59E0B", visual: "planning", title: "Inplannen", text: "Plan een klus in de agenda: kies bovenaan een openstaande melding, daarna dag, tijd en monteur." },
      { icon: Truck, accent: "#22D3B0", visual: "vloot", title: "Vloot & onderhoud", text: "Bekijk voertuigen en trailers en houd APK- en onderhoudstermijnen in de gaten." },
      { icon: Package, accent: "#A855F7", visual: "voorraad", title: "Voorraad", text: "Houd je onderdelen bij; bij een klus boek je gebruikte onderdelen meteen af." },
    ],
  },
  admin: {
    title: "Welkom, beheerder!",
    intro: "Jij beheert het hele bedrijf. Dit zijn de belangrijkste plekken:",
    steps: [
      { icon: LayoutDashboard, accent: "#3B82F6", visual: "dashboard", title: "Dashboard", text: "Begint met de planning van vandaag en de punten die aandacht nodig hebben." },
      { icon: Truck, accent: "#22D3B0", visual: "vloot", title: "Vloot & chauffeurs", text: "Beheer voertuigen, trailers en de papieren van chauffeurs (rijbewijs, Code 95, APK)." },
      { icon: Euro, accent: "#F59E0B", visual: "kosten", title: "Kosten", text: "Zie uitgaven per voertuig en categorie, en exporteer naar CSV." },
      { icon: Users, accent: "#A855F7", visual: "gebruikers", title: "Gebruikers", text: "Nodig chauffeurs uit met de bedrijfscode. Werkplaats- en beheerder-accounts maak je hier aan." },
      { icon: SlidersHorizontal, accent: "#EC4899", visual: "instellingen", title: "Instellingen", text: "Zet onderdelen aan/uit die je wel of niet gebruikt, en meld problemen rechtstreeks bij ons." },
    ],
  },
};

// Kleine, nagemaakte "screenshots" per stap — zo ziet de gebruiker meteen
// grafisch waar het over gaat, zonder echte schermafbeeldingen.
function TutorialVisual({ type, accent }) {
  const card = { background: "#0E131A", border: "1px solid #232B38", borderRadius: 10 };
  const chip = (txt) => <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: "#E7ECF3", background: "#0E131A", border: "1px solid #232B38", borderRadius: 6, padding: "3px 8px" }}>{txt}</span>;
  const pill = (txt, c) => <span style={{ fontFamily: "Inter", fontSize: 10.5, fontWeight: 600, color: c, border: `1px solid ${c}66`, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>{txt}</span>;
  const line = (w) => <span style={{ display: "block", height: 8, borderRadius: 4, background: "#232B38", width: w }} />;

  let inner = null;
  if (type === "melding") inner = (
    <div style={{ width: "100%", maxWidth: 250, display: "grid", gap: 10, ...card, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>{chip("GD-42-TR")}{pill("Kritiek", "#F0453F")}</div>
      {line("100%")}{line("65%")}
      <span style={{ marginTop: 2, alignSelf: "flex-start", fontFamily: "Inter", fontSize: 11.5, fontWeight: 600, color: "#fff", background: accent, borderRadius: 8, padding: "6px 14px" }}>Versturen</span>
    </div>
  );
  else if (type === "foto") inner = (
    <div style={{ width: "100%", maxWidth: 230, position: "relative" }}>
      <div style={{ height: 130, borderRadius: 12, background: `linear-gradient(135deg, ${accent}44, #0E131A)`, border: "1px solid #232B38", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Camera size={40} color={accent} />
      </div>
      <span style={{ position: "absolute", bottom: 8, left: 8, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "Inter", fontSize: 10.5, fontWeight: 600, color: "#0A0E14", background: "#34D399", borderRadius: 999, padding: "3px 9px" }}><Check size={12} /> Schade herkend</span>
    </div>
  );
  else if (type === "spraak") inner = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div style={{ width: 66, height: 66, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 8px ${accent}22` }}><Mic size={28} color="#fff" /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, height: 34 }}>
        {[12, 22, 34, 18, 28, 14, 26, 20, 10].map((h, i) => <span key={i} style={{ width: 4, height: h, borderRadius: 2, background: accent, opacity: 0.45 + h / 70 }} />)}
      </div>
    </div>
  );
  else if (type === "status") inner = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 7 }}>
      {pill("Nieuw", "#B4BCC9")}<ChevronRight size={15} color="#6B7585" />{pill("In behandeling", "#F59E0B")}<ChevronRight size={15} color="#6B7585" />{pill("Klaar", "#34D399")}
    </div>
  );
  else if (type === "kanban") inner = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, width: "100%", maxWidth: 290 }}>
      {[["Nieuw", "#B4BCC9", 1], ["Bezig", accent, 2], ["Klaar", "#34D399", 1]].map(([t, c, n], i) => (
        <div key={i} style={{ ...card, padding: 8, minHeight: 92 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: c }} /><span style={{ fontFamily: "Inter", fontSize: 9, color: "#98A1B0", fontWeight: 700 }}>{t}</span></div>
          {Array.from({ length: n }).map((_, j) => <div key={j} style={{ height: 22, borderRadius: 6, background: "#161C25", border: `1px solid ${i === 1 ? accent + "55" : "#232B38"}`, marginBottom: 5 }} />)}
        </div>
      ))}
    </div>
  );
  else if (type === "planning") inner = (
    <div style={{ width: "100%", maxWidth: 210, ...card, padding: 12 }}>
      {["08:00", "09:00", "10:00", "11:00"].map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, height: 30 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#6B7585", width: 34 }}>{t}</span>
          {i === 1 ? <span style={{ flex: 1, height: 20, borderRadius: 6, background: accent, display: "flex", alignItems: "center", paddingLeft: 8, fontFamily: "Inter", fontSize: 9.5, fontWeight: 700, color: "#0A0E14" }}>Grote beurt</span> : <span style={{ flex: 1, height: 1, background: "#1A2129" }} />}
        </div>
      ))}
    </div>
  );
  else if (type === "vloot") inner = (
    <div style={{ display: "grid", gap: 8, width: "100%", maxWidth: 240 }}>
      {[["DAF XF", "AJ-12-BT", "#34D399"], ["Volvo FH", "GK-88-PL", "#F59E0B"]].map(([m, k, c], i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...card, padding: "8px 10px" }}>
          <div><div style={{ fontFamily: "Inter", fontSize: 12.5, fontWeight: 600, color: "#E7ECF3" }}>{m}</div><div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#98A1B0" }}>{k}</div></div>
          <span style={{ width: 11, height: 11, borderRadius: 6, background: c, boxShadow: `0 0 0 3px ${c}22` }} />
        </div>
      ))}
    </div>
  );
  else if (type === "voorraad") inner = (
    <div style={{ display: "grid", gap: 8, width: "100%", maxWidth: 240 }}>
      {[["Remblokken", 12, "#34D399"], ["Oliefilter", 3, "#F59E0B"], ["Luchtfilter", 8, "#34D399"]].map(([n, q, c], i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...card, padding: "8px 10px" }}>
          <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#E7ECF3" }}>{n}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: c, background: c + "1A", borderRadius: 6, padding: "2px 9px" }}>{q}</span>
        </div>
      ))}
    </div>
  );
  else if (type === "dashboard") inner = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, width: "100%", maxWidth: 290 }}>
      {[["Vandaag", "4", accent], ["APK bijna", "2", "#F59E0B"], ["Open", "7", "#3B82F6"]].map(([l, v, c], i) => (
        <div key={i} style={{ ...card, padding: 10, textAlign: "center" }}>
          <div style={{ fontFamily: "Oswald", fontSize: 26, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</div>
          <div style={{ fontFamily: "Inter", fontSize: 9, color: "#98A1B0", marginTop: 4 }}>{l}</div>
        </div>
      ))}
    </div>
  );
  else if (type === "kosten") inner = (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 10, height: 120 }}>
      {[45, 72, 55, 96, 63].map((h, i) => <span key={i} style={{ width: 22, height: h, borderRadius: "5px 5px 0 0", background: i === 3 ? accent : accent + "55" }} />)}
    </div>
  );
  else if (type === "gebruikers") inner = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex" }}>
        {[["#3B82F6", "A"], ["#22D3B0", "B"], ["#A855F7", "C"]].map(([c, l], i) => <span key={i} style={{ width: 38, height: 38, borderRadius: "50%", background: c + "33", border: `2px solid ${c}`, marginLeft: i ? -10 : 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 700, fontSize: 13, color: c }}>{l}</span>)}
      </div>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, letterSpacing: 4, color: "#E7ECF3", background: "#0E131A", border: "1px solid #232B38", borderRadius: 8, padding: "6px 14px" }}>7K2Q90</span>
    </div>
  );
  else if (type === "instellingen") inner = (
    <div style={{ display: "grid", gap: 12, width: "100%", maxWidth: 220 }}>
      {[["Planning", true], ["Voorraad", true], ["Kosten", false]].map(([n, on], i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#E7ECF3" }}>{n}</span>
          <span style={{ width: 34, height: 20, borderRadius: 999, background: on ? accent : "#2A3340", padding: 2, display: "flex" }}><span style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", transform: on ? "translateX(14px)" : "none", transition: "transform .2s" }} /></span>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ background: `radial-gradient(120% 100% at 50% 0%, ${accent}1F, #12171F 70%)`, border: `1px solid ${accent}44`, borderRadius: 20, padding: 20, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {inner}
    </div>
  );
}

function RoleTutorial({ role, onDone }) {
  const t = TUTORIALS[role] || TUTORIALS.admin;
  const [i, setI] = useState(0);
  const step = t.steps[i];
  const last = i === t.steps.length - 1;
  const a = step.accent;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 85, background: "#0A0E14", overflowY: "auto", padding: 16, display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes tut-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}`}</style>
      <div style={{ maxWidth: 460, margin: "0 auto", width: "100%", paddingTop: 18, paddingBottom: 26, flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <span style={{ fontFamily: "Oswald", fontSize: 20, fontWeight: 700, color: "#E7ECF3", letterSpacing: 0.5 }}>TRUCK <span style={{ color: "#3B82F6" }}>&amp;</span> TRAILER</span>
        </div>

        {/* Voortgangsbalk: één segment per stap */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {t.steps.map((_, idx) => (
            <span key={idx} onClick={() => setI(idx)} style={{ flex: 1, height: 5, borderRadius: 3, cursor: "pointer", background: idx <= i ? a : "#232B38", transition: "background .3s" }} />
          ))}
        </div>

        <div key={i} style={{ animation: "tut-in .35s ease both" }}>
          <TutorialVisual type={step.visual} accent={a} />

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: `${a}22`, border: `1px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <step.icon size={20} color={a} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 700, color: a, textTransform: "uppercase", letterSpacing: 0.6 }}>Stap {i + 1} van {t.steps.length}</div>
              <div style={{ fontFamily: "Oswald", fontSize: 22, fontWeight: 600, color: "#E7ECF3", lineHeight: 1.1 }}>{step.title}</div>
            </div>
          </div>
          <p style={{ fontFamily: "Inter", fontSize: 14.5, color: "#B4BCC9", lineHeight: 1.55, marginTop: 12 }}>{step.text}</p>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 22 }}>
          <button onClick={() => (last ? onDone() : setI(i + 1))} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 13, borderRadius: 12, border: "none", background: `linear-gradient(180deg, ${a}, ${a}CC)`, color: "#fff", fontFamily: "Inter", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
            {last ? "Aan de slag →" : "Volgende"}
          </button>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} style={{ fontFamily: "Inter", fontSize: 12.5, color: i === 0 ? "#3A4250" : "#98A1B0", padding: 6, background: "none", border: "none", cursor: i === 0 ? "default" : "pointer" }}>← Terug</button>
            <button onClick={onDone} style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0", padding: 6, background: "none", border: "none", cursor: "pointer" }}>Overslaan</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Blokkeerscherm wanneer een opgezegd abonnement voorbij de einddatum is.
function SubscriptionEnded({ company, isAdmin, onReactivate, onLogout }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fmt = (d) => (d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "");
  const react = async () => { setErr(""); setBusy(true); try { await onReactivate(); } catch (e) { setErr(e?.message || "Er ging iets mis."); setBusy(false); } };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "#0A0E14", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div style={{ fontFamily: "Oswald", fontSize: 22, fontWeight: 700, color: "#E7ECF3", letterSpacing: 0.5, marginBottom: 18 }}>TRUCK <span style={{ color: "#3B82F6" }}>&amp;</span> TRAILER</div>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "#F59E0B22", border: "1px solid #F59E0B", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><KeyRound size={30} color="#F59E0B" /></div>
        <h1 style={{ fontFamily: "Oswald", fontSize: 24, fontWeight: 600, color: "#E7ECF3" }}>Abonnement verlopen</h1>
        <p style={{ fontFamily: "Inter", fontSize: 14, color: "#B4BCC9", lineHeight: 1.55, margin: "10px auto 20px", maxWidth: 360 }}>
          Het abonnement van <b style={{ color: "#E7ECF3" }}>{company?.name || "dit bedrijf"}</b> is opgezegd en liep af op {fmt(company?.cancel_at)}. {isAdmin ? "Je kunt het hieronder weer heractiveren." : "Vraag je beheerder om het abonnement te heractiveren."}
        </p>
        {err && <div style={{ color: "#F0453F", fontFamily: "Inter", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
        <div className="flex flex-col" style={{ gap: 8 }}>
          {isAdmin && <button onClick={react} disabled={busy} style={{ padding: 13, borderRadius: 12, border: "none", background: "linear-gradient(180deg,#4C8DFF,#3B82F6)", color: "#fff", fontFamily: "Inter", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>{busy ? "Bezig…" : "Abonnement heractiveren"}</button>}
          <button onClick={onLogout} style={{ padding: 10, borderRadius: 10, border: "1px solid #232B38", background: "transparent", color: "#B4BCC9", fontFamily: "Inter", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>Uitloggen</button>
        </div>
      </div>
    </div>
  );
}

export default function TruckGarageApp({ session, onLogout }) {
  const isMobile = useIsMobile();
  const aiReady = useAiStatus();
  const canCreateAccounts = useAdminAuthStatus();
  const live = !!session;
  const liveCompanyId = live ? session.company.id : "blex";

  const [currentUser, setCurrentUser] = useState(live ? { ...session.profile } : null);
  const [companyId, setCompanyId] = useState(liveCompanyId);
  const initRoute = (typeof window !== "undefined" ? pathToView(window.location.pathname) : null) || { view: "dashboard", sel: null };
  const [view, setViewRaw] = useState(initRoute.view);
  const [selectedVehicleId, setSelectedVehicleId] = useState(initRoute.sel);
  const setView = (v) => { if (v !== "vehicles") setSelectedVehicleId(null); setViewRaw(v); };
  // Houd de URL gelijk aan het huidige scherm (voor terug-knop / delen / verversen).
  const routeInit = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Demo/rondleiding (geen sessie): de URL niet omschrijven, zodat /demo blijft staan.
    if (!live) return;
    const path = viewToPath(view, selectedVehicleId);
    if (window.location.pathname === path) { routeInit.current = true; return; }
    if (!routeInit.current) { routeInit.current = true; window.history.replaceState({ view, selectedVehicleId }, "", path); }
    else window.history.pushState({ view, selectedVehicleId }, "", path);
  }, [view, selectedVehicleId]);
  // Terug/vooruit-knop van de browser: scherm uit de URL halen.
  useEffect(() => {
    const onPop = () => {
      const r = pathToView(window.location.pathname);
      if (!r) {
        // De URL wees buiten de app-zone (bv. terug naar "/"). Een ingelogde
        // gebruiker hoort in de app te blijven — zet de URL terug op /app zodat
        // scherm en adresbalk in sync blijven.
        if (live) { try { window.history.replaceState(null, "", viewToPath("dashboard")); } catch { /* noop */ } }
        setViewRaw("dashboard"); setSelectedVehicleId(null);
        return;
      }
      setViewRaw(r.view); setSelectedVehicleId(r.sel);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [live]);
  const [companyPicker, setCompanyPicker] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Superadmin? Dan is álle bedrijfsdata geladen (session.allCompanies) zodat je
  // tussen bedrijven kunt wisselen. Anders alleen je eigen bedrijf.
  const superList = live && Array.isArray(session.allCompanies) && session.allCompanies.length ? session.allCompanies : null;
  const initSlice = (key, seed, emptyVal = []) => {
    if (!live) return seed;
    if (superList) {
      const m = {};
      superList.forEach((x) => { const v = x.state ? x.state[key] : undefined; m[x.company.id] = v != null ? v : emptyVal; });
      m[liveCompanyId] = session.state[key] != null ? session.state[key] : emptyVal;
      return m;
    }
    return { [liveCompanyId]: session.state[key] != null ? session.state[key] : emptyVal };
  };

  const [companies, setCompanies] = useState(
    !live ? seedCompanies
      : superList
        ? superList.map((x) => ({ id: x.company.id, name: x.company.name, slug: x.company.slug, accent: x.company.accent, join_code: x.company.join_code }))
        : [{ id: session.company.id, name: session.company.name, slug: session.company.slug, accent: session.company.accent, join_code: session.company.join_code }]
  );
  const [vehicles, setVehicles] = useState(() => initSlice("vehicles", seedVehicles));
  const [trailers, setTrailers] = useState(() => initSlice("trailers", seedTrailers));
  const [parts, setParts] = useState(() => initSlice("parts", seedParts));
  const [maintenance, setMaintenance] = useState(() => initSlice("maintenance", seedMaintenance));
  const [costs, setCosts] = useState(() => initSlice("costs", seedCosts));
  const [reports, setReports] = useState(() => initSlice("reports", seedReports));
  // Dagelijkse voertuigchecks (DVIR). Server-authoritatief: alleen chauffeurs
  // voegen ze toe (driver_add_check); de save-dataset stuurt ze niet mee.
  const [checks, setChecks] = useState(() => initSlice("checks", seedChecks));
  // Ritten + digitale aflevering (POD). De beheerder plant; de chauffeur tekent
  // af via driver_complete_ride (de server beschermt afgeleverde ritten).
  const [rides, setRides] = useState(() => initSlice("rides", seedRides));
  // Uren-registraties (gesynchroniseerde kopie voor het loonoverzicht).
  const [uren, setUren] = useState(() => initSlice("uren", seedUren));
  const [users, setUsers] = useState(() => {
    if (!live) return seedUsers;
    const base = initSlice("users", seedUsers, []);
    const email = (session.profile.email || "").toLowerCase();
    // Ontdubbel: laat het eigen (echte) profiel niet ook nog als los JSON-record
    // verschijnen (bv. na 'Inlogaccount aanmaken').
    base[liveCompanyId] = [session.profile, ...((base[liveCompanyId] || []).filter((u) => u.id !== session.profile.id && (u.email || "").toLowerCase() !== email))];
    return base;
  });
  const [planning, setPlanning] = useState(() => initSlice("planning", seedPlanning));
  const [drivers, setDrivers] = useState(() => initSlice("drivers", seedDrivers));
  const [availability, setAvailability] = useState(() => initSlice("availability", seedAvailability, {}));
  const [workshopHours, setWorkshopHours] = useState(() => initSlice("workshopHours", seedWorkshopHours, { van: "08:00", tot: "17:00" }));
  // Bedrijfsprofiel: eigen logo + gegevens (adres/KvK/BTW/IBAN). Komt terug op de
  // werkbon/factuur zodat elk bedrijf op zijn eigen naam en huisstijl factureert.
  const [bedrijfsprofiel, setBedrijfsprofielState] = useState(() => initSlice("bedrijfsprofiel", {}, {}));
  const [modules, setModules] = useState(() => initSlice("modules", { blex: { ...DEFAULT_MODULES }, vandijk: { ...DEFAULT_MODULES } }, { ...DEFAULT_MODULES }));
  const [onboarded, setOnboarded] = useState(() => initSlice("onboarded", { blex: true, vandijk: true }, false));
  // Rol-uitleg: per gebruiker eenmalig (onthouden in de browser). Niet gevoelig,
  // dus localStorage volstaat — geen databasewijziging nodig.
  const tutKey = live ? "tt_tut_" + session.profile.id : "tt_tut_demo";
  const [tutorialSeen, setTutorialSeen] = useState(() => {
    if (!live) return true;
    try { return localStorage.getItem(tutKey) === "1"; } catch { return true; }
  });
  const markTutorialSeen = () => { setTutorialSeen(true); try { localStorage.setItem(tutKey, "1"); } catch {} };
  const replayTutorial = () => setTutorialSeen(false);
  const [saveStatus, setSaveStatus] = useState("saved"); // pending | saving | saved | error
  const firstSave = useRef(true);
  const lastCid = useRef(liveCompanyId);
  // Meldingen/kosten die bij het laden al bestonden. Bij het opslaan mogen
  // server-rijen die hier NIET in staan (dus nieuw sinds het laden, bv. een
  // chauffeursmelding) niet worden weggegooid — dat regelt save_company_state.
  const baseIds = useRef({
    reports: live && Array.isArray(session.state?.reports) ? session.state.reports.map((r) => r && r.id).filter(Boolean) : [],
    costs: live && Array.isArray(session.state?.costs) ? session.state.costs.map((c) => c && c.id).filter(Boolean) : [],
  });

  useEffect(() => {
    if (!live) return;
    // Chauffeurs slaan NOOIT de hele dataset op (ze hebben 'm ook niet); hun
    // meldingen gaan los via driver_add_report. Anders zou hun minimale weergave
    // de volledige bedrijfsdata overschrijven.
    if (session.profile.rol === "chauffeur") return;
    // Sla niet meteen op bij het laden — pas na een echte wijziging.
    if (firstSave.current) { firstSave.current = false; lastCid.current = companyId; return; }
    // Alleen van bedrijf gewisseld (superadmin)? Dan niets opslaan.
    if (lastCid.current !== companyId) { lastCid.current = companyId; return; }
    // Sla het ACTIEF bekeken bedrijf op (voor een gewone beheerder is dat altijd
    // zijn eigen bedrijf; voor de superadmin het bedrijf dat 'ie nu inziet).
    const cid = companyId;
    const dataset = {
      vehicles: vehicles[cid] || [],
      trailers: trailers[cid] || [],
      parts: parts[cid] || [],
      maintenance: maintenance[cid] || [],
      costs: costs[cid] || [],
      reports: reports[cid] || [],
      users: (users[cid] || []).filter((u) => u.id !== session.profile.id),
      rides: rides[cid] || [],
      planning: planning[cid] || [],
      drivers: drivers[cid] || [],
      availability: availability[cid] || {},
      workshopHours: workshopHours[cid] || { van: "08:00", tot: "17:00" },
      modules: modules[cid] || { ...DEFAULT_MODULES },
      onboarded: onboarded[cid] === true,
      bedrijfsprofiel: bedrijfsprofiel[cid] || {},
    };
    saveStateDebounced(cid, dataset, setSaveStatus, {
      role: session.profile.rol,
      isSuperadmin: !!session.profile.is_superadmin,
      baseReportIds: baseIds.current.reports,
      baseCostIds: baseIds.current.costs,
    });
  }, [vehicles, trailers, parts, maintenance, costs, reports, users, planning, drivers, availability, workshopHours, modules, onboarded, bedrijfsprofiel, live, companyId, session]);

  // Elke paginawissel begint bovenaan. Het scrollen gebeurt nu binnen <main>
  // (#tt-main), niet meer op het document.
  useEffect(() => { try { document.getElementById("tt-main")?.scrollTo({ top: 0, behavior: "auto" }); } catch {} }, [view, selectedVehicleId]);
  // Staat het huidige scherm bij een module die uit staat (bv. via de AI of een
  // tegel), val dan netjes terug op het dashboard i.p.v. een leeg scherm.
  useEffect(() => {
    const vm = VIEW_MODULE[view];
    const m = modules[companyId];
    if (vm && m && m[vm] === false) setView("dashboard");
  }, [view, companyId, modules]);

  const setMechanicWeek = (userId, week) => setAvailability((s) => ({ ...s, [companyId]: { ...(s[companyId] || {}), [userId]: week } }));
  const setCompanyHours = (hours) => setWorkshopHours((s) => ({ ...s, [companyId]: hours }));
  const saveBedrijfsprofiel = (profiel) => setBedrijfsprofielState((s) => ({ ...s, [companyId]: profiel }));

  const allUsersFlat = Object.values(users).flat();

  const registerCompany = ({ bedrijfsnaam, naam, email, telefoon, wachtwoord }) => {
    let base = slugify(bedrijfsnaam);
    let id = base;
    let n = 2;
    const existingIds = companies.map((c) => c.id);
    while (existingIds.includes(id)) { id = base + n; n++; }
    const accent = ACCENT_PALETTE[companies.length % ACCENT_PALETTE.length];
    const slug = base + ".nl";

    const adminUser = { id: "u" + Date.now(), naam: naam.trim(), email: email.trim(), telefoon: telefoon || "", rol: "admin", status: "actief", wachtwoord };

    setCompanies((s) => [...s, { id, name: bedrijfsnaam.trim(), slug, accent }]);
    setVehicles((s) => ({ ...s, [id]: [] }));
    setTrailers((s) => ({ ...s, [id]: [] }));
    setParts((s) => ({ ...s, [id]: [] }));
    setMaintenance((s) => ({ ...s, [id]: [] }));
    setReports((s) => ({ ...s, [id]: [] }));
    setUsers((s) => ({ ...s, [id]: [adminUser] }));
    setPlanning((s) => ({ ...s, [id]: [] }));
    setDrivers((s) => ({ ...s, [id]: [] }));
    setAvailability((s) => ({ ...s, [id]: {} }));
    setWorkshopHours((s) => ({ ...s, [id]: { van: "08:00", tot: "17:00" } }));

    setCompanyId(id);
    setCurrentUser(adminUser);
    setView("dashboard");
  };

  const handleLogin = (user, isNew) => {
    const compId = Object.keys(users).find((cid) => users[cid].some((u) => u.id === user.id)) || "blex";
    if (isNew) {
      setUsers((s) => ({ ...s, [compId]: s[compId].map((u) => (u.id === user.id ? user : u)) }));
    }
    setCompanyId(compId);
    setCurrentUser(user);
    setView(user.rol === "chauffeur" ? "driver" : "dashboard");
  };

  // --- Hooks die ALTIJD moeten draaien (vóór welke vroege return dan ook), zodat
  // de hook-volgorde stabiel blijft tussen het inlogscherm en de ingelogde app. ---
  const [refreshing, setRefreshing] = useState(false);
  // Waarschuwingstermijn synchroon toepassen tijdens render (module-variabele,
  // geen React-state) zodat de compliance-kleuren meteen de juiste drempel
  // gebruiken — ook bij de eerste render en na een bedrijfswissel.
  setWarnMonths((workshopHours[companyId] || {}).warnMonths);
  // Apparaat-melding bij een nieuwe melding op de werkvloer (werkplaats/beheerder).
  const notifSeen = useRef(null);
  const notifCompany = useRef(null);
  useEffect(() => {
    if (!live) { notifSeen.current = null; notifCompany.current = null; return; }
    const openIds = (reports[companyId] || []).filter((r) => r.status !== "klaar").map((r) => r.id);
    // Bij een bedrijfswissel (superadmin): opnieuw ijken zonder te notificeren,
    // anders tellen alle open meldingen van het nieuwe bedrijf als "nieuw".
    if (notifCompany.current !== companyId) { notifSeen.current = new Set(openIds); notifCompany.current = companyId; return; }
    if (notifSeen.current === null) { notifSeen.current = new Set(openIds); return; }
    const fresh = openIds.filter((id) => !notifSeen.current.has(id));
    notifSeen.current = new Set(openIds);
    const rol = currentUser?.rol;
    if (fresh.length && (rol === "garage" || rol === "admin")) {
      showDeviceNotification("Nieuwe melding", fresh.length === 1 ? "Er is een nieuwe melding op de werkvloer." : `${fresh.length} nieuwe meldingen op de werkvloer.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, companyId, live]);

  // Middernacht-tik: de PWA blijft vaak dagenlang open op een werkplaats-tablet.
  // Om middernacht schuift TODAY mee en rendert de app opnieuw, zodat planning,
  // weekstrip en compliance niet op "gisteren" blijven hangen.
  const [, setDayTick] = useState(0);
  useEffect(() => {
    let timer = null;
    const arm = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      timer = setTimeout(() => { TODAY = toLocalKey(new Date()); setDayTick((t) => t + 1); arm(); }, next.getTime() - now.getTime());
    };
    arm();
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  // Live-updates via Supabase Realtime. Deze hooks MOETEN vóór de vroege return
  // staan, anders verandert de hook-volgorde tussen inlogscherm en app (demo).
  // refreshData wordt hieronder pas gedefinieerd; we vullen de ref daar aan.
  const refreshRef = useRef(null);
  useEffect(() => {
    if (!live || !supabase || (currentUser?.rol) === "chauffeur") return;
    let timer = null;
    const ch = supabase
      .channel("company-live-" + companyId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "companies", filter: "id=eq." + companyId }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { refreshRef.current && refreshRef.current(); }, 1500);
      })
      .subscribe();
    return () => { if (timer) clearTimeout(timer); try { supabase.removeChannel(ch); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, live, currentUser]);

  if (!currentUser) return <LoginScreen allUsers={allUsersFlat} companies={companies} onLogin={handleLogin} onRegister={registerCompany} />;

  const company = companies.find((c) => c.id === companyId) || companies[0] || { id: companyId, name: "Onbekend", slug: "", accent: "#3B82F6" };
  const cVehicles = vehicles[companyId] || [];
  const cTrailers = trailers[companyId] || [];
  const cParts = parts[companyId] || [];
  const cMaintenance = maintenance[companyId] || [];
  const cCosts = costs[companyId] || [];
  const cReports = reports[companyId] || [];
  const cChecks = checks[companyId] || [];
  const cRides = rides[companyId] || [];
  const cUren = uren[companyId] || [];
  const cUsers = users[companyId] || [];
  const cPlanning = planning[companyId] || [];
  const cDrivers = drivers[companyId] || [];
  const cAvailability = availability[companyId] || {};
  const cHours = workshopHours[companyId] || { van: "08:00", tot: "17:00" };
  const cModules = modules[companyId] || { ...DEFAULT_MODULES };
  const cProfiel = bedrijfsprofiel[companyId] || {};
  const cOnboarded = onboarded[companyId] === true;
  const setModule = (key, val) => setModules((s) => ({ ...s, [companyId]: { ...(s[companyId] || DEFAULT_MODULES), [key]: val } }));
  const setAllModules = (obj) => setModules((s) => ({ ...s, [companyId]: { ...DEFAULT_MODULES, ...obj } }));
  const finishOnboarding = (chosen) => { if (chosen) setAllModules(chosen); setOnboarded((s) => ({ ...s, [companyId]: true })); };

  // Abonnement: houd het bedrijf-object in de lijst bij na op-/heractiveren.
  const patchCompany = (patch) => setCompanies((cs) => cs.map((c) => (c.id === companyId ? { ...c, ...patch } : c)));
  const cancelSub = async () => { const ca = await cancelSubscription(); patchCompany({ cancelled: true, cancel_at: ca }); };
  const reactivateSub = async () => { await reactivateSubscription(); patchCompany({ cancelled: false, cancel_at: null }); };
  // Betaald abonnement opgezegd én de einddatum voorbij? Dan is de toegang
  // verlopen (gratis accounts en de superadmin nooit).
  const isSuper = !!(currentUser.superadmin || currentUser.is_superadmin);
  const subEnded = live && !isSuper && company.cancelled && company.cancel_at && new Date(company.cancel_at).getTime() < Date.now();
  if (subEnded) {
    return <SubscriptionEnded company={company} isAdmin={currentUser.rol === "admin"} onReactivate={reactivateSub} onLogout={live ? onLogout : () => setCurrentUser(null)} />;
  }

  // Eerste keer voor een bedrijf (alleen de eigen beheerder, niet de
  // platform-superadmin die tussen bedrijven kijkt): kies je onderdelen.
  if (live && currentUser.rol === "admin" && !(currentUser.superadmin || currentUser.is_superadmin) && !cOnboarded) {
    return <OnboardingWizard company={company} onDone={finishOnboarding} />;
  }

  // Korte rondleiding per rol, de eerste keer (chauffeur/werkplaats/beheerder).
  // De platform-superadmin slaan we over. Voor de admin komt dit ná de
  // module-keuze hierboven.
  if (live && !tutorialSeen && !(currentUser.superadmin || currentUser.is_superadmin)) {
    return <RoleTutorial role={currentUser.rol} onDone={markTutorialSeen} />;
  }
  const mechanics = cUsers.filter((u) => u.rol === "garage");
  const openCount = cReports.filter((r) => r.status !== "klaar").length;

  const role = currentUser.rol; // 'admin' | 'garage' | 'chauffeur'
  const isAdmin = role === "admin";
  const isSuperAdmin = !!(currentUser.superadmin || currentUser.is_superadmin); // alleen T&T platform-beheerder mag tussen bedrijven wisselen
  const isChauffeurOnly = role === "chauffeur";

  const addVehicle = (v) => setVehicles((s) => ({ ...s, [companyId]: [...(s[companyId] || []), v] }));
  const updateVehicle = (v) => setVehicles((s) => ({ ...s, [companyId]: (s[companyId] || []).map((x) => (x.id === v.id ? v : x)) }));
  const deleteVehicle = (id) => setVehicles((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((x) => x.id !== id) }));
  const addTrailer = (t) => setTrailers((s) => ({ ...s, [companyId]: [...(s[companyId] || []), t] }));
  const updateTrailer = (t) => setTrailers((s) => ({ ...s, [companyId]: (s[companyId] || []).map((x) => (x.id === t.id ? t : x)) }));
  const deleteTrailer = (id) => setTrailers((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((x) => x.id !== id) }));
  const addPart = (p) => setParts((s) => ({ ...s, [companyId]: [...(s[companyId] || []), p] }));
  const usePart = (partId, aantal) => setParts((s) => ({ ...s, [companyId]: (s[companyId] || []).map((p) => (p.id === partId ? { ...p, voorraad: Math.max(0, (Number(p.voorraad) || 0) - (Number(aantal) || 0)) } : p)) }));
  const updatePart = (p) => setParts((s) => ({ ...s, [companyId]: (s[companyId] || []).map((x) => (x.id === p.id ? p : x)) }));
  const deletePart = (id) => setParts((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((x) => x.id !== id) }));
  const addMaintenance = (m) => setMaintenance((s) => ({ ...s, [companyId]: [...(s[companyId] || []), m] }));
  const updateMaintenance = (m) => setMaintenance((s) => ({ ...s, [companyId]: (s[companyId] || []).map((x) => (x.id === m.id ? m : x)) }));
  const deleteMaintenance = (id) => setMaintenance((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((x) => x.id !== id) }));
  const addCost = (c) => setCosts((s) => ({ ...s, [companyId]: [...(s[companyId] || []), c] }));
  const deleteCost = (id) => setCosts((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((x) => x.id !== id) }));
  const addReport = (r) => {
    setReports((s) => ({ ...s, [companyId]: [r, ...(s[companyId] || [])] }));
    // Chauffeur: los opslaan via de veilige functie (ze slaan de hele dataset niet op).
    if (live && role === "chauffeur") {
      driverAddReport(r).catch((e) => console.error("Melding opslaan mislukt:", e?.message || e));
      // Push naar beheer/werkplaats (best effort): "Nieuwe melding".
      const prio = r.prioriteit === "kritiek" ? "KRITIEK — " : "";
      notifyCompany({ title: "Nieuwe melding", body: `${prio}${r.vehicle}: ${(r.omschrijving || "").slice(0, 120)}`, url: "/app/werkvloer" });
    }
  };
  // Dagelijkse voertuigcheck opslaan. Live: via de veilige RPC (idempotent,
  // identiteit afgedwongen); demo: alleen lokaal. Push naar beheer/werkplaats
  // gebeurt via de melding die VoertuigCheck bij gebreken zelf indient.
  const addCheck = async (c) => {
    if (live && role === "chauffeur") await driverAddCheck(c);
    setChecks((s) => ({ ...s, [companyId]: [c, ...(s[companyId] || [])] }));
  };
  // Uren van de chauffeur: naar de gedeelde kopie (loonoverzicht) + live sync.
  const syncUurAdd = (e) => {
    const entry = { ...e, chauffeurId: currentUser?.id || null, chauffeur: currentUser?.naam || "Onbekend" };
    setUren((s) => ({ ...s, [companyId]: [entry, ...(s[companyId] || []).filter((x) => x.id !== entry.id)] }));
    if (live && role === "chauffeur") driverSaveHours(entry).catch((err) => console.error("Uren-sync mislukt:", err?.message || err));
  };
  const syncUurDelete = (id) => {
    setUren((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((x) => x.id !== id) }));
    if (live && role === "chauffeur") driverDeleteHours(id).catch((err) => console.error("Uren-sync mislukt:", err?.message || err));
  };
  // Ritten: beheerder plant/verwijdert; chauffeur tekent af (POD).
  const addRide = (r) => setRides((s) => ({ ...s, [companyId]: [r, ...(s[companyId] || [])] }));
  const deleteRide = (id) => setRides((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((x) => x.id !== id) }));
  const completeRide = async (rideId, pod) => {
    if (live && role === "chauffeur") await driverCompleteRide(rideId, pod);
    setRides((s) => ({ ...s, [companyId]: (s[companyId] || []).map((x) => (x.id === rideId ? { ...x, status: "afgeleverd", pod } : x)) }));
  };
  // Foto's/video's van een melding opslaan: live -> Supabase Storage (privé),
  // demo -> tijdelijke objectURLs zodat het in de sessie zichtbaar blijft.
  const uploadMedia = async (reportId, items) => {
    if (live) return await uploadReportMedia(companyId, reportId, items);
    return (items || []).map((m) => ({ url: m.url, type: m.type }));
  };
  // Verversen: haalt de actuele serverdata op zodat nieuwe meldingen (bv. van
  // een chauffeur) en planning meteen zichtbaar worden — de app heeft nog geen
  // live-sync, dus dit is de handmatige "ophalen". (refreshing-state staat bij
  // de overige hooks bovenaan, vóór de vroege returns.)
  const refreshData = async () => {
    if (!live || refreshing) return;
    setRefreshing(true);
    try {
      let fresh;
      if (role === "chauffeur") { const b = await driverBootstrap(); fresh = { vehicles: b.vehicles || [], reports: b.reports || [], checks: b.checks || [], rides: b.rides || [], uren: b.uren || [] }; }
      else if (role === "garage") fresh = await loadCompanyStateScoped();
      else fresh = await loadState(companyId);
      if (fresh) {
        if (Array.isArray(fresh.reports)) setReports((s) => ({ ...s, [companyId]: fresh.reports }));
        if (Array.isArray(fresh.planning)) setPlanning((s) => ({ ...s, [companyId]: fresh.planning }));
        if (Array.isArray(fresh.vehicles)) setVehicles((s) => ({ ...s, [companyId]: fresh.vehicles }));
        if (Array.isArray(fresh.checks)) setChecks((s) => ({ ...s, [companyId]: fresh.checks }));
        if (Array.isArray(fresh.rides)) setRides((s) => ({ ...s, [companyId]: fresh.rides }));
        if (Array.isArray(fresh.uren)) setUren((s) => ({ ...s, [companyId]: fresh.uren }));
        // Basis-ids bijwerken zodat een volgende opslag geen nieuwe meldingen wist.
        if (Array.isArray(fresh.reports)) baseIds.current.reports = fresh.reports.map((r) => r && r.id).filter(Boolean);
      }
      return true;
    } catch (e) {
      console.error("Verversen mislukt:", e?.message || e);
      return false;
    } finally {
      setRefreshing(false);
    }
  };
  // Houd de laatste refreshData in de ref die de realtime-hook (hierboven, vóór
  // de vroege return) gebruikt. Dit is een gewone toewijzing, geen hook.
  refreshRef.current = refreshData;

  const addUser = (u) => setUsers((s) => ({ ...s, [companyId]: [...(s[companyId] || []), u] }));
  const deleteUser = (id) => {
    setUsers((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((x) => x.id !== id) }));
    // Echt account (UUID)? Trek dan ook de login in via de server, anders kan de
    // "verwijderde" medewerker gewoon blijven inloggen.
    if (live && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(id))) {
      deleteEmployeeAccount(id).catch((e) => console.error("Account verwijderen mislukt:", e?.message || e));
    }
  };
  const addPlanning = (p) => setPlanning((s) => ({ ...s, [companyId]: [...(s[companyId] || []), p] }));
  const deletePlanning = (id) => setPlanning((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((x) => x.id !== id) }));
  const addDriver = (d) => setDrivers((s) => ({ ...s, [companyId]: [...(s[companyId] || []), d] }));
  const updateDriver = (d) => setDrivers((s) => ({ ...s, [companyId]: (s[companyId] || []).map((x) => (x.id === d.id ? d : x)) }));
  const deleteDriver = (id) => setDrivers((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((x) => x.id !== id) }));

  // Testomgeving: vul het huidige bedrijf met realistische voorbeelddata om
  // alles te kunnen uittesten, of wis alles weer voor echt gebruik.
  const cloneSeed = (x) => JSON.parse(JSON.stringify((x && x.blex) || []));
  const loadSampleData = () => {
    setVehicles((s) => ({ ...s, [companyId]: cloneSeed(seedVehicles) }));
    setTrailers((s) => ({ ...s, [companyId]: cloneSeed(seedTrailers) }));
    setParts((s) => ({ ...s, [companyId]: cloneSeed(seedParts) }));
    setMaintenance((s) => ({ ...s, [companyId]: cloneSeed(seedMaintenance) }));
    setCosts((s) => ({ ...s, [companyId]: cloneSeed(seedCosts) }));
    setReports((s) => ({ ...s, [companyId]: cloneSeed(seedReports) }));
    setPlanning((s) => ({ ...s, [companyId]: cloneSeed(seedPlanning) }));
    setDrivers((s) => ({ ...s, [companyId]: cloneSeed(seedDrivers) }));
  };
  const clearAllData = () => {
    setVehicles((s) => ({ ...s, [companyId]: [] }));
    setTrailers((s) => ({ ...s, [companyId]: [] }));
    setParts((s) => ({ ...s, [companyId]: [] }));
    setMaintenance((s) => ({ ...s, [companyId]: [] }));
    setCosts((s) => ({ ...s, [companyId]: [] }));
    setReports((s) => ({ ...s, [companyId]: [] }));
    setPlanning((s) => ({ ...s, [companyId]: [] }));
    setDrivers((s) => ({ ...s, [companyId]: [] }));
  };
  const resendInvite = () => {};
  const moveReport = (id, targetStatus) => setReports((s) => ({ ...s, [companyId]: (s[companyId] || []).map((r) => (r.id === id ? { ...r, status: targetStatus } : r)) }));
  const deleteReport = (id) => setReports((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((r) => r.id !== id) }));

  return (
    <div style={{ height: "100dvh", background: "#0A0E14", fontFamily: "Inter", overflow: "hidden", width: "100%" }}>
      <style>{`
        ${FONT_IMPORT}
        /* Document zelf scrollt niet (voorkomt 'pull-to-refresh' bij omhoog trekken);
           het scrollen gebeurt binnen <main>. */
        html, body, #root { height: 100%; overflow: hidden; overscroll-behavior: none; }
        html, body { background: #0A0E14 !important; -webkit-font-smoothing: antialiased; }
        @keyframes tg-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes tg-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tg-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tg-pop { 0% { transform: scale(0.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        /* Alleen opacity animeren: een resterende transform maakt van .tg-page een
           containing block, waardoor position:fixed (o.a. bevestigingspopups) niet
           meer t.o.v. het scherm maar t.o.v. deze pagina uitlijnt en "rondzwerft". */
        .tg-page { animation: tg-fade-in .3s ease both; }
        /* Op groot scherm de content compact houden (niet edge-to-edge), zodat de
           balken niet het hele scherm beslaan en er ruimte naast overblijft. */
        @media (min-width: 1100px) { .tg-page { max-width: 1120px; } }
        /* Gestapelde kaarten in 2 kolommen laten vloeien op laptop/tablet, zodat
           er geen brede balken met loze ruimte meer zijn. Op de telefoon blijft
           het één kolom. Elke kaart blijft heel (break-inside: avoid). */
        .tg-cols > * { margin-bottom: 16px; }
        @media (min-width: 900px) {
          .tg-cols { column-count: 2; column-gap: 16px; }
          .tg-cols > * { break-inside: avoid; -webkit-column-break-inside: avoid; }
        }
        .tg-card { animation: tg-fade-in .35s ease both; }
        .tg-input { background: #161C25; border: 1px solid #2A3340; color: #E7ECF3; border-radius: 9px; padding: 10px 12px; font-family: Inter; font-size: 16px; outline: none; max-width: 100%; min-width: 0; width: 100%; transition: border-color .15s, box-shadow .15s; }
        input[type="date"].tg-input, input[type="time"].tg-input, input[type="number"].tg-input { min-width: 0; -webkit-appearance: none; appearance: none; }
        .tg-input:focus { border-color: #3B82F6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
        .tg-input::placeholder { color: #7B8698; }
        * { box-sizing: border-box; }
        img, video, table { max-width: 100%; }
        button { max-width: 100%; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #232B38; border-radius: 6px; border: 2px solid #0A0E14; }
        ::-webkit-scrollbar-thumb:hover { background: #2E3948; }
        * { scrollbar-width: thin; scrollbar-color: #232B38 transparent; }
        /* Datum/tijd-velden: geef de waarde alle ruimte, klok-icoon compact zodat
           "08:00" nooit wordt afgekapt tot "08:(" op smalle schermen. */
        input[type="date"].tg-input::-webkit-calendar-picker-indicator,
        input[type="time"].tg-input::-webkit-calendar-picker-indicator { margin-left: 2px; padding: 0; opacity: 0.55; cursor: pointer; }
        @media (min-width: 768px) { .tg-input { font-size: 13px; } }
        @media (max-width: 767px) {
          h1 { font-size: 22px !important; line-height: 1.15 !important; }
          .tg-input { font-size: 16px; padding: 11px 10px; }
          /* Op de telefoon nemen datum/tijd-velden hun eigen ruimte; verberg het
             klok-icoon (de OS-picker opent toch bij tikken) zodat de tijd past. */
          input[type="date"].tg-input::-webkit-calendar-picker-indicator,
          input[type="time"].tg-input::-webkit-calendar-picker-indicator { display: none; }
          input[type="date"].tg-input, input[type="time"].tg-input { min-height: 44px; }
        }
      `}</style>

      <div className="flex" style={{ height: "100%", minHeight: 0 }}>
        {/* Desktop persistent sidebar */}
        {!isMobile && (
          <aside style={{ width: 240, borderRight: "1px solid #1A2129", height: "100%" }} className="shrink-0">
            <SidebarContent view={view} setView={setView} openCount={openCount} company={company} currentUser={currentUser} role={role} isSuperAdmin={isSuperAdmin} modules={cModules}
              onCompanyClick={() => setCompanyPicker((s) => !s)} onLogout={live ? onLogout : () => setCurrentUser(null)} />
          </aside>
        )}

        {/* Mobile slide-over sidebar */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40">
            <div className="absolute inset-0" style={{ background: "#000000AA" }} onClick={() => setMobileMenuOpen(false)} />
            <div className="absolute left-0 top-0" style={{ width: 284, maxWidth: "88vw", height: "100dvh", background: "#0A0E14", borderRight: "1px solid #1A2129" }}>
              <SidebarContent view={view} setView={setView} openCount={openCount} company={company} currentUser={currentUser} role={role} isSuperAdmin={isSuperAdmin} modules={cModules}
                onCompanyClick={() => setCompanyPicker((s) => !s)} onLogout={live ? onLogout : () => setCurrentUser(null)} onClose={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        )}

        {companyPicker && isSuperAdmin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#000000AA" }} onClick={() => setCompanyPicker(false)}>
            <div onClick={(e) => e.stopPropagation()} className="rounded-xl overflow-hidden" style={{ background: "#12171F", border: "1px solid #232B38", minWidth: 260 }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #232B38", color: "#B4BCC9", fontFamily: "Inter", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Kies bedrijf (platformbeheer)</div>
              {companies.map((c) => (
                <button key={c.id} onClick={() => { setCompanyId(c.id); setCompanyPicker(false); setView("dashboard"); }} className="w-full flex items-center gap-2 px-4 py-3 text-left" style={{ background: c.id === companyId ? "#1A2129" : "transparent" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: c.accent }} /><span style={{ fontFamily: "Inter", fontSize: 13.5, color: "#E7ECF3" }}>{c.name}</span>
                </button>
              ))}
              <div className="px-4 py-2.5" style={{ borderTop: "1px solid #232B38", color: "#98A1B0", fontSize: 11, fontFamily: "Inter" }}>Alleen de Truck &amp; Trailer platformbeheerder ziet alle bedrijven.</div>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col" style={{ minWidth: 0, height: "100%", minHeight: 0 }}>
          <header style={{ borderBottom: "1px solid #1A2129", flexShrink: 0 }} className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              {isMobile && <button onClick={() => setMobileMenuOpen(true)} aria-label="Menu openen"><Menu size={20} color="#E7ECF3" /></button>}
              {!isMobile && (
                <span style={{ fontFamily: "Inter", fontSize: 13, color: "#B4BCC9" }}>{company.slug}</span>
              )}
              {isMobile && (
                <button onClick={() => setView("dashboard")} className="flex items-center gap-2">
                  <span style={{ fontFamily: "Oswald", fontSize: 16, fontWeight: 700, color: "#E7ECF3" }}>TRUCK <span style={{ color: "#3B82F6" }}>&amp;</span> TRAILER</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {live && <SaveStatus status={saveStatus} compact={isMobile} />}
              {!isChauffeurOnly && (
                <div className="relative">
                  <button onClick={() => setNotifOpen((s) => !s)} aria-label="Meldingen" className="relative flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 8, background: notifOpen ? "#1A2129" : "transparent" }}>
                    <Bell size={18} color={notifOpen ? "#3B82F6" : "#B4BCC9"} />
                    {openCount > 0 && <span className="absolute -top-0.5 -right-0.5 rounded-full flex items-center justify-center" style={{ minWidth: 16, height: 16, padding: "0 4px", background: "#F0453F", color: "#fff", fontSize: 9, fontWeight: 700 }}>{openCount}</span>}
                  </button>
                  {notifOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                      <div className="absolute right-0 mt-2 rounded-xl overflow-hidden z-50" style={{ background: "#12171F", border: "1px solid #232B38", width: 320, maxWidth: "90vw", boxShadow: "0 10px 40px #000000AA" }}>
                        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #232B38" }}>
                          <span style={{ fontFamily: "Inter", fontSize: 13, fontWeight: 600, color: "#E7ECF3" }}>Notificaties</span>
                          <span style={{ fontFamily: "Inter", fontSize: 11, color: "#B4BCC9" }}>{openCount} open</span>
                        </div>
                        <div style={{ maxHeight: 360, overflowY: "auto" }}>
                          {cReports.filter((r) => r.status !== "klaar").length === 0 ? (
                            <div className="px-4 py-6 text-center" style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }}>Geen openstaande meldingen.</div>
                          ) : (
                            cReports.filter((r) => r.status !== "klaar").sort((a, b) => (a.datum < b.datum ? 1 : -1)).map((r) => (
                              <button key={r.id} onClick={() => { setView("workfloor"); setNotifOpen(false); }} className="w-full text-left px-4 py-3 flex items-start gap-2.5" style={{ borderBottom: "1px solid #1A2129" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#1A2129")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                <span className="mt-1 rounded-full" style={{ width: 7, height: 7, background: PRIO_META[r.prioriteit].color, flexShrink: 0 }} />
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ display: "block", fontFamily: "Inter", fontSize: 12.5, color: "#E7ECF3", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.vehicle} — {r.omschrijving}</span>
                                  <span style={{ fontFamily: "Inter", fontSize: 11, color: "#B4BCC9" }}>{r.chauffeur} · {r.datum} · {PRIO_META[r.prioriteit].label}</span>
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                        <button onClick={() => { setView("workfloor"); setNotifOpen(false); }} className="w-full px-4 py-3" style={{ color: "#3B82F6", fontFamily: "Inter", fontSize: 12.5, fontWeight: 600, borderTop: "1px solid #232B38" }}>Naar werkvloer →</button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {isMobile && (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#3B82F633", border: "1px solid #3B82F655" }} className="flex items-center justify-center">
                  <span style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 700, fontSize: 10 }}>{currentUser.naam.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
                </div>
              )}
            </div>
          </header>

          <main id="tt-main" style={{ padding: isMobile ? 20 : 32, paddingBottom: isMobile ? 28 : 32, overflowX: "hidden", overflowY: "auto", flex: 1, minHeight: 0, width: "100%", maxWidth: "100%", minWidth: 0, overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
            <div key={view + (selectedVehicleId || "")} className="tg-page">
            {isChauffeurOnly ? (
              <DriverHome vehicles={cVehicles} onSubmit={addReport} currentUser={currentUser} onUploadMedia={uploadMedia} onSaveCheck={addCheck} myChecks={cChecks.filter((c) => c.chauffeurId === currentUser.id)} myRides={cRides.filter((r) => r.chauffeurId === currentUser.id)} onCompleteRide={completeRide} myServerUren={cUren.filter((u) => u.chauffeurId === currentUser.id)} onSyncUurAdd={syncUurAdd} onSyncUurDelete={syncUurDelete} myReports={cReports.filter((r) => (r.chauffeurId ? r.chauffeurId === currentUser.id : r.chauffeur === currentUser.naam))} />
            ) : (
              <>
                {view === "dashboard" && role === "garage" && <GarageDashboard vehicles={cVehicles} reports={cReports} planning={cPlanning} parts={cParts} company={company} currentUser={currentUser} onNavigate={setView} onMove={moveReport} />}
                {view === "dashboard" && role !== "garage" && <DashboardView vehicles={cVehicles} parts={cParts} reports={cReports} planning={cPlanning} costs={cCosts} company={company} isAdmin={isAdmin} onNavigate={setView} onSelectVehicle={(id) => { setSelectedVehicleId(id); setViewRaw("vehicles"); }} onLoadSample={live ? loadSampleData : null} />}
                {view === "rapportage" && isAdmin && <ReportingView vehicles={cVehicles} reports={cReports} costs={cCosts} planning={cPlanning} onSelectVehicle={(id) => { setSelectedVehicleId(id); setViewRaw("vehicles"); }} />}
                {view === "driver" && <DriverHome vehicles={cVehicles} onSubmit={addReport} currentUser={currentUser} onUploadMedia={uploadMedia} onSaveCheck={addCheck} myChecks={cChecks.filter((c) => c.chauffeurId === currentUser.id)} myRides={cRides.filter((r) => r.chauffeurId === currentUser.id)} onCompleteRide={completeRide} myServerUren={cUren.filter((u) => u.chauffeurId === currentUser.id)} onSyncUurAdd={syncUurAdd} onSyncUurDelete={syncUurDelete} myReports={cReports.filter((r) => (r.chauffeurId ? r.chauffeurId === currentUser.id : r.chauffeur === currentUser.naam))} />}
                {view === "rides" && isAdmin && modOn(cModules, "rides") && <RidesView rides={cRides} vehicles={cVehicles} users={cUsers} profiel={cProfiel} company={company} onAdd={addRide} onDelete={deleteRide} />}
                {view === "vehicles" && !selectedVehicleId && <VehiclesView vehicles={cVehicles} onAdd={addVehicle} onSelect={(id) => setSelectedVehicleId(id)} />}
                {view === "bakwagens" && modOn(cModules, "bakwagens") && <VehiclesView vehicles={cVehicles} onAdd={addVehicle} onSelect={(id) => { setView("vehicles"); setSelectedVehicleId(id); }} filterType="Bakwagen" title="Bakwagens" />}
                {view === "bestelwagens" && modOn(cModules, "bestelwagens") && <VehiclesView vehicles={cVehicles} onAdd={addVehicle} onSelect={(id) => { setView("vehicles"); setSelectedVehicleId(id); }} filterType="Bestelwagen" title="Bestelwagens" />}
                {view === "costs" && isAdmin && modOn(cModules, "costs") && <CostsView costs={cCosts} vehicles={cVehicles} onAdd={addCost} onDelete={deleteCost} />}
                {view === "vehicles" && selectedVehicleId && (() => {
                  const veh = cVehicles.find((x) => x.id === selectedVehicleId);
                  if (!veh) { setSelectedVehicleId(null); return null; }
                  return <VehicleDetailView vehicle={veh} reports={cReports} planning={cPlanning} costs={cCosts.filter((c) => c.vehicle === veh.kenteken)} checks={cChecks.filter((c) => c.vehicle === veh.kenteken)} onAddCost={addCost} onDeleteCost={deleteCost} onUpdate={updateVehicle} onAddPlanning={addPlanning} onBack={() => setSelectedVehicleId(null)} isAdmin={isAdmin} onDelete={(id) => { deleteVehicle(id); setSelectedVehicleId(null); }} aiReady={aiReady} inspectionOn={modOn(cModules, "inspection")} companyId={companyId} live={live} />;
                })()}
                {view === "trailers" && modOn(cModules, "trailers") && <TrailersView trailers={cTrailers} onAdd={addTrailer} onUpdate={updateTrailer} onDelete={deleteTrailer} />}
                {view === "parts" && modOn(cModules, "parts") && <PartsView parts={cParts} onAdd={addPart} onUpdate={updatePart} onDelete={deletePart} />}
                {view === "maintenance" && modOn(cModules, "maintenance") && <MaintenanceView maintenance={cMaintenance} vehicles={cVehicles} onAdd={addMaintenance} onUpdate={updateMaintenance} onDelete={deleteMaintenance} />}
                {view === "workfloor" && <WorkfloorView reports={cReports} onMove={moveReport} onDelete={deleteReport} onSchedule={addPlanning} mechanics={mechanics} availability={cAvailability} hours={cHours} parts={cParts} company={company} profiel={cProfiel} onAddCost={addCost} onUsePart={usePart} onRefresh={live ? refreshData : null} refreshing={refreshing} vehicles={cVehicles} />}
                {view === "planning" && modOn(cModules, "planning") && <PlanningView vehicles={cVehicles} planning={cPlanning} reports={cReports} onAdd={addPlanning} onDelete={deletePlanning} onRefresh={live ? refreshData : null} refreshing={refreshing} />}
                {view === "inspection" && modOn(cModules, "inspection") && <InspectionView vehicles={cVehicles} reports={cReports} onUpdate={updateVehicle} aiReady={aiReady} />}
                {view === "ai" && modOn(cModules, "ai") && <AiAssistantView reports={cReports} vehicles={cVehicles} company={company} aiReady={aiReady} onAddVehicle={addVehicle} onAddPlanning={addPlanning} onNavigate={setView} />}
                {view === "users" && isAdmin && <UsersView users={cUsers} onAdd={addUser} onResend={resendInvite} onDelete={deleteUser} currentUserId={currentUser.id} joinCode={live ? company.join_code : null} companyName={company.name} live={live} onCreateAccount={live && canCreateAccounts ? createEmployeeAccount : null} onInviteEmail={live && canCreateAccounts ? inviteEmployeeByEmail : null} />}
                {view === "drivers" && modOn(cModules, "drivers") && <ChauffeursView drivers={cDrivers} onAdd={addDriver} onUpdate={updateDriver} onDelete={deleteDriver} uren={cUren} isAdmin={isAdmin} />}
                {view === "settings" && (role === "admin" || role === "garage") && <SettingsView mechanics={mechanics} availability={cAvailability} hours={cHours} onSetMechanicWeek={setMechanicWeek} onSetHours={setCompanyHours} onLoadSample={live && isAdmin ? loadSampleData : null} onClearData={live && isAdmin ? clearAllData : null} hasData={cVehicles.length + cReports.length + cPlanning.length > 0} modules={cModules} onSetModule={isAdmin ? setModule : null} live={live} onReplayTutorial={replayTutorial} subscription={live ? company : null} onCancelSub={isAdmin ? cancelSub : null} onReactivateSub={isAdmin ? reactivateSub : null} profiel={cProfiel} onSaveProfiel={isAdmin ? saveBedrijfsprofiel : null} companyName={company.name} />}
                {view === "codes" && isSuperAdmin && <CodesView live={live} companies={companies} />}
                {view === "support" && isSuperAdmin && <SupportInboxView live={live} />}
                {view === "admincompanies" && isSuperAdmin && <CompaniesAdminView live={live} companies={companies} currentUserId={currentUser.id} currentCompanyId={companyId} onRemoveCompany={(id) => setCompanies((cs) => cs.filter((c) => c.id !== id))} />}
              </>
            )}
            </div>
          </main>
        </div>

      </div>
    </div>
  );
}
