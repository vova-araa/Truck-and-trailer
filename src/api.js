import { supabase } from "./supabaseClient.js";

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
export async function createActivationCode({ companyName, adminNaam, adminEmail, adminTelefoon, note, paid } = {}) {
  const { data, error } = await supabase.rpc("create_activation_code", {
    p_company_name: companyName || "",
    p_admin_naam: adminNaam || "",
    p_admin_email: adminEmail || "",
    p_admin_telefoon: adminTelefoon || "",
    p_note: note || "",
    p_paid: paid !== false,
  });
  if (error) throw error;
  return data; // de code (string)
}

// Superadmin: alle uitgegeven abonnementscodes ophalen.
export async function listActivationCodes() {
  const { data, error } = await supabase.rpc("list_activation_codes");
  if (error) throw error;
  return data || [];
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
// De rol wordt server-side afgedwongen op 'chauffeur' of 'garage'.
export async function signUpWithCode({ naam, email, telefoon, wachtwoord, code, rol }) {
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
    p_rol: rol === "garage" ? "garage" : "chauffeur",
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

// Debounce-timer PER bedrijf, zodat een save voor bedrijf A niet wordt gewist
// als (de superadmin) net bedrijf B bewerkt.
const saveTimers = {};
// Slaat de dataset op met een status-callback zodat de UI kan tonen of het echt
// bewaard is: onStatus("pending" | "saving" | "saved" | "error").
export function saveStateDebounced(companyId, dataset, onStatus) {
  clearTimeout(saveTimers[companyId]);
  onStatus?.("pending");
  saveTimers[companyId] = setTimeout(async () => {
    onStatus?.("saving");
    try {
      const { error } = await supabase
        .from("company_state")
        .upsert({ company_id: companyId, data: dataset, updated_at: new Date().toISOString() });
      onStatus?.(error ? "error" : "saved");
      if (error) console.error("Opslaan mislukt:", error.message);
    } catch (e) {
      onStatus?.("error");
      console.error("Opslaan mislukt:", e?.message || e);
    }
  }, 600);
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
