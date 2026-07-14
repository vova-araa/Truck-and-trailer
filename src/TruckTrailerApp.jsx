import React, { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard, Truck, Container, Package, Wrench, KanbanSquare,
  AlertTriangle, Bell, Plus, Calendar, Camera, Video, X,
  CheckCircle2, Building2, Mic, MicOff, ChevronDown,
  Users, Sparkles, ScanEye, Send, LogOut, Mail, Phone, ShieldCheck, SlidersHorizontal,
  ChevronLeft, ChevronRight, Menu, Trash2
} from "lucide-react";
import { saveStateDebounced } from "./api.js";

/* ---------------------------------------------------------------------
   DESIGN TOKENS — ink #0A0E14 · panel #12171F · raised #1A2129
   border #232B38 · text #E7ECF3 · dim #B4BCC9 · amber #FF8A00 (signal)
   teal #22D3B0 (diagnostic) · danger #F0453F · success #34D399
   plate #FFCC00 (NL kenteken)
--------------------------------------------------------------------- */

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');`;

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

const DEMO_TODAY = "2026-07-02";

const seedPlanning = {
  blex: [
    { id: "pl0", vehicle: "GH-99-VB", datum: DEMO_TODAY, tijd: "14:00", duur: 60, taak: "Bandencontrole", monteur: "M. Smit" },
    { id: "pl1", vehicle: "VX-77-KL", datum: "2026-07-09", tijd: "09:00", duur: 90, taak: "APK keuring", monteur: "M. Smit" },
    { id: "pl2", vehicle: "SD-14-TR", datum: "2026-07-03", tijd: "08:00", duur: 240, taak: "Koppeling vervangen", monteur: "M. Smit" },
    { id: "pl3", vehicle: "84-BSX-2", datum: "2026-07-14", tijd: "13:00", duur: 120, taak: "Grote beurt", monteur: "M. Smit" },
  ],
  vandijk: [],
};

const STATUS_META = {
  operational: { label: "Operationeel", color: "#34D399" },
  attention: { label: "Let op", color: "#FF8A00" },
  workshop: { label: "In werkplaats", color: "#F0453F" },
};

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
function daysUntil(dateStr, today = DEMO_TODAY) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(today + "T00:00:00");
  return Math.round((d - t) / 86400000);
}

// status: 'verlopen' (past) | 'binnenkort' (<=30d) | 'ok' | 'onbekend'
function complianceStatus(dateStr, today = DEMO_TODAY) {
  const d = daysUntil(dateStr, today);
  if (d === null) return "onbekend";
  if (d < 0) return "verlopen";
  if (d <= 30) return "binnenkort";
  return "ok";
}

const COMPLIANCE_META = {
  verlopen: { label: "Verlopen", color: "#F0453F" },
  binnenkort: { label: "Verloopt binnenkort", color: "#FF8A00" },
  ok: { label: "In orde", color: "#34D399" },
  onbekend: { label: "Onbekend", color: "#98A1B0" },
};

// Build the compliance items for one vehicle
function vehicleComplianceItems(v, today = DEMO_TODAY) {
  const items = [
    { key: "apk", label: "APK", datum: v.apkTot },
    { key: "verzekering", label: "Verzekering", datum: v.verzekeringTot },
  ];
  if (v.tachoPlicht) items.splice(1, 0, { key: "tacho", label: "Tachograaf (SMT2)", datum: v.tachoTot });
  return items.map((it) => ({ ...it, status: complianceStatus(it.datum, today), dagen: daysUntil(it.datum, today) }));
}

// Worst status across a vehicle's compliance items (for a single badge)
function vehicleWorstCompliance(v, today = DEMO_TODAY) {
  const order = { verlopen: 3, binnenkort: 2, ok: 1, onbekend: 0 };
  return vehicleComplianceItems(v, today).reduce((worst, it) => (order[it.status] > order[worst] ? it.status : worst), "ok");
}

const PRIO_META = {
  laag: { label: "Laag", color: "#B4BCC9" },
  gemiddeld: { label: "Gemiddeld", color: "#FF8A00" },
  kritiek: { label: "Kritiek", color: "#F0453F" },
};

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
   AI HELPER — gedeelde Claude API call (tekst + beeld), robuuste parsing
--------------------------------------------------------------------- */

async function callAI({ text, images = [], maxTokens = 800 }) {
  // images: array of { media_type, data } (base64, no prefix)
  const content = [];
  images.forEach((img) => content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } }));
  content.push({ type: "text", text });
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  if (!response.ok) {
    const t = await response.text().catch(() => "");
    throw new Error(`API ${response.status}${t ? ": " + t.slice(0, 120) : ""}`);
  }
  const data = await response.json();
  const out = (Array.isArray(data.content) ? data.content : []).filter((c) => c && c.type === "text").map((c) => c.text).join("").trim();
  if (!out) throw new Error("leeg antwoord");
  return out;
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
    if (reg.wachtwoord.length < 4) return setRegError("Kies een wachtwoord van minstens 4 tekens.");
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

