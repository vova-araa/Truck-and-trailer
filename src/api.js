import { supabase } from "./supabaseClient.js";
import { enqueueReport, isNetworkError } from "./offlineQueue.js";

/*
  DATA MODEL (see schema.sql)
  ---------------------------
  companies         : id (uuid), name, slug, accent, created_at
  profiles          : id (uuid = auth user id), company_id, naam, email, telefoon, rol, status
  company_state     : company_id (uuid, PK), data (jsonb)   <-- the whole app dataset per company

  We persist the existing in-memory app dataset as ONE jsonb document per company.
  This keeps the huge existing UI working while giving real persistence + isolation,
  instead of rewriting every feature into separate tables. You can normalise later.
*/

// ---------- AUTH ----------

// Controleer vooraf of een 12-cijferige abonnementscode geldig en ongebruikt is.
export async function activationCodeValid(code) {
  const clean = (code || "").replace(/\D/g, "");
  if (clean.length !== 12) return false;
  const { data, error } = await supabase.rpc("activation_code_valid", { p_code: clean });
  if (error) throw error;
  return !!data;
}

// Haal de vooraf-ingevulde gegevens bij een code op (bedrijfsnaam, naam, e-mail,
// telefoon) zodat "Bedrijf activeren" die alvast toont. Geeft null bij een
// ongeldige/gebruikte code.
export async function activationCodeInfo(code) {
  const clean = (code || "").replace(/\D/g, "");
  if (clean.length !== 12) return null;
  const { data, error } = await supabase.rpc("activation_code_info", { p_code: clean });
  if (error) throw error;
  return (data && data[0]) || null;
}

// Superadmin: maak een nieuwe abonnementscode aan. Codes die jij zelf aanmaakt
// zijn gratis (paid = false). Geeft de 12-cijferige code terug.
export async function createActivationCode({ companyName, adminNaam, adminEmail, adminTelefoon, note, paid, periodMonths } = {}) {
  const { data, error } = await supabase.rpc("create_activation_code", {
    p_company_name: companyName || "",
    p_admin_naam: adminNaam || "",
    p_admin_email: adminEmail || "",
    p_admin_telefoon: adminTelefoon || "",
    p_note: note || "",
    p_paid: paid !== false,
    p_period_months: Math.max(1, Number(periodMonths) || 1),
  });
  if (error) throw error;
  return data; // de code (string)
}

// Platformbeheerder mailt een nieuw bedrijf de activatiecode.
export async function sendActivationEmail({ email, code, companyName, adminNaam }) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Niet ingelogd — log opnieuw in.");
  const res = await fetch("/api/admin/send-activation-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, code, companyName, adminNaam }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Kon de code niet mailen.");
  return data;
}

// Beheerder zegt het abonnement op (blijft werken tot de verlengdatum) of
// heractiveert het weer.
export async function cancelSubscription() {
  const { data, error } = await supabase.rpc("cancel_subscription");
  if (error) throw error;
  return data; // cancel_at (timestamptz)
}
export async function reactivateSubscription() {
  const { error } = await supabase.rpc("reactivate_subscription");
  if (error) throw error;
}

// Superadmin: alle uitgegeven abonnementscodes ophalen.
export async function listActivationCodes() {
  const { data, error } = await supabase.rpc("list_activation_codes");
  if (error) throw error;
  return data || [];
}

// ---------- SUPERADMIN-BEHEER ----------

// Alle profielen (voor het bedrijven/gebruikers-overzicht).
export async function adminListProfiles() {
  const { data, error } = await supabase.rpc("admin_list_profiles");
  if (error) throw error;
  return data || [];
}
export async function adminDeleteUser(id) {
  const { error } = await supabase.rpc("admin_delete_user", { p_id: id });
  if (error) throw error;
}
export async function adminDeleteCompany(id) {
  const { error } = await supabase.rpc("admin_delete_company", { p_id: id });
  if (error) throw error;
}
export async function setUserSuperadmin(id, value) {
  const { error } = await supabase.rpc("set_user_superadmin", { p_id: id, p_value: value });
  if (error) throw error;
}

// ---------- PROBLEEMMELDINGEN (support) ----------

// Een bedrijf meldt een probleem/vraag bij de platformbeheerder.
export async function createSupportTicket({ onderwerp, bericht }) {
  const { data, error } = await supabase.rpc("create_support_ticket", {
    p_onderwerp: onderwerp || "",
    p_bericht: bericht || "",
  });
  if (error) throw error;
  return data; // id
}