function MeldingMaken({ vehicles, onSubmit, currentUser }) {
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
  const recognitionRef = useRef(null);
  const fileRef = useRef(null);
  const videoRef = useRef(null);

  const STEPS = ["Voertuig", "Probleem", "Foto", "Check"];

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
    rec.lang = "nl-NL";
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
      setDamageError(`Kon foto niet analyseren (${err.message || "fout"}). AI werkt alleen in de gepubliceerde app, niet in het preview-venster.`);
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

  const submit = () => {
    if (!vehicle || !omschrijving.trim()) return;
    onSubmit({
      id: "r" + Date.now(), vehicle, chauffeur: currentUser?.naam || "Onbekend", omschrijving,
      prioriteit: veilig === "Nee" ? "kritiek" : veilig === "Twijfel" ? "gemiddeld" : "laag",
      status: "nieuw", datum: new Date().toISOString().slice(0, 10),
      zone, wanneer, hoelang, veilig, mediaCount: media.length,
    });
    setOmschrijving(""); setZone(""); setWanneer(""); setHoelang(""); setVeilig(""); setMedia([]); setVehicle(""); setStep(0);
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  };

  if (sent) {
    return (
      <div className="max-w-xl mx-auto">
        <Card className="p-8 flex flex-col items-center text-center">
          <div className="flex items-center justify-center rounded-full mb-4" style={{ width: 64, height: 64, background: "#34D39918" }}><CheckCircle2 size={34} color="#34D399" /></div>
          <div style={{ fontFamily: "Oswald", fontSize: 22, fontWeight: 600, color: "#E7ECF3" }}>Melding verstuurd!</div>
          <div style={{ fontFamily: "Inter", fontSize: 14, color: "#B4BCC9", marginTop: 6 }}>De werkplaats gaat ermee aan de slag. Je ziet de status onder "Jouw meldingen".</div>
          <Button style={{ marginTop: 20 }} icon={Plus} onClick={() => setSent(false)}>Nieuwe melding</Button>
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
              <div style={{ fontFamily: "Oswald", fontSize: 20, fontWeight: 600, color: "#E7ECF3" }}>Welk voertuig?</div>
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#B4BCC9" }}>Kies de wagen waar het om gaat.</div>
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
              <div style={{ fontFamily: "Oswald", fontSize: 20, fontWeight: 600, color: "#E7ECF3" }}>Wat is er aan de hand?</div>
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#B4BCC9" }}>Tik veelvoorkomende problemen aan of beschrijf het zelf.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {COMMON_ISSUES.map((issue) => (
                <Chip key={issue} active={omschrijving.includes(issue)} onClick={() => toggleIssue(issue)}>{issue}</Chip>
              ))}
            </div>
            <div>
              <textarea className="tg-input w-full" rows={3} placeholder="Beschrijf: geluid, gevoel, lampje, lekkage..." value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} />
              <button onClick={startVoice} className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ fontFamily: "Inter", fontWeight: 600, background: listening ? "#F0453F18" : "#1A2129", color: listening ? "#F0453F" : "#E7ECF3", border: "1px solid #232B38" }}>
                {listening ? <MicOff size={14} /> : <Mic size={14} />} {listening ? "Aan het luisteren..." : "Inspreken"}
              </button>
              {voiceError && <div style={{ color: "#FF8A00", fontFamily: "Inter", fontSize: 12, marginTop: 6 }}>{voiceError}</div>}
            </div>
          </div>
        )}

        {/* STEP 2 — Photo */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <div style={{ fontFamily: "Oswald", fontSize: 20, fontWeight: 600, color: "#E7ECF3" }}>Foto of video</div>
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#B4BCC9" }}>Handig voor de werkplaats — maar niet verplicht.</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => fileRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-7 rounded-lg" style={{ border: "1px dashed #3A4252", background: "#1A2129" }}>
                <Camera size={22} color="#3B82F6" /><span style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", fontWeight: 500 }}>Foto maken</span>
              </button>
              <button onClick={() => videoRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-7 rounded-lg" style={{ border: "1px dashed #3A4252", background: "#1A2129" }}>
                <Video size={22} color="#3B82F6" /><span style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", fontWeight: 500 }}>Video maken</span>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <input ref={videoRef} type="file" accept="video/*" capture="environment" multiple hidden onChange={(e) => addFiles(e.target.files)} />
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
            {media.length === 0 && <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0", textAlign: "center" }}>Geen foto? Geen probleem — tik op "Volgende".</div>}

            {media.some((m) => m.type === "foto") && (
              <div className="pt-1">
                <button onClick={analyzeDamage} disabled={damageLoading} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg" style={{ background: damageLoading ? "#1A2129" : "linear-gradient(180deg, #4C8DFF, #3B82F6)", color: "#FFFFFF", fontFamily: "Inter", fontWeight: 600, fontSize: 13.5, boxShadow: "0 2px 10px rgba(59,130,246,0.3)" }}>
                  <Sparkles size={15} /> {damageLoading ? "Foto analyseren..." : "AI: herken schade op foto"}
                </button>
                {damageError && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#FF8A00", marginTop: 8 }}>{damageError}</div>}
                {damageResult && (() => {
                  const col = damageResult.ernst === "kritiek" ? "#F0453F" : damageResult.ernst === "gemiddeld" ? "#FF8A00" : "#34D399";
                  return (
                    <div className="mt-3 p-3 rounded-lg" style={{ background: "#161C25", border: `1px solid ${col}55`, borderLeft: `3px solid ${col}` }}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 700, color: col, letterSpacing: 0.5, textTransform: "uppercase" }}>AI-analyse</span>
                        <span className="text-xs px-2 py-0.5 rounded" style={{ color: col, border: `1px solid ${col}55`, fontWeight: 600 }}>{damageResult.ernst}</span>
                      </div>
                      {damageResult.onderdeel && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#98A1B0" }}>{damageResult.onderdeel}</div>}
                      <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#E7ECF3", fontWeight: 500, marginTop: 2 }}>{damageResult.schade}</div>
                      {damageResult.aanbeveling && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9", marginTop: 3 }}>💡 {damageResult.aanbeveling}</div>}
                      <button onClick={applyDamageToDescription} className="mt-2 flex items-center gap-1 text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>+ Aan omschrijving toevoegen</button>
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
              <div style={{ fontFamily: "Oswald", fontSize: 20, fontWeight: 600, color: "#E7ECF3" }}>Bijna klaar</div>
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#B4BCC9" }}>Een paar korte vragen helpen de werkplaats (optioneel).</div>
            </div>

            <div>
              <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#E7ECF3", marginBottom: 8, fontWeight: 500 }}>Rijdt het voertuig nog veilig?</div>
              <div className="grid grid-cols-3 gap-2">
                {[{ v: "Ja", c: "#34D399" }, { v: "Twijfel", c: "#FF8A00" }, { v: "Nee", c: "#F0453F" }].map((o) => (
                  <button key={o.v} onClick={() => setVeilig(o.v)} className="py-2.5 rounded-lg text-sm" style={{ fontFamily: "Inter", fontWeight: 600, background: veilig === o.v ? `${o.c}22` : "#1A2129", color: veilig === o.v ? o.c : "#B4BCC9", border: `1px solid ${veilig === o.v ? o.c : "#232B38"}` }}>{o.v}</button>
                ))}
              </div>
              {veilig === "Nee" && <div style={{ fontFamily: "Inter", fontSize: 12, color: "#F0453F", marginTop: 6 }}>⚠ Deze melding wordt als kritiek gemarkeerd.</div>}
            </div>

            <div>
              <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#E7ECF3", marginBottom: 8, fontWeight: 500 }}>Waar op de wagen? <span style={{ color: "#98A1B0", fontWeight: 400 }}>(optioneel)</span></div>
              <div className="flex flex-wrap gap-2">{ZONES.map((z) => <Chip key={z.id} active={zone === z.id} onClick={() => setZone(zone === z.id ? "" : z.id)}>{z.label}</Chip>)}</div>
            </div>

            <div>
              <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#E7ECF3", marginBottom: 8, fontWeight: 500 }}>Wanneer? <span style={{ color: "#98A1B0", fontWeight: 400 }}>(optioneel)</span></div>
              <div className="flex flex-wrap gap-2">{["Bij rijden", "Bij remmen", "Bij starten", "Bij stilstand", "Altijd"].map((w) => <Chip key={w} active={wanneer === w} onClick={() => setWanneer(wanneer === w ? "" : w)}>{w}</Chip>)}</div>
            </div>

            {/* Summary */}
            <div className="p-3 rounded-lg" style={{ background: "#1A2129", border: "1px solid #232B38" }}>
              <div className="flex items-center gap-2 mb-1"><Kenteken value={vehicle} />{selectedVehicle && <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9" }}>{selectedVehicle.merk}</span>}</div>
              <div style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3" }}>{omschrijving}</div>
              {media.length > 0 && <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#B4BCC9", marginTop: 2 }}>{media.length} bijlage(n)</div>}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-2 mt-5">
          {step > 0 && <Button variant="ghost" icon={ChevronLeft} onClick={() => setStep(step - 1)}>Terug</Button>}
          {step < 3 && (
            <Button style={{ flex: 1, justifyContent: "center" }} onClick={() => setStep(step + 1)} disabled={!canNext}>
              {step === 2 && media.length === 0 ? "Overslaan" : "Volgende"}
            </Button>
          )}
          {step === 3 && (
            <Button icon={AlertTriangle} style={{ flex: 1, justifyContent: "center", background: veilig === "Nee" ? "#F0453F" : "#3B82F6" }} onClick={submit} disabled={!vehicle || !omschrijving.trim()}>
              Melding versturen
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function DriverHome({ vehicles, onSubmit, currentUser, myReports }) {
  const firstName = currentUser?.naam?.split(" ")[0] || "";
  const openCount = myReports.filter((r) => r.status !== "klaar").length;
  const doneCount = myReports.filter((r) => r.status === "klaar").length;
  const statusColor = (s) => s === "klaar" ? "#34D399" : s === "nieuw" ? "#B4BCC9" : "#3B82F6";
  return (
    <div className="space-y-6">
      <div className="max-w-xl mx-auto">
        <h1 style={{ fontFamily: "Oswald", fontSize: 26, fontWeight: 600, color: "#E7ECF3" }}>Hoi{firstName ? `, ${firstName}` : ""} 👋</h1>
        <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Zie je iets aan je wagen? Maak hieronder een melding.</p>
        {myReports.length > 0 && (
          <div className="flex gap-2 mt-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "#3B82F618", border: "1px solid #3B82F544" }}>
              <span style={{ fontFamily: "Oswald", fontSize: 15, fontWeight: 700, color: "#3B82F6" }}>{openCount}</span>
              <span style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>lopend</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "#34D39918", border: "1px solid #34D39944" }}>
              <span style={{ fontFamily: "Oswald", fontSize: 15, fontWeight: 700, color: "#34D399" }}>{doneCount}</span>
              <span style={{ fontFamily: "Inter", fontSize: 12, color: "#B4BCC9" }}>afgerond</span>
            </div>
          </div>
        )}
      </div>

      <MeldingMaken vehicles={vehicles} onSubmit={onSubmit} currentUser={currentUser} />

      <div className="max-w-xl mx-auto">
        <Eyebrow>Jouw meldingen</Eyebrow>
        {myReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8" style={{ color: "#98A1B0" }}>
            <CheckCircle2 size={26} color="#6B7585" />
            <span style={{ fontFamily: "Inter", fontSize: 13, marginTop: 8 }}>Nog geen meldingen ingediend.</span>
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
    </div>
  );
}

/* ---------------------------------------------------------------------
   ADMIN VIEWS (largely unchanged from v1, condensed)
--------------------------------------------------------------------- */

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

function DashboardView({ vehicles, parts, reports, planning, company, onNavigate, onSelectVehicle }) {
  const isMobile = useIsMobile();
  const openReports = reports.filter((r) => r.status !== "klaar").length;
  const critical = reports.filter((r) => r.prioriteit === "kritiek" && r.status !== "klaar").length;
  const lowStock = parts.filter((p) => p.voorraad < p.min).length;
  const avgHealth = Math.round(vehicles.reduce((a, v) => a + v.health, 0) / (vehicles.length || 1));
  const inWorkshop = vehicles.filter((v) => v.status === "workshop").length;
  const go = (v) => onNavigate && onNavigate(v);
  // Compliance alerts: vehicles with an expired or soon-expiring keuring
  const complianceAlerts = vehicles
    .map((v) => ({ vehicle: v, items: vehicleComplianceItems(v).filter((it) => it.status === "verlopen" || it.status === "binnenkort") }))
    .filter((x) => x.items.length > 0)
    .sort((a, b) => Math.min(...a.items.map((i) => i.dagen ?? 9999)) - Math.min(...b.items.map((i) => i.dagen ?? 9999)));
  const sortedReports = [...reports].sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
  const todayItems = planning.filter((p) => p.datum === DEMO_TODAY).sort((a, b) => a.tijd.localeCompare(b.tijd));
  const todayLabel = new Date(DEMO_TODAY).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }}>Dashboard</h1>
        <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Overzicht van vloot en garage — {company.name}</p>
      </div>
      <div className="grid grid-cols-2 gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr) minmax(0, 1fr)" : "repeat(4, minmax(0, 1fr))" }}>
        <ClickableKpi label="Voertuigen" value={vehicles.length} icon={Truck} accent="#22D3B0" onClick={() => go("vehicles")} />
        <ClickableKpi label="Open meldingen" value={openReports} icon={Wrench} accent="#3B82F6" onClick={() => go("workfloor")} />
        <ClickableKpi label="Kritiek open" value={critical} icon={AlertTriangle} accent="#F0453F" onClick={() => go("workfloor")} />
        <ClickableKpi label="Lage voorraad" value={lowStock} icon={Package} accent="#B4BCC9" onClick={() => go("parts")} />
      </div>

      {/* Compliance-alerts: verlopen of binnenkort verlopende keuringen */}
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
        <Eyebrow>Gemiddelde vlootgezondheid</Eyebrow>
        <div className="flex items-end gap-4">
          <div style={{ fontFamily: "Oswald", fontSize: 42, fontWeight: 600, color: avgHealth > 75 ? "#34D399" : avgHealth > 50 ? "#FF8A00" : "#F0453F" }}>{avgHealth}%</div>
          <div className="flex-1 h-2 rounded-full mb-3" style={{ background: "#1A2129" }}>
            <div className="h-2 rounded-full" style={{ width: `${avgHealth}%`, background: avgHealth > 75 ? "#34D399" : avgHealth > 50 ? "#FF8A00" : "#F0453F" }} />
          </div>
        </div>
        <div style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }}>{inWorkshop} voertuig(en) momenteel in de werkplaats</div>
      </Card>

      <Card className="p-5">
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <Calendar size={16} color="#3B82F6" style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>Planning vandaag</div>
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

      <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))" }}>
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

  const today = new Date(DEMO_TODAY);
  const todayKey = DEMO_TODAY;
  const todayItems = planning.filter((p) => p.datum === todayKey).sort((a, b) => a.tijd.localeCompare(b.tijd));

  // next 7 days planning
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const key = d.toISOString().slice(0, 10);
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
  const nowMinutes = 8 * 60; // demo "current time" 08:00
  const nextAppt = todayItems.find((p) => { const [h, m] = p.tijd.split(":").map(Number); return h * 60 + m >= nowMinutes; }) || todayItems[0];
  const scheduledMin = todayItems.reduce((a, p) => a + (Number(p.duur) || 0), 0);
  const workloadPct = Math.min(100, Math.round((scheduledMin / (8 * 60)) * 100)); // vs 8h day

  const dayNames = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  const firstName = currentUser?.naam?.split(" ")[0] || "";

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }}>Werkplaats</h1>
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
            {newReports.sort((a, b) => (a.prioriteit === "kritiek" ? -1 : 1)).slice(0, 4).map((r) => (
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
      <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr) minmax(0, 1fr)" : "repeat(4, minmax(0, 1fr))" }}>
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
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr) minmax(0, 1fr)" : "repeat(4, minmax(0, 1fr))" }}>
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

function VehiclesView({ vehicles, onAdd, onSelect }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kenteken: "", merk: "", type: "Truck", bouwjaar: "", km: "" });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMsg, setAiMsg] = useState("");

  const lookupPlate = async () => {
    const plate = form.kenteken.trim().toUpperCase();
    if (!plate) { setAiMsg("Vul eerst een kenteken in."); return; }
    setAiLoading(true); setAiMsg("");
    try {
      const prompt = `Je bent een RDW-voertuigassistent. Geef voor het Nederlandse kenteken "${plate}" je beste inschatting van de voertuiggegevens. Antwoord UITSLUITEND met JSON, geen uitleg, in dit formaat:
{"merk":"<merk en model>","type":"Truck of Bestelwagen","bouwjaar":<jaartal>}
Als je het niet zeker weet, geef dan een plausibele inschatting op basis van het kentekenformaat. Geen extra tekst.`;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      let text = (Array.isArray(data.content) ? data.content : []).filter((c) => c && c.type === "text").map((c) => c.text).join("").trim();
      text = text.replace(/```json\s*|```/g, "").trim();
      const parsed = JSON.parse(text);
      setForm((f) => ({ ...f, merk: parsed.merk || f.merk, type: parsed.type === "Bestelwagen" ? "Bestelwagen" : "Truck", bouwjaar: parsed.bouwjaar ? String(parsed.bouwjaar) : f.bouwjaar }));
      setAiMsg("✓ Gegevens ingevuld door AI — controleer en pas zo nodig aan.");
    } catch (err) {
      setAiMsg(`Kon gegevens niet ophalen (${err.message || "fout"}). AI werkt alleen in de gepubliceerde app. Vul handmatig in.`);
    } finally {
      setAiLoading(false);
    }
  };

  const submit = () => {
    if (!form.kenteken || !form.merk) return;
    onAdd({ id: "v" + Date.now(), kenteken: form.kenteken.toUpperCase(), merk: form.merk, type: form.type, bouwjaar: Number(form.bouwjaar) || new Date().getFullYear(), km: Number(form.km) || 0, status: "operational", health: 100, driver: "—", apkTot: "", tachoTot: "", tachoPlicht: form.type === "Truck", verzekeringTot: "" });
    setForm({ kenteken: "", merk: "", type: "Truck", bouwjaar: "", km: "" }); setAiMsg(""); setOpen(false);
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }}>Voertuigen</h1><p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Tik op een voertuig voor details.</p></div>
        <Button icon={Plus} onClick={() => setOpen(true)}>Voertuig toevoegen</Button>
      </div>
      {open && (
        <Card className="p-5">
          {/* Kenteken + AI lookup */}
          <div>
            <FieldLabel>Kenteken</FieldLabel>
            <div className="flex gap-2" style={{ flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <input placeholder="Bv. 84-BSX-2" value={form.kenteken} onChange={(e) => setForm({ ...form, kenteken: e.target.value })} className="tg-input" style={{ flex: 1, minWidth: 0 }} />
              <Button icon={Sparkles} onClick={lookupPlate} disabled={aiLoading} style={{ flexShrink: 0 }}>{aiLoading ? "Zoeken..." : "AI invullen"}</Button>
            </div>
            {aiMsg && <div style={{ fontFamily: "Inter", fontSize: 12, color: aiMsg.startsWith("✓") ? "#34D399" : "#FF8A00", marginTop: 6 }}>{aiMsg}</div>}
          </div>

          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(4, minmax(0, 1fr))" }}>
            <div><FieldLabel>Merk/model</FieldLabel><input placeholder="Merk/model" value={form.merk} onChange={(e) => setForm({ ...form, merk: e.target.value })} className="tg-input" /></div>
            <div><FieldLabel>Type</FieldLabel><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="tg-input"><option>Truck</option><option>Bestelwagen</option></select></div>
            <div><FieldLabel>Bouwjaar</FieldLabel><input placeholder="Bouwjaar" value={form.bouwjaar} onChange={(e) => setForm({ ...form, bouwjaar: e.target.value })} className="tg-input" /></div>
            <div><FieldLabel>KM-stand</FieldLabel><input placeholder="KM-stand" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} className="tg-input" /></div>
          </div>
          <div className="flex gap-2 mt-4"><Button onClick={submit}>Opslaan</Button><Button variant="ghost" onClick={() => { setOpen(false); setAiMsg(""); }}>Annuleren</Button></div>
        </Card>
      )}
      {vehicles.length === 0 ? <EmptyState icon={Truck} text='Nog geen voertuigen.' /> : isMobile ? (
        <div className="space-y-3">
          {vehicles.map((v) => (
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
              {vehicles.map((v) => (
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

function VehicleDetailView({ vehicle, reports, planning, costs = [], onAddCost, onDeleteCost, onUpdate, onAddPlanning, onBack, onGoInspection, isAdmin, onDelete }) {
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(vehicle);
  const [sched, setSched] = useState({ open: false, datum: DEMO_TODAY, tijd: "09:00", duur: "60", taak: "", monteur: "" });
  const [toast, setToast] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [costForm, setCostForm] = useState({ open: false, categorie: "onderhoud", bedrag: "", datum: DEMO_TODAY, omschrijving: "" });
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
        vandaag: DEMO_TODAY,
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
      setPredError(`Kon voorspelling niet ophalen (${err.message || "fout"}). AI werkt alleen in de gepubliceerde app, niet in het preview-venster.`);
    } finally {
      setPredLoading(false);
    }
  };

  useEffect(() => { setForm(vehicle); }, [vehicle.id]);

  const vReports = reports.filter((r) => r.vehicle === vehicle.kenteken).sort((a, b) => (a.datum < b.datum ? 1 : -1));
  const vPlanning = planning.filter((p) => p.vehicle === vehicle.kenteken).sort((a, b) => (a.datum + a.tijd < b.datum + b.tijd ? 1 : -1));

  const saveEdit = () => {
    onUpdate({ ...form, km: Number(form.km) || 0, bouwjaar: Number(form.bouwjaar) || form.bouwjaar, health: Number(form.health) || form.health });
    setEditing(false);
    setToast("Voertuig bijgewerkt.");
  };

  const submitSchedule = (fromReport) => {
    const taak = fromReport ? fromReport.omschrijving : sched.taak;
    if (!taak) return;
    onAddPlanning({ id: "pl" + Date.now(), vehicle: vehicle.kenteken, datum: sched.datum, tijd: sched.tijd, duur: Number(sched.duur) || 60, taak, monteur: sched.monteur || "—", reportId: fromReport ? fromReport.id : null });
    setSched({ open: false, datum: DEMO_TODAY, tijd: "09:00", duur: "60", taak: "", monteur: "" });
    setToast("Ingepland.");
  };

  return (
    <div className="space-y-5" style={{ maxWidth: 720, margin: "0 auto" }}>
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
      <button onClick={onBack} className="flex items-center gap-1.5" style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13, fontWeight: 600 }}><ChevronLeft size={16} /> Terug naar voertuigen</button>

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
          <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr) minmax(0,1fr)" : "repeat(4, minmax(0,1fr))" }}>
            <div><Eyebrow>KM-stand</Eyebrow><div style={{ fontFamily: "JetBrains Mono", fontSize: 16, color: "#E7ECF3", fontWeight: 700 }}>{vehicle.km.toLocaleString("nl-NL")}</div></div>
            <div><Eyebrow>Chauffeur</Eyebrow><div style={{ fontFamily: "Inter", fontSize: 14, color: "#E7ECF3" }}>{vehicle.driver}</div></div>
            <div><Eyebrow>Gezondheid</Eyebrow><div style={{ fontFamily: "Oswald", fontSize: 18, fontWeight: 600, color: vehicle.health > 75 ? "#34D399" : vehicle.health > 50 ? "#FF8A00" : "#F0453F" }}>{vehicle.health}%</div></div>
            <div><Eyebrow>Status</Eyebrow><div style={{ fontFamily: "Inter", fontSize: 14, color: STATUS_META[vehicle.status].color }}>{STATUS_META[vehicle.status].label}</div></div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))" }}>
              <div><Eyebrow>Merk/model</Eyebrow><input className="tg-input" style={{ width: "100%" }} value={form.merk} onChange={(e) => setForm({ ...form, merk: e.target.value })} /></div>
              <div><Eyebrow>Type</Eyebrow><select className="tg-input" style={{ width: "100%" }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Truck</option><option>Bestelwagen</option></select></div>
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
                <div className="grid gap-2" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr) minmax(0,1fr)" : "repeat(4, minmax(0,1fr))" }}>
                  <div><FieldLabel>Categorie</FieldLabel><select className="tg-input" style={{ width: "100%", minWidth: 0 }} value={costForm.categorie} onChange={(e) => setCostForm({ ...costForm, categorie: e.target.value })}><option value="onderhoud">Onderhoud</option><option value="brandstof">Brandstof</option><option value="reparatie">Reparatie</option><option value="verzekering">Verzekering</option><option value="belasting">Belasting</option><option value="overig">Overig</option></select></div>
                  <div><FieldLabel>Bedrag (€)</FieldLabel><input type="number" className="tg-input" style={{ width: "100%", minWidth: 0 }} value={costForm.bedrag} onChange={(e) => setCostForm({ ...costForm, bedrag: e.target.value })} /></div>
                  <div><FieldLabel>Datum</FieldLabel><input type="date" className="tg-input" style={{ width: "100%", minWidth: 0 }} value={costForm.datum} onChange={(e) => setCostForm({ ...costForm, datum: e.target.value })} /></div>
                  <div><FieldLabel>Omschrijving</FieldLabel><input className="tg-input" style={{ width: "100%", minWidth: 0 }} placeholder="Optioneel" value={costForm.omschrijving} onChange={(e) => setCostForm({ ...costForm, omschrijving: e.target.value })} /></div>
                </div>
                <div className="flex gap-2">
                  <Button small onClick={() => { if (!costForm.bedrag) return; onAddCost({ id: "c" + Date.now(), vehicle: vehicle.kenteken, categorie: costForm.categorie, bedrag: Number(costForm.bedrag), datum: costForm.datum, omschrijving: costForm.omschrijving }); setCostForm({ open: false, categorie: "onderhoud", bedrag: "", datum: DEMO_TODAY, omschrijving: "" }); }}>Toevoegen</Button>
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
                      {isAdmin && <button onClick={() => onDeleteCost && onDeleteCost(c.id)} style={{ color: "#98A1B0" }}><X size={14} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })()}

      {/* Snel inplannen */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <Eyebrow>Werkplaats inplannen</Eyebrow>
          {onGoInspection && <button onClick={onGoInspection} style={{ color: "#3B82F6", fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>360° inspectie</button>}
        </div>
        {!sched.open ? (
          <Button icon={Plus} onClick={() => setSched({ ...sched, open: true })}>Afspraak inplannen</Button>
        ) : (
          <div className="space-y-3">
            <div><Eyebrow>Taak</Eyebrow><input className="tg-input" style={{ width: "100%" }} placeholder="Bv. Grote beurt" value={sched.taak} onChange={(e) => setSched({ ...sched, taak: e.target.value })} /></div>
            <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr) minmax(0,1fr)" : "repeat(4, minmax(0,1fr))" }}>
              <div><Eyebrow>Datum</Eyebrow><input type="date" className="tg-input" style={{ width: "100%" }} value={sched.datum} onChange={(e) => setSched({ ...sched, datum: e.target.value })} /></div>
              <div><Eyebrow>Tijd</Eyebrow><input type="time" className="tg-input" style={{ width: "100%" }} value={sched.tijd} onChange={(e) => setSched({ ...sched, tijd: e.target.value })} /></div>
              <div><Eyebrow>Duur (min)</Eyebrow><input type="number" className="tg-input" style={{ width: "100%" }} value={sched.duur} onChange={(e) => setSched({ ...sched, duur: e.target.value })} /></div>
              <div><Eyebrow>Monteur</Eyebrow><input className="tg-input" style={{ width: "100%" }} value={sched.monteur} onChange={(e) => setSched({ ...sched, monteur: e.target.value })} /></div>
            </div>
            <div className="flex gap-2"><Button onClick={() => submitSchedule(null)} disabled={!sched.taak}>Inplannen</Button><Button variant="ghost" onClick={() => setSched({ ...sched, open: false })}>Annuleren</Button></div>
          </div>
        )}
      </Card>

      {/* AI voorspellend onderhoud */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: "#3B82F618" }}><Sparkles size={15} color="#3B82F6" /></div>
            <span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: "#E7ECF3" }}>Voorspellend onderhoud</span>
          </div>
          <Button small icon={Sparkles} onClick={runPrediction} disabled={predLoading}>{predLoading ? "Analyseren..." : prediction ? "Opnieuw" : "Analyseer"}</Button>
        </div>
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", marginBottom: prediction || predError ? 12 : 0 }}>AI schat op basis van km-stand, leeftijd en meldingen in wat er binnenkort aandacht nodig heeft.</div>
        {predError && <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#FF8A00" }}>{predError}</div>}
        {prediction && prediction.items && (
          <div className="space-y-2">
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
                  <button onClick={() => { setSched({ open: true, datum: DEMO_TODAY, tijd: "09:00", duur: "60", taak: it.taak, monteur: "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
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
                  <button onClick={() => { setSched({ open: true, datum: DEMO_TODAY, tijd: "09:00", duur: "60", taak: r.omschrijving, monteur: "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
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
  );
}

function TrailersView({ trailers, onAdd }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kenteken: "", merk: "", type: "" });
  const submit = () => { if (!form.kenteken || !form.merk) return; onAdd({ id: "t" + Date.now(), kenteken: form.kenteken.toUpperCase(), merk: form.merk, type: form.type || "Trailer", bouwjaar: new Date().getFullYear(), status: "operational" }); setForm({ kenteken: "", merk: "", type: "" }); setOpen(false); };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }}>Trailers</h1><p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Beheer je trailers en aanhangwagens.</p></div>
        <Button icon={Plus} onClick={() => setOpen(true)}>Trailer toevoegen</Button>
      </div>
      {open && (
        <Card className="p-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))" }}>
            <input placeholder="Kenteken" value={form.kenteken} onChange={(e) => setForm({ ...form, kenteken: e.target.value })} className="tg-input" />
            <input placeholder="Merk" value={form.merk} onChange={(e) => setForm({ ...form, merk: e.target.value })} className="tg-input" />
            <input placeholder="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="tg-input" />
          </div>
          <div className="flex gap-2 mt-4"><Button onClick={submit}>Opslaan</Button><Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button></div>
        </Card>
      )}
      {trailers.length === 0 ? <EmptyState icon={Container} text="Nog geen aanhangers." /> : (
        <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))" }}>
          {trailers.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-center justify-between mb-3"><Kenteken value={t.kenteken} /><StatusLamp status={t.status} /></div>
              <div style={{ fontFamily: "Inter", color: "#E7ECF3", fontWeight: 600, fontSize: 14 }}>{t.merk}</div>
              <div style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 13 }}>{t.type} · {t.bouwjaar}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PartsView({ parts, onAdd }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ naam: "", voorraad: "", min: "", prijs: "" });
  const submit = () => { if (!form.naam) return; onAdd({ id: "p" + Date.now(), naam: form.naam, voorraad: Number(form.voorraad) || 0, min: Number(form.min) || 0, eenheid: "stuks", prijs: Number(form.prijs) || 0 }); setForm({ naam: "", voorraad: "", min: "", prijs: "" }); setOpen(false); };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }}>Voorraad &amp; onderdelen</h1><p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Automatisch afgeboekt bij gebruik.</p></div>
        <Button icon={Plus} onClick={() => setOpen(true)}>Onderdeel toevoegen</Button>
      </div>
      {open && (
        <Card className="p-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "2fr 1fr 1fr" }}>
            <input placeholder="Naam" value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} className="tg-input" />
            <input placeholder="Voorraad" value={form.voorraad} onChange={(e) => setForm({ ...form, voorraad: e.target.value })} className="tg-input" />
            <input placeholder="Min." value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} className="tg-input" />
          </div>
          <div className="flex gap-2 mt-4"><Button onClick={submit}>Opslaan</Button><Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button></div>
        </Card>
      )}
      {parts.length === 0 ? <EmptyState icon={Package} text="Nog geen onderdelen." /> : isMobile ? (
        <div className="space-y-3">
          {parts.map((p) => { const low = p.voorraad < p.min; return (
            <Card key={p.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontFamily: "Inter", color: "#E7ECF3", fontWeight: 600, fontSize: 14 }}>{p.naam}</span>
                {low && <span className="text-xs px-2 py-0.5 rounded" style={{ color: "#F0453F", border: "1px solid #F0453F55", fontWeight: 600, flexShrink: 0 }}>Laag</span>}
              </div>
              <div className="flex items-center justify-between" style={{ fontFamily: "Inter", fontSize: 13 }}>
                <span style={{ color: "#B4BCC9" }}>Voorraad: <span style={{ color: low ? "#F0453F" : "#E7ECF3", fontFamily: "JetBrains Mono", fontWeight: 700 }}>{p.voorraad}</span> / min. {p.min} {p.eenheid}</span>
                <span style={{ color: "#B4BCC9", fontFamily: "JetBrains Mono" }}>€ {p.prijs}</span>
              </div>
            </Card>
          ); })}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "Inter", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: "1px solid #232B38" }}>{["Onderdeel", "Voorraad", "Min.", "Eenheid", "Prijs", ""].map((h) => <th key={h} className="text-left px-4 py-3" style={{ color: "#B4BCC9", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>
              {parts.map((p) => { const low = p.voorraad < p.min; return (
                <tr key={p.id} style={{ borderBottom: "1px solid #1A2129" }}>
                  <td className="px-4 py-3" style={{ color: "#E7ECF3" }}>{p.naam}</td>
                  <td className="px-4 py-3" style={{ color: low ? "#F0453F" : "#E7ECF3", fontFamily: "JetBrains Mono", fontWeight: 700 }}>{p.voorraad}</td>
                  <td className="px-4 py-3" style={{ color: "#B4BCC9" }}>{p.min}</td>
                  <td className="px-4 py-3" style={{ color: "#B4BCC9" }}>{p.eenheid}</td>
                  <td className="px-4 py-3" style={{ color: "#B4BCC9", fontFamily: "JetBrains Mono" }}>€ {p.prijs}</td>
                  <td className="px-4 py-3">{low && <span className="text-xs px-2 py-0.5 rounded" style={{ color: "#F0453F", border: "1px solid #F0453F55", fontWeight: 600 }}>Lage voorraad</span>}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function MaintenanceView({ maintenance, onAdd }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vehicle: "", taak: "", dueDate: "" });
  const submit = () => { if (!form.vehicle || !form.taak) return; onAdd({ id: "m" + Date.now(), vehicle: form.vehicle, taak: form.taak, dueKm: null, dueDate: form.dueDate || "—", status: "gepland" }); setForm({ vehicle: "", taak: "", dueDate: "" }); setOpen(false); };
  const statusColor = { gepland: "#22D3B0", urgent: "#F0453F", in_uitvoering: "#FF8A00" };
  const statusLabel = { gepland: "Gepland", urgent: "Urgent", in_uitvoering: "In uitvoering" };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }}>Voorspellend onderhoud</h1><p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Op basis van kilometerstand én tijd.</p></div>
        <Button icon={Plus} onClick={() => setOpen(true)}>Nieuw schema</Button>
      </div>
      {open && (
        <Card className="p-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))" }}>
            <input placeholder="Kenteken" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} className="tg-input" />
            <input placeholder="Taak" value={form.taak} onChange={(e) => setForm({ ...form, taak: e.target.value })} className="tg-input" />
            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="tg-input" />
          </div>
          <div className="flex gap-2 mt-4"><Button onClick={submit}>Opslaan</Button><Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button></div>
        </Card>
      )}
      {maintenance.length === 0 ? <EmptyState icon={Calendar} text="Nog geen onderhoudsschema's." /> : (
        <div className="space-y-3">
          {maintenance.map((m) => (
            <Card key={m.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Kenteken value={m.vehicle} />
                <div><div style={{ fontFamily: "Inter", color: "#E7ECF3", fontWeight: 600, fontSize: 14 }}>{m.taak}</div><div style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 12 }}>Verwacht: {m.dueDate}{m.dueKm ? ` · ${m.dueKm.toLocaleString("nl-NL")} km` : ""}</div></div>
              </div>
              <span className="text-xs px-2 py-1 rounded" style={{ color: statusColor[m.status], border: `1px solid ${statusColor[m.status]}55`, fontWeight: 600, fontFamily: "Inter" }}>{statusLabel[m.status]}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkfloorView({ reports, onMove, onSchedule, mechanics = [], availability = {}, hours }) {
  const isMobile = useIsMobile();
  const [moveMenu, setMoveMenu] = useState(null); // report id whose menu is open
  const [schedFor, setSchedFor] = useState(null); // report id being scheduled
  const [schedForm, setSchedForm] = useState({ datum: DEMO_TODAY, tijd: "09:00", duur: "60", monteurId: "", monteur: "" });
  const [toast, setToast] = useState("");

  const openSchedule = (r) => {
    setMoveMenu(null);
    setSchedFor(r.id);
    const first = mechanics[0];
    setSchedForm({ datum: DEMO_TODAY, tijd: "09:00", duur: "60", monteurId: first?.id || "", monteur: first?.naam || "" });
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
      <div><h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }}>Werkvloer</h1><p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Meldingen van chauffeurs, direct in beeld.</p></div>
      {reports.length === 0 ? <EmptyState icon={CheckCircle2} text="Niks meer te doen. Goed werk!" /> : (
        <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(4, minmax(0, 1fr))" }}>
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
                      <div className="flex items-center gap-3 flex-wrap">
                        {col.id !== "klaar" && (
                          <button onClick={() => openSchedule(r)} className="flex items-center gap-1 text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}><Calendar size={12} /> Inplannen</button>
                        )}
                        <button onClick={() => setMoveMenu(moveMenu === r.id ? null : r.id)} className="flex items-center gap-1 text-xs" style={{ color: "#B4BCC9", fontFamily: "Inter", fontWeight: 600 }}>Verplaatsen <ChevronDown size={12} /></button>
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
    </div>
  );
}

/* ---------------------------------------------------------------------
   GEBRUIKERS (admin: invite / user management)
--------------------------------------------------------------------- */

function UsersView({ users, onAdd, onResend, onDelete, currentUserId }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ naam: "", email: "", telefoon: "", rol: "chauffeur", mode: "invite", wachtwoord: "" });
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelId, setConfirmDelId] = useState(null);

  const roleOptions = [
    { id: "chauffeur", label: "Chauffeur", desc: "Meldingen maken", icon: AlertTriangle },
    { id: "garage", label: "Werkplaats", desc: "Werkvloer & planning", icon: Wrench },
    { id: "admin", label: "Beheerder", desc: "Volledige toegang", icon: ShieldCheck },
  ];

  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const reset = () => { setForm({ naam: "", email: "", telefoon: "", rol: "chauffeur", mode: "invite", wachtwoord: "" }); setError(""); setOpen(false); };

  const submit = () => {
    if (!form.naam.trim()) return setError("Vul een naam in.");
    if (!form.email && !form.telefoon) return setError("Vul een e-mail of telefoonnummer in.");
    if (form.email && !validEmail(form.email)) return setError("Vul een geldig e-mailadres in.");
    if (users.some((u) => form.email && u.email && u.email.toLowerCase() === form.email.toLowerCase())) return setError("Er bestaat al een gebruiker met dit e-mailadres.");
    if (form.mode === "direct" && form.wachtwoord.length < 4) return setError("Kies een wachtwoord van minstens 4 tekens.");

    if (form.mode === "direct") {
      onAdd({ id: "u" + Date.now(), naam: form.naam.trim(), email: form.email, telefoon: form.telefoon, rol: form.rol, status: "actief", wachtwoord: form.wachtwoord });
      setToast(`${form.naam} is toegevoegd en kan direct inloggen.`);
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
          <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }}>Gebruikers</h1>
          <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>{activeCount} actief · {invitedCount} uitgenodigd</p>
        </div>
        {!open && <Button icon={Plus} onClick={() => setOpen(true)}>Nieuwe gebruiker</Button>}
      </div>

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

          {/* Invite vs direct */}
          <div>
            <FieldLabel>Toegang</FieldLabel>
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #232B38" }}>
              <button onClick={() => setForm({ ...form, mode: "invite" })} className="flex-1 py-2.5 text-xs" style={{ fontFamily: "Inter", fontWeight: 600, background: form.mode === "invite" ? "#1A2129" : "transparent", color: form.mode === "invite" ? "#3B82F6" : "#B4BCC9" }}>Uitnodiging sturen</button>
              <button onClick={() => setForm({ ...form, mode: "direct" })} className="flex-1 py-2.5 text-xs" style={{ fontFamily: "Inter", fontWeight: 600, background: form.mode === "direct" ? "#1A2129" : "transparent", color: form.mode === "direct" ? "#3B82F6" : "#B4BCC9" }}>Direct actief</button>
            </div>
            <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#98A1B0", marginTop: 6 }}>
              {form.mode === "invite" ? "De gebruiker krijgt (gesimuleerd) een uitnodiging en stelt zelf een wachtwoord in." : "Je stelt nu een wachtwoord in; de gebruiker kan meteen inloggen."}
            </div>
          </div>

          {form.mode === "direct" && (
            <div><FieldLabel>Wachtwoord *</FieldLabel><input type="password" placeholder="Minstens 4 tekens" value={form.wachtwoord} onChange={(e) => setForm({ ...form, wachtwoord: e.target.value })} className="tg-input" style={{ width: isMobile ? "100%" : "50%" }} /></div>
          )}

          {error && <div style={{ color: "#F0453F", fontFamily: "Inter", fontSize: 12.5 }}>{error}</div>}

          <div className="flex gap-2">
            <Button onClick={submit} icon={form.mode === "direct" ? ShieldCheck : Send}>{form.mode === "direct" ? "Toevoegen" : "Uitnodiging versturen"}</Button>
            <Button variant="ghost" onClick={reset}>Annuleren</Button>
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
                  {u.status !== "actief" && <button onClick={() => { onResend(u); setToast(`Uitnodiging opnieuw verstuurd naar ${u.naam}.`); }} className="text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>Opnieuw versturen</button>}
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
                      {u.status !== "actief" && <button onClick={() => { onResend(u); setToast(`Uitnodiging opnieuw verstuurd naar ${u.naam}.`); }} className="text-xs" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>Opnieuw versturen</button>}
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

function SettingsView({ mechanics, availability, hours, onSetMechanicWeek, onSetHours }) {
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState(mechanics[0]?.id || "");
  const [toast, setToast] = useState("");

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
      </div>

      {/* Workshop hours */}
      <Card className="p-5">
        <Eyebrow>Openingstijden werkplaats</Eyebrow>
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#B4BCC9", marginBottom: 12 }}>Buiten deze tijden waarschuwt de app bij het inplannen.</div>
        <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "minmax(0,1fr) minmax(0,1fr)" : "180px 180px" }}>
          <div style={{ minWidth: 0 }}><FieldLabel>Open vanaf</FieldLabel><input type="time" className="tg-input" value={hours.van} onChange={(e) => onSetHours({ ...hours, van: e.target.value })} /></div>
          <div style={{ minWidth: 0 }}><FieldLabel>Sluit om</FieldLabel><input type="time" className="tg-input" value={hours.tot} onChange={(e) => onSetHours({ ...hours, tot: e.target.value })} /></div>
        </div>
      </Card>

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
                  const day = week[wd.key];
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
                          <input type="time" className="tg-input" style={{ padding: "6px 8px" }} value={day.van} onChange={(e) => updateDay(wd.key, { van: e.target.value })} />
                          <span style={{ color: "#98A1B0" }}>–</span>
                          <input type="time" className="tg-input" style={{ padding: "6px 8px" }} value={day.tot} onChange={(e) => updateDay(wd.key, { tot: e.target.value })} />
                        </div>
                      ) : (
                        <span style={{ fontFamily: "Inter", fontSize: 12.5, color: "#98A1B0", flex: 1 }}>Niet beschikbaar</span>
                      )}
                    </div>
                  );
                })}
                <button onClick={applyToAllWeekdays} className="text-xs mt-1" style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 600 }}>Maandag-tijden toepassen op ma t/m vr</button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------
   AI ASSISTENT — echte Claude API call over de meldingen van dit bedrijf