// Het bedrijf haalt zijn eigen meldingen op (met status).
export async function mySupportTickets() {
  const { data, error } = await supabase.rpc("my_support_tickets");
  if (error) throw error;
  return data || [];
}

// Superadmin: alle binnengekomen meldingen ophalen.
export async function listSupportTickets() {
  const { data, error } = await supabase.rpc("list_support_tickets");
  if (error) throw error;
  return data || [];
}

// Superadmin: status van een melding aanpassen.
export async function setSupportTicketStatus(id, status) {
  const { error } = await supabase.rpc("set_support_ticket_status", { p_id: id, p_status: status });
  if (error) throw error;
}

// Bedrijf aanmelden kan alleen met een geldige abonnementscode. De code wordt
// server-side (SECURITY DEFINER) ingewisseld: die maakt het bedrijf aan en
// markeert de code als gebruikt. Zo kan niemand zonder code een bedrijf starten.
export async function signUpCompany({ code, bedrijfsnaam, naam, email, telefoon, wachtwoord, accent }) {
  const clean = (code || "").replace(/\D/g, "");
  if (clean.length !== 12) throw new Error("INVALID_CODE_FORMAT");

  // 0. Vooraf controleren (voorkomt een leeg account bij een foute code)
  const ok = await activationCodeValid(clean);
  if (!ok) throw new Error("INVALID_CODE");

  // 1. Auth-account aanmaken (echt e-mail + wachtwoord)
  const { data: signUp, error: signErr } = await supabase.auth.signUp({
    email,
    password: wachtwoord,
    options: { data: { naam } },
  });
  if (signErr) throw signErr;
  const userId = signUp.user?.id;
  if (!userId) throw new Error("Kon geen account aanmaken.");
  if (!signUp.session) throw new Error("EMAIL_CONFIRM_REQUIRED");

  // 2. Code inwisselen -> bedrijf + admin-profiel + lege state in één transactie.
  //    Mislukt dit, dan is de code NIET verbruikt (alles rolt terug).
  const slug = slugify(bedrijfsnaam);
  const { data: companyId, error: redErr } = await supabase.rpc("redeem_company_code", {
    p_code: clean, p_name: bedrijfsnaam, p_slug: slug, p_accent: accent,
    p_naam: naam, p_email: email, p_telefoon: telefoon || "",
  });
  if (redErr) throw new Error(/INVALID_CODE/.test(redErr.message) ? "INVALID_CODE" : redErr.message);

  return { userId, company: { id: companyId, name: bedrijfsnaam } };
}

// Kijk een bedrijf op via join-code (voor de "Meedoen"-flow: laat de naam zien
// vóór iemand een account maakt). Geeft null als de code niet klopt.
export async function previewCompanyByCode(code) {
  const { data, error } = await supabase.rpc("company_by_join_code", { code: (code || "").trim() });
  if (error) throw error;
  return (data && data[0]) || null;
}

// Medewerker maakt een echt account en koppelt zich via de code aan het bedrijf.
// De rol wordt server-side ALTIJD 'chauffeur' (werkplaats-accounts maakt de
// beheerder aan); de meegegeven rol wordt genegeerd.
export async function signUpWithCode({ naam, email, telefoon, wachtwoord, code }) {
  const preview = await previewCompanyByCode(code);
  if (!preview) throw new Error("INVALID_CODE");

  const { data: signUp, error: signErr } = await supabase.auth.signUp({
    email,
    password: wachtwoord,
    options: { data: { naam } },
  });
  if (signErr) throw signErr;
  if (!signUp.user?.id) throw new Error("Kon geen account aanmaken.");

  // Zonder actieve sessie (e-mailbevestiging aan) kan de koppeling niet — meld dat netjes.
  if (!signUp.session) throw new Error("EMAIL_CONFIRM_REQUIRED");

  const { error: joinErr } = await supabase.rpc("join_company_with_code", {
    code: (code || "").trim(),
    p_naam: naam,
    p_email: email,
    p_telefoon: telefoon || "",
    p_rol: "chauffeur", // server dwingt dit sowieso af; werkplaats maakt de beheerder aan
  });
  if (joinErr) throw joinErr;
  return preview;
}

// Beheerder maakt een echt inlogaccount voor een medewerker (via de veilige
// server-endpoint met service_role). Geeft de aangemaakte gebruiker terug.
export async function createEmployeeAccount({ naam, email, wachtwoord, rol, telefoon }) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Niet ingelogd — log opnieuw in.");
  const res = await fetch("/api/admin/create-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ naam, email, wachtwoord, rol, telefoon }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Kon het account niet aanmaken.");
  return data;
}

// Beheerder nodigt een medewerker uit per e-mail: het account wordt aangemaakt
// en Supabase mailt een link waarmee de medewerker zelf een wachtwoord instelt.
export async function inviteEmployeeByEmail({ naam, email, rol, telefoon }) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Niet ingelogd — log opnieuw in.");
  const res = await fetch("/api/admin/invite-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ naam, email, rol, telefoon }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Kon de uitnodiging niet versturen.");
  return data;
}

// Beheerder verwijdert een medewerker écht (trekt de login in) via de server.
export async function deleteEmployeeAccount(id) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Niet ingelogd — log opnieuw in.");
  const res = await fetch("/api/admin/delete-employee", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Kon de medewerker niet verwijderen.");
  return data;
}

// Stelt een nieuw wachtwoord in voor de ingelogde (via invite/recovery) gebruiker.
export async function setOwnPassword(nieuwWachtwoord) {
  const { error } = await supabase.auth.updateUser({ password: nieuwWachtwoord });
  if (error) throw error;
}

export async function signIn({ email, wachtwoord }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function requestPasswordReset(email) {
  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error) throw error;
}

export async function getSessionUser() {
  const { data } = await supabase.auth.getUser();
  return data.user || null;
}