--------------------------------------------------------------------- */

function AiAssistantView({ reports, vehicles, company, onAddVehicle, onAddPlanning, onNavigate }) {
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
          datum: action.datum || DEMO_TODAY, tijd: action.tijd || "09:00",
          duur: Number(action.duur) || 60, taak: action.taak || "Reparatie", monteur: action.monteur || "—",
        });
        return `✓ ${action.taak || "Reparatie"} ingepland voor ${String(action.kenteken).toUpperCase()} op ${action.datum || DEMO_TODAY} om ${action.tijd || "09:00"}.`;
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

Gebruik datum-formaat JJJJ-MM-DD. Vandaag is ${DEMO_TODAY}. Als er geen datum genoemd is, gebruik vandaag. Verzin geen data die je niet hebt; vraag door als iets ontbreekt. Voor gewone vragen antwoord je kort en concreet in het Nederlands zonder <actie>-blok.

VOERTUIGEN:\n${JSON.stringify(vehicles)}\n\nMELDINGEN:\n${JSON.stringify(reports)}`;

    const apiMessages = [
      { role: "user", content: instructions + "\n\nBevestig kort dat je klaar staat." },
      { role: "assistant", content: "Ik sta klaar. Ik kan vragen beantwoorden en voertuigen toevoegen of reparaties inplannen." },
      ...newMessages.slice(1).map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: apiMessages }),
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`API ${response.status}${errText ? ": " + errText.slice(0, 120) : ""}`);
      }
      const data = await response.json();
      let text = (Array.isArray(data.content) ? data.content : []).filter((c) => c && c.type === "text").map((c) => c.text).join("\n").trim();
      if (!text && typeof data.completion === "string") text = data.completion.trim();
      if (!text) throw new Error("leeg antwoord");

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
      setMessages((m) => [...m, { role: "assistant", content: `Kon geen antwoord ophalen (${err.message || "netwerkfout"}). Let op: de AI werkt alleen in de gepubliceerde app, niet in dit preview-venster.` }]);
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
        <input className="tg-input flex-1" style={{ minWidth: 0 }} placeholder="Stel een vraag of geef een opdracht..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <Button icon={Send} onClick={send} disabled={loading}>Vraag</Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   360° INSPECTIE — multi-aanzicht hotspot-diagram (geen fotogrammetrie)
--------------------------------------------------------------------- */

const ANGLES = [
  { id: "voor", label: "Voorkant", hotspots: [
    { zone: "voorkant", x: 50, y: 40, label: "Bumper / grille" },
    { zone: "dak", x: 50, y: 15, label: "Verlichting / cabine top" },
    { zone: "wielen", x: 22, y: 78, label: "Wiel links" },
    { zone: "wielen", x: 78, y: 78, label: "Wiel rechts" },
  ]},
  { id: "zij", label: "Zijkant", hotspots: [
    { zone: "cabine", x: 25, y: 35, label: "Cabine" },
    { zone: "onder", x: 55, y: 70, label: "Chassis / onder" },
    { zone: "wielen", x: 30, y: 88, label: "Wielen" },
    { zone: "wielen", x: 75, y: 88, label: "Wielen achter" },
  ]},
  { id: "achter", label: "Achterkant", hotspots: [
    { zone: "achterkant", x: 50, y: 40, label: "Achterportier / laadklep" },
    { zone: "dak", x: 50, y: 15, label: "Achterverlichting" },
    { zone: "wielen", x: 25, y: 78, label: "Wiel links" },
    { zone: "wielen", x: 75, y: 78, label: "Wiel rechts" },
  ]},
];

function InspectionView({ vehicles, reports }) {
  const isMobile = useIsMobile();
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.kenteken || "");
  const [angleIdx, setAngleIdx] = useState(0);
  const [activeZone, setActiveZone] = useState(null);
  const angle = ANGLES[angleIdx];

  const zoneReports = (zoneId) => reports.filter((r) => r.vehicle === vehicleId && r.zone === zoneId).sort((a, b) => (a.datum < b.datum ? 1 : -1));
  const activeReports = activeZone ? zoneReports(activeZone) : [];
  const zoneLabel = (id) => ZONES.find((z) => z.id === id)?.label || id;

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><ScanEye size={22} color="#22D3B0" /> Voertuiginspectie</h1>
        <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Klik op een onderdeel voor status en meldingshistorie. Wissel van aanzicht met de pijlen.</p>
      </div>

      <select className="tg-input" value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); setActiveZone(null); }}>
        {vehicles.map((v) => <option key={v.id} value={v.kenteken}>{v.kenteken} — {v.merk}</option>)}
      </select>

      <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "2fr 1fr" }}>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setAngleIdx((i) => (i - 1 + ANGLES.length) % ANGLES.length)} className="p-1"><ChevronLeft color="#B4BCC9" /></button>
            <div className="flex gap-2">
              {ANGLES.map((a, i) => <Chip key={a.id} active={i === angleIdx} onClick={() => setAngleIdx(i)}>{a.label}</Chip>)}
            </div>
            <button onClick={() => setAngleIdx((i) => (i + 1) % ANGLES.length)} className="p-1"><ChevronRight color="#B4BCC9" /></button>
          </div>

          <div className="relative mx-auto" style={{ width: "100%", maxWidth: 420, aspectRatio: "4/3", background: "#1A2129", borderRadius: 12, border: "1px solid #232B38" }}>
            {/* simplified vehicle silhouette */}
            <div style={{ position: "absolute", left: "15%", right: "15%", top: "30%", bottom: "35%", background: "#232B38", borderRadius: 10 }} />
            <div style={{ position: "absolute", left: "18%", width: 10, height: 10, borderRadius: 5, bottom: "18%", background: "#0A0E14", border: "2px solid #3A4252" }} />
            <div style={{ position: "absolute", right: "18%", width: 10, height: 10, borderRadius: 5, bottom: "18%", background: "#0A0E14", border: "2px solid #3A4252" }} />
            <Truck size={38} color="#6B7585" style={{ position: "absolute", left: "50%", top: "48%", transform: "translate(-50%,-50%)" }} />

            {angle.hotspots.map((h, i) => {
              const count = zoneReports(h.zone).length;
              return (
                <button key={i} onClick={() => setActiveZone(h.zone)}
                  className="absolute rounded-full flex items-center justify-center"
                  style={{ left: `${h.x}%`, top: `${h.y}%`, transform: "translate(-50%,-50%)", width: 22, height: 22, background: count > 0 ? "#FF8A00" : "#22D3B0", border: "2px solid #0A0E14", boxShadow: count > 0 ? "0 0 10px #FF8A0088" : "none" }}>
                  {count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#0A0E14" }}>{count}</span>}
                </button>
              );
            })}
          </div>
          <div style={{ color: "#98A1B0", fontFamily: "Inter", fontSize: 11 }} className="text-center mt-3">
            Amber = onderdeel met meldingen · Teal = geen meldingen
          </div>
        </Card>

        <Card className="p-5">
          <Eyebrow>{activeZone ? zoneLabel(activeZone) : "Selecteer een onderdeel"}</Eyebrow>
          {!activeZone ? (
            <div style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 13 }}>Klik op een stip in het diagram om details te zien.</div>
          ) : activeReports.length === 0 ? (
            <div style={{ color: "#34D399", fontFamily: "Inter", fontSize: 13 }}>Geen meldingen bekend voor dit onderdeel.</div>
          ) : (
            <div className="space-y-3">
              {activeReports.map((r) => (
                <div key={r.id} className="pb-3" style={{ borderBottom: "1px solid #1A2129" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: PRIO_META[r.prioriteit].color, border: `1px solid ${PRIO_META[r.prioriteit].color}55`, fontWeight: 600 }}>{PRIO_META[r.prioriteit].label}</span>
                    <span style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 11 }}>{r.datum}</span>
                  </div>
                  <div style={{ color: "#E7ECF3", fontFamily: "Inter", fontSize: 13 }}>{r.omschrijving}</div>
                  <div style={{ color: "#B4BCC9", fontFamily: "Inter", fontSize: 11 }} className="mt-1">{r.chauffeur} · status: {KANBAN_COLS.find((c) => c.id === r.status)?.label}</div>
                </div>
              ))}
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

function toDateKey(d) { return d.toISOString().slice(0, 10); }

function FieldLabel({ children }) {
  return <div style={{ fontFamily: "Inter", fontSize: 11.5, color: "#B4BCC9", fontWeight: 600, marginBottom: 4 }}>{children}</div>;
}

function PlanningView({ vehicles, planning, reports, onAdd }) {
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState(new Date(2026, 6, 1)); // juli 2026
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date(2026, 6, 2)));
  const [open, setOpen] = useState(false);
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
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 600, color: "#E7ECF3" }} className="flex items-center gap-2"><Calendar size={22} color="#3B82F6" /> Planning</h1>
          <p style={{ fontFamily: "Inter", color: "#B4BCC9", fontSize: 14 }}>Tik een dag aan om de werkplaats-agenda te zien.</p>
        </div>
        <Button icon={Plus} onClick={() => setOpen(true)}>Inplannen</Button>
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
              const isToday = key === DEMO_TODAY;
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
              <button onClick={() => setOpen(true)} style={{ fontFamily: "Inter", fontSize: 12.5, color: "#3B82F6", fontWeight: 600, marginTop: 6 }}>+ Afspraak toevoegen</button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              {/* time rail */}
              {Array.from({ length: dayEnd - dayStart + 1 }).map((_, h) => {
                const top = ((h * 60) / totalMin) * 100;
                return (
                  <div key={h} style={{ position: "relative", height: 0 }}>
                    <div style={{ position: "absolute", top: `calc(${top}% )`, left: 0, right: 0, borderTop: "1px solid #161C25" }} />
                  </div>
                );
              })}
              <div style={{ position: "relative", minHeight: 340 }}>
                {dayItems.map((p) => {
                  const start = Math.max(0, toMin(p.tijd));
                  const height = Math.max(6, (Number(p.duur) / totalMin) * 100);
                  const topPct = (start / totalMin) * 100;
                  return (
                    <div key={p.id} style={{ position: "absolute", top: `${topPct}%`, left: 44, right: 0, minHeight: 44, height: `${height}%` }}>
                      <span style={{ position: "absolute", left: -44, top: 0, fontFamily: "JetBrains Mono", fontSize: 11, color: "#3B82F6", fontWeight: 700 }}>{p.tijd}</span>
                      <div className="rounded-lg h-full" style={{ background: "#3B82F618", borderLeft: "3px solid #3B82F6", padding: "6px 10px", overflow: "hidden" }}>
                        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                          <Kenteken value={p.vehicle} />
                          {p.reportId && <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: "#3B82F6", border: "1px solid #3B82F655", flexShrink: 0 }}>melding</span>}
                        </div>
                        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#E7ECF3", fontWeight: 500, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.taak}</div>
                        <div style={{ fontFamily: "Inter", fontSize: 11, color: "#B4BCC9" }}>{p.duur} min · {p.monteur}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   SIDEBAR (grouped, matches Blex Fleet menu structure)
--------------------------------------------------------------------- */

function SidebarContent({ view, setView, openCount, company, currentUser, role, isSuperAdmin, onCompanyClick, onLogout, onClose }) {
  return (
    <div className="flex flex-col h-full py-6 px-4">
      <div className="flex items-center justify-between px-2 mb-6">
        <button onClick={() => { setView("dashboard"); onClose && onClose(); }} className="flex items-center gap-2">
          <div style={{ fontFamily: "Oswald", fontSize: 18, fontWeight: 700, color: "#E7ECF3", letterSpacing: 0.5 }}>TRUCK <span style={{ color: "#3B82F6" }}>&amp;</span> TRAILER</div>
        </button>
        {onClose && <button onClick={onClose}><X size={18} color="#B4BCC9" /></button>}
      </div>

      <nav className="space-y-5 flex-1 overflow-y-auto">
        {NAV_GROUPS.filter((g) => g.roles.includes(role)).map((g) => (
          <div key={g.group}>
            <div className="px-3 mb-1.5" style={{ color: "#98A1B0", fontFamily: "Inter", fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>{g.group}</div>
            <div className="space-y-1">
              {g.items.map((n) => {
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
        ))}
      </nav>

      <div className="pt-4 space-y-3" style={{ borderTop: "1px solid #1A2129" }}>
        <button onClick={isSuperAdmin ? onCompanyClick : undefined} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-full" style={{ border: "1px solid #232B38", background: "#12171F", cursor: isSuperAdmin ? "pointer" : "default" }}>
          <Building2 size={14} color={company.accent} style={{ flexShrink: 0 }} />
          <span style={{ fontFamily: "Inter", fontSize: 13, color: "#E7ECF3", fontWeight: 500, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{company.name}</span>
          {isSuperAdmin && <ChevronDown size={14} color="#B4BCC9" style={{ flexShrink: 0 }} />}
        </button>
        <div className="flex items-center gap-2.5 px-1">
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#3B82F633", border: "1px solid #3B82F655", flexShrink: 0 }} className="flex items-center justify-center">
            <span style={{ color: "#3B82F6", fontFamily: "Inter", fontWeight: 700, fontSize: 12 }}>{currentUser.naam.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
          </div>
          <div>
            <div style={{ fontFamily: "Inter", fontSize: 13.5, color: "#E7ECF3", fontWeight: 600 }}>{currentUser.naam}</div>
            <span className="text-xs px-1.5 rounded" style={{ color: "#3B82F6", background: "#3B82F618" }}>{ROLE_LABEL[role]}</span>
          </div>
        </div>
        <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg" style={{ color: "#B4BCC9" }}>
          <LogOut size={15} /><span style={{ fontFamily: "Inter", fontSize: 13.5 }}>Uitloggen</span>
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   APP SHELL
--------------------------------------------------------------------- */

const NAV_GROUPS = [
  { group: "Chauffeur", roles: ["admin", "garage", "chauffeur"], items: [
    { id: "driver", label: "Melding maken", icon: AlertTriangle, badgeKey: "openCount" },
  ]},
  { group: "Overzicht", roles: ["admin", "garage"], items: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "ai", label: "AI Assistent", icon: Sparkles },
  ]},
  { group: "Werkplaats", roles: ["admin", "garage"], items: [
    { id: "workfloor", label: "Werkvloer", icon: KanbanSquare },
    { id: "planning", label: "Planning", icon: Calendar },
    { id: "maintenance", label: "Onderhoud", icon: Wrench },
    { id: "parts", label: "Voorraad", icon: Package },
  ]},
  { group: "Vloot", roles: ["admin", "garage"], items: [
    { id: "vehicles", label: "Voertuigen", icon: Truck },
    { id: "trailers", label: "Trailers", icon: Container },
    { id: "inspection", label: "360° Inspectie", icon: ScanEye },
  ]},
  { group: "Beheer", roles: ["admin", "garage"], items: [
    { id: "settings", label: "Instellingen", icon: SlidersHorizontal },
  ]},
  { group: "Beheer", roles: ["admin"], items: [
    { id: "users", label: "Gebruikers", icon: Users },
  ]},
];

export default function TruckGarageApp({ session, onLogout }) {
  const isMobile = useIsMobile();
  const live = !!session;
  const liveCompanyId = live ? session.company.id : "blex";

  const [currentUser, setCurrentUser] = useState(live ? { ...session.profile } : null);
  const [companyId, setCompanyId] = useState(liveCompanyId);
  const [view, setViewRaw] = useState("dashboard");
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const setView = (v) => { if (v !== "vehicles") setSelectedVehicleId(null); setViewRaw(v); };
  const [companyPicker, setCompanyPicker] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const initFrom = (key, fallback) => (live ? { [liveCompanyId]: session.state[key] ?? fallback } : fallback);

  const [companies, setCompanies] = useState(
    live ? [{ id: session.company.id, name: session.company.name, slug: session.company.slug, accent: session.company.accent }] : seedCompanies
  );
  const [vehicles, setVehicles] = useState(() => initFrom("vehicles", seedVehicles));
  const [trailers, setTrailers] = useState(() => initFrom("trailers", seedTrailers));
  const [parts, setParts] = useState(() => initFrom("parts", seedParts));
  const [maintenance, setMaintenance] = useState(() => initFrom("maintenance", seedMaintenance));
  const [costs, setCosts] = useState(() => initFrom("costs", seedCosts));
  const [reports, setReports] = useState(() => initFrom("reports", seedReports));
  const [users, setUsers] = useState(() => (live ? { [liveCompanyId]: [session.profile, ...(session.state.users || [])] } : seedUsers));
  const [planning, setPlanning] = useState(() => initFrom("planning", seedPlanning));
  const [availability, setAvailability] = useState(() => (live ? { [liveCompanyId]: session.state.availability || {} } : seedAvailability));
  const [workshopHours, setWorkshopHours] = useState(() => (live ? { [liveCompanyId]: session.state.workshopHours || { van: "08:00", tot: "17:00" } } : seedWorkshopHours));

  useEffect(() => {
    if (!live) return;
    const dataset = {
      vehicles: vehicles[liveCompanyId] || [],
      trailers: trailers[liveCompanyId] || [],
      parts: parts[liveCompanyId] || [],
      maintenance: maintenance[liveCompanyId] || [],
      costs: costs[liveCompanyId] || [],
      reports: reports[liveCompanyId] || [],
      users: (users[liveCompanyId] || []).filter((u) => u.id !== session.profile.id),
      planning: planning[liveCompanyId] || [],
      availability: availability[liveCompanyId] || {},
      workshopHours: workshopHours[liveCompanyId] || { van: "08:00", tot: "17:00" },
    };
    saveStateDebounced(liveCompanyId, dataset);
  }, [vehicles, trailers, parts, maintenance, costs, reports, users, planning, availability, workshopHours, live, liveCompanyId, session]);

  const setMechanicWeek = (userId, week) => setAvailability((s) => ({ ...s, [companyId]: { ...(s[companyId] || {}), [userId]: week } }));
  const setCompanyHours = (hours) => setWorkshopHours((s) => ({ ...s, [companyId]: hours }));

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

  if (!currentUser) return <LoginScreen allUsers={allUsersFlat} companies={companies} onLogin={handleLogin} onRegister={registerCompany} />;

  const company = companies.find((c) => c.id === companyId) || companies[0] || { id: companyId, name: "Onbekend", slug: "", accent: "#3B82F6" };
  const cVehicles = vehicles[companyId] || [];
  const cTrailers = trailers[companyId] || [];
  const cParts = parts[companyId] || [];
  const cMaintenance = maintenance[companyId] || [];
  const cCosts = costs[companyId] || [];
  const cReports = reports[companyId] || [];
  const cUsers = users[companyId] || [];
  const cPlanning = planning[companyId] || [];
  const cAvailability = availability[companyId] || {};
  const cHours = workshopHours[companyId] || { van: "08:00", tot: "17:00" };
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
  const addPart = (p) => setParts((s) => ({ ...s, [companyId]: [...(s[companyId] || []), p] }));
  const addMaintenance = (m) => setMaintenance((s) => ({ ...s, [companyId]: [...(s[companyId] || []), m] }));
  const addCost = (c) => setCosts((s) => ({ ...s, [companyId]: [...(s[companyId] || []), c] }));
  const deleteCost = (id) => setCosts((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((x) => x.id !== id) }));
  const addReport = (r) => setReports((s) => ({ ...s, [companyId]: [r, ...s[companyId]] }));
  const addUser = (u) => setUsers((s) => ({ ...s, [companyId]: [...(s[companyId] || []), u] }));
  const deleteUser = (id) => setUsers((s) => ({ ...s, [companyId]: (s[companyId] || []).filter((x) => x.id !== id) }));
  const addPlanning = (p) => setPlanning((s) => ({ ...s, [companyId]: [...(s[companyId] || []), p] }));
  const resendInvite = () => {};
  const moveReport = (id, targetStatus) => setReports((s) => ({ ...s, [companyId]: (s[companyId] || []).map((r) => (r.id === id ? { ...r, status: targetStatus } : r)) }));

  return (
    <div style={{ minHeight: "100vh", background: "#0A0E14", fontFamily: "Inter", overflowX: "hidden", width: "100%" }}>
      <style>{`
        ${FONT_IMPORT}
        html { scroll-behavior: smooth; }
        html, body { background: #0A0E14 !important; overscroll-behavior: none; -webkit-font-smoothing: antialiased; }
        @keyframes tg-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes tg-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tg-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tg-pop { 0% { transform: scale(0.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .tg-page { animation: tg-fade-up .35s ease both; }
        .tg-card { animation: tg-fade-up .4s ease both; }
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
        @media (min-width: 768px) { .tg-input { font-size: 13px; } }
        @media (max-width: 767px) {
          h1 { font-size: 22px !important; line-height: 1.15 !important; }
          .tg-input { font-size: 16px; }
        }
      `}</style>

      <div className="flex">
        {/* Desktop persistent sidebar */}
        {!isMobile && (
          <aside style={{ width: 240, borderRight: "1px solid #1A2129", minHeight: "100vh" }} className="shrink-0">
            <SidebarContent view={view} setView={setView} openCount={openCount} company={company} currentUser={currentUser} role={role} isSuperAdmin={isSuperAdmin}
              onCompanyClick={() => setCompanyPicker((s) => !s)} onLogout={live ? onLogout : () => setCurrentUser(null)} />
          </aside>
        )}

        {/* Mobile slide-over sidebar */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40">
            <div className="absolute inset-0" style={{ background: "#000000AA" }} onClick={() => setMobileMenuOpen(false)} />
            <div className="absolute left-0 top-0 h-full" style={{ width: 280, background: "#0A0E14", borderRight: "1px solid #1A2129" }}>
              <SidebarContent view={view} setView={setView} openCount={openCount} company={company} currentUser={currentUser} role={role} isSuperAdmin={isSuperAdmin}
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

        <div className="flex-1" style={{ minWidth: 0 }}>
          <header style={{ borderBottom: "1px solid #1A2129" }} className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              {isMobile && <button onClick={() => setMobileMenuOpen(true)}><Menu size={20} color="#E7ECF3" /></button>}
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
              {!isChauffeurOnly && (
                <div className="relative">
                  <button onClick={() => setNotifOpen((s) => !s)} className="relative flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 8, background: notifOpen ? "#1A2129" : "transparent" }}>
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

          <main style={{ padding: isMobile ? 20 : 32, overflowX: "hidden", width: "100%", maxWidth: "100%", minWidth: 0 }}>
            <div key={view + (selectedVehicleId || "")} className="tg-page">
            {isChauffeurOnly ? (
              <DriverHome vehicles={cVehicles} onSubmit={addReport} currentUser={currentUser} myReports={cReports.filter((r) => r.chauffeur === currentUser.naam)} />
            ) : (
              <>
                {view === "dashboard" && role === "garage" && <GarageDashboard vehicles={cVehicles} reports={cReports} planning={cPlanning} parts={cParts} company={company} currentUser={currentUser} onNavigate={setView} onMove={moveReport} />}
                {view === "dashboard" && role !== "garage" && <DashboardView vehicles={cVehicles} parts={cParts} reports={cReports} planning={cPlanning} company={company} onNavigate={setView} onSelectVehicle={(id) => { setSelectedVehicleId(id); setViewRaw("vehicles"); }} />}
                {view === "driver" && <DriverHome vehicles={cVehicles} onSubmit={addReport} currentUser={currentUser} myReports={cReports.filter((r) => r.chauffeur === currentUser.naam)} />}
                {view === "vehicles" && !selectedVehicleId && <VehiclesView vehicles={cVehicles} onAdd={addVehicle} onSelect={(id) => setSelectedVehicleId(id)} />}
                {view === "vehicles" && selectedVehicleId && (() => {
                  const veh = cVehicles.find((x) => x.id === selectedVehicleId);
                  if (!veh) { setSelectedVehicleId(null); return null; }
                  return <VehicleDetailView vehicle={veh} reports={cReports} planning={cPlanning} costs={cCosts.filter((c) => c.vehicle === veh.kenteken)} onAddCost={addCost} onDeleteCost={deleteCost} onUpdate={updateVehicle} onAddPlanning={addPlanning} onBack={() => setSelectedVehicleId(null)} onGoInspection={() => { setSelectedVehicleId(null); setView("inspection"); }} isAdmin={isAdmin} onDelete={(id) => { deleteVehicle(id); setSelectedVehicleId(null); }} />;
                })()}
                {view === "trailers" && <TrailersView trailers={cTrailers} onAdd={addTrailer} />}
                {view === "parts" && <PartsView parts={cParts} onAdd={addPart} />}
                {view === "maintenance" && <MaintenanceView maintenance={cMaintenance} onAdd={addMaintenance} />}
                {view === "workfloor" && <WorkfloorView reports={cReports} onMove={moveReport} onSchedule={addPlanning} mechanics={mechanics} availability={cAvailability} hours={cHours} />}
                {view === "planning" && <PlanningView vehicles={cVehicles} planning={cPlanning} reports={cReports} onAdd={addPlanning} />}
                {view === "inspection" && <InspectionView vehicles={cVehicles} reports={cReports} />}
                {view === "ai" && <AiAssistantView reports={cReports} vehicles={cVehicles} company={company} onAddVehicle={addVehicle} onAddPlanning={addPlanning} onNavigate={setView} />}
                {view === "users" && isAdmin && <UsersView users={cUsers} onAdd={addUser} onResend={resendInvite} onDelete={deleteUser} currentUserId={currentUser.id} />}
                {view === "settings" && (role === "admin" || role === "garage") && <SettingsView mechanics={mechanics} availability={cAvailability} hours={cHours} onSetMechanicWeek={setMechanicWeek} onSetHours={setCompanyHours} />}
              </>
            )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