// Authorization-header met het huidige sessietoken (voor beveiligde endpoints
// zoals /api/ai). Geeft een leeg object als er geen sessie/Supabase is (demo).
export async function authHeader() {
  try {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// ---------- PROFILE + COMPANY ----------

export async function getProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export async function getCompany(companyId) {
  const { data, error } = await supabase.from("companies").select("*").eq("id", companyId).single();
  if (error) throw error;
  return data;
}

// Super-admin only (RLS enforces this): list every company
export async function listCompanies() {
  const { data, error } = await supabase.from("companies").select("*").order("created_at");
  if (error) throw error;
  return data;
}

// Super-admin only (RLS staat dit alleen toe voor is_superadmin): alle bedrijven
// mét hun opgeslagen dataset, zodat de platformbeheerder alles kan inzien.
export async function loadAllCompaniesWithState() {
  const { data: comps, error } = await supabase.from("companies").select("*").order("created_at");
  if (error) throw error;
  const { data: states } = await supabase.from("company_state").select("company_id, data");
  const stateMap = {};
  (states || []).forEach((s) => { stateMap[s.company_id] = s.data || {}; });
  return (comps || []).map((c) => ({ company: c, state: stateMap[c.id] || emptyDataset() }));
}

// ---------- STATE (per company jsonb) ----------

export async function loadState(companyId) {
  const { data, error } = await supabase
    .from("company_state")
    .select("data")
    .eq("company_id", companyId)
    .single();
  if (error) {
    // no row yet -> seed one
    if (error.code === "PGRST116") {
      await supabase.from("company_state").insert({ company_id: companyId, data: emptyDataset() });
      return emptyDataset();
    }
    throw error;
  }
  return data.data || emptyDataset();
}

// Werkplaats (garage) leest de dataset via een rol-gescheiden functie die de
// kosten weglaat; chauffeurs gebruiken driverBootstrap. Beheerders lezen direct.
export async function loadCompanyStateScoped() {
  const { data, error } = await supabase.rpc("load_company_state");
  if (error) throw error;
  return data || {};
}

// Chauffeur: minimale gegevens (voertuigen om te kiezen + eigen meldingen).
export async function driverBootstrap() {
  const { data, error } = await supabase.rpc("driver_bootstrap");
  if (error) throw error;
  return data || { vehicles: [], reports: [] };
}

// Chauffeur voegt een melding toe (server bepaalt de chauffeur-identiteit).
// Toegangsaanvraag vanaf de landingspagina (openbaar, geen login nodig).
export async function sendContactRequest({ naam, bedrijf, email, telefoon, bericht }) {
  const res = await fetch("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ naam, bedrijf, email, telefoon, bericht }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Kon de aanvraag niet versturen.");
  return data;
}

// Openstaande meldingen voor één wagen (om dubbele meldingen te voorkomen).
export async function driverVehicleOpenReports(kenteken) {
  if (!kenteken) return [];
  try {
    const { data, error } = await supabase.rpc("driver_open_reports_for_vehicle", { p_kenteken: kenteken });
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export async function driverAddReport(report) {
  // De wachtrij-items dragen de gebruikers-id mee, zodat een melding die op een
  // gedeeld apparaat blijft hangen nooit onder een ándere login (of zelfs een
  // ander bedrijf) wordt verstuurd.
  const uid = await currentUserId();
  // Geen verbinding? Direct in de offline-wachtrij; later automatisch verstuurd.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueueReport(report, uid);
    return { queued: true };
  }
  try {
    const { error } = await supabase.rpc("driver_add_report", { p_report: report });
    if (error) throw error;
    return { queued: false };
  } catch (e) {
    // Wat er ook misgaat (netwerk óf server): de melding NIET stil verliezen.
    // We bewaren 'm in de wachtrij; die probeert later opnieuw en geeft na een
    // paar mislukte pogingen op (zie offlineQueue) zodat er geen "poison" ontstaat.
    enqueueReport(report, uid);
    return { queued: true };
  }
}

// Dagelijkse voertuigcheck (DVIR) opslaan. Zelfde patroon als een melding:
// de server dwingt de chauffeur-identiteit af en is idempotent op id.
export async function driverAddCheck(check) {
  const { error } = await supabase.rpc("driver_add_check", { p_check: check });
  if (error) throw error;
}

// Huidige ingelogde gebruikers-id (of null). Faalt stil — ook offline bruikbaar.
async function currentUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch { return null; }
}

// Debounce-timer PER bedrijf, zodat een save voor bedrijf A niet wordt gewist
// als (de superadmin) net bedrijf B bewerkt.
const saveTimers = {};
// Slaat de dataset op met een status-callback zodat de UI kan tonen of het echt
// bewaard is: onStatus("pending" | "saving" | "saved" | "error"). Voor de
// werkplaats (role="garage") loopt het via save_company_state, die de kosten
// server-side samenvoegt zodat de werkplaats de financiële data niet wist.
export function saveStateDebounced(companyId, dataset, onStatus, opts = {}) {
  const { role, isSuperadmin = false, baseReportIds = [], baseCostIds = [] } = opts;
  clearTimeout(saveTimers[companyId]);
  onStatus?.("pending");
  saveTimers[companyId] = setTimeout(async () => {
    onStatus?.("saving");
    try {
      // Wachtwoorden horen nooit in de bedrijfsdataset te belanden (plaintext in
      // de database). Het veld bestaat alleen in de lokale demo-flow; hier
      // strippen we het voor de zekerheid vóór élke opslag.
      let toSave = dataset;
      if (Array.isArray(dataset?.users) && dataset.users.some((u) => u && "wachtwoord" in u)) {
        toSave = { ...dataset, users: dataset.users.map((u) => { if (!u || !("wachtwoord" in u)) return u; const { wachtwoord, ...rest } = u; return rest; }) };
      }
      // Een gewone beheerder én de werkplaats slaan op via save_company_state;
      // de superadmin (die vaak een ÁNDER bedrijf bewerkt) via de gescopeerde
      // variant. Beide voegen meldingen/kosten server-side samen, zodat een
      // save nooit een net binnengekomen chauffeursmelding wegvaagt.
      const { error } = isSuperadmin
        ? await supabase.rpc("save_company_state_scoped", { p_company_id: companyId, p_data: toSave, p_base_report_ids: baseReportIds, p_base_cost_ids: baseCostIds })
        : await supabase.rpc("save_company_state", { p_data: toSave, p_base_report_ids: baseReportIds, p_base_cost_ids: baseCostIds });
      onStatus?.(error ? "error" : "saved");
      if (error) console.error("Opslaan mislukt:", error.message);
    } catch (e) {
      onStatus?.("error");
      console.error("Opslaan mislukt:", e?.message || e);
    }
  }, 600);
}

// ---------- MELDINGSFOTO'S (Supabase Storage, privé-bucket 'meldingen') ----------

// Upload de bijlagen van een melding naar de privé-bucket, in een map per
// bedrijf/melding. Geeft een lijst {path, type} terug die we op de melding
// bewaren (geen publieke URL: we halen bij het tonen een tijdelijke link op).
export async function uploadReportMedia(companyId, reportId, items) {
  if (!supabase || !companyId || !Array.isArray(items)) return [];
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const m = items[i];
    if (!m || !m.file) continue;
    const ext = ((m.file.name || "").split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `${companyId}/${reportId}/${i}-${Math.round(Math.random() * 1e9)}.${ext}`;
    const { error } = await supabase.storage.from("meldingen").upload(path, m.file, { contentType: m.file.type || undefined, upsert: false });
    if (error) throw error;
    out.push({ path, type: m.type === "video" ? "video" : "foto" });
  }
  return out;
}

// ---------- VOERTUIGDOCUMENTEN (privé-bucket 'documenten') ----------

// Upload één document (kentekenbewijs, verzekering, APK, ...) voor een voertuig.
// Geeft de metadata terug die we op het voertuig bewaren (in company_state).
export async function uploadVehicleDocument(companyId, vehicleId, file, meta = {}) {
  if (!supabase || !companyId || !file) throw new Error("Geen bestand of bedrijf");
  const ext = ((file.name || "").split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const path = `${companyId}/${vehicleId}/${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
  const { error } = await supabase.storage.from("documenten").upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return { path, name: file.name || `document.${ext}`, categorie: meta.categorie || "overig", size: file.size || 0, type: file.type || "", uploadedAt: new Date().toISOString() };
}

// Tijdelijke (1 uur) link om een document te openen/downloaden.
export async function signedDocUrl(path) {
  if (!path || !supabase) return null;
  const { data } = await supabase.storage.from("documenten").createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

// Verwijder een document uit de opslag.
export async function deleteVehicleDocument(path) {
  if (!path || !supabase) return;
  const { error } = await supabase.storage.from("documenten").remove([path]);
  if (error) throw error;
}

// Zet opgeslagen paden om naar tijdelijke (1 uur) links om te tonen. Onbekende
// of oudere meldingen (met alleen een count, geen paden) geven een lege lijst.
export async function signedMediaUrls(media) {
  if (!Array.isArray(media) || media.length === 0) return [];
  const out = [];
  for (const m of media) {
    if (!m) continue;
    if (m.url) { out.push({ url: m.url, type: m.type || "foto" }); continue; } // demo/objectURL
    if (m.path && supabase) {
      const { data } = await supabase.storage.from("meldingen").createSignedUrl(m.path, 3600);
      if (data?.signedUrl) out.push({ url: data.signedUrl, type: m.type || "foto" });
    }
  }
  return out;
}

// ---------- RDW KENTEKEN-LOOKUP (gratis open data, geen key nodig) ----------
// Haalt echte voertuiggegevens op bij de RDW: merk/model, type, bouwjaar en
// APK-vervaldatum. Werkt rechtstreeks vanuit de browser (RDW staat CORS toe).
export async function lookupRDW(kenteken) {
  const plate = (kenteken || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!plate) throw new Error("Vul eerst een kenteken in.");
  const url = `https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${encodeURIComponent(plate)}`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("RDW niet bereikbaar. Controleer je internet.");
  }
  if (!res.ok) throw new Error("RDW gaf een fout (" + res.status + ").");
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Kenteken niet gevonden bij de RDW.");
  const r = rows[0];
  const ymd = (s) => (s && s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "");
  const maxMassa = Number(r.toegestane_maximum_massa_voertuig) || Number(r.massa_rijklaar) || 0;
  const merk = [r.merk, r.handelsbenaming].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return {
    merk: merk || r.merk || "",
    // >3500 kg = zwaar bedrijfsvoertuig (truck); daaronder bestelwagen
    type: maxMassa > 3500 ? "Truck" : "Bestelwagen",
    bouwjaar: r.datum_eerste_toelating ? Number(r.datum_eerste_toelating.slice(0, 4)) : null,
    apkTot: ymd(r.vervaldatum_apk),
    massa: maxMassa || null,
    voertuigsoort: r.voertuigsoort || "",
  };
}

// ---------- HELPERS ----------

export function slugify(name) {
  return (
    (name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || "bedrijf"
  );
}

export function emptyDataset() {
  return {
    vehicles: [],
    trailers: [],
    parts: [],
    maintenance: [],
    costs: [],
    reports: [],
    users: [], // extra invited users (chauffeurs/monteurs) live here; the admin lives in `profiles`
    planning: [],
    drivers: [], // chauffeurs met hun certificaten (rijbewijs, Code 95, ADR, medisch)
    modules: null, // welke onderdelen het bedrijf gebruikt (null = alles aan)
    onboarded: false, // heeft de beheerder de eerste keuze gemaakt?
    availability: {},
    workshopHours: { van: "08:00", tot: "17:00" },
  };
}
