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

export async function signUpCompany({ bedrijfsnaam, naam, email, telefoon, wachtwoord, accent }) {
  // 1. Create the auth user (real email + password)
  const { data: signUp, error: signErr } = await supabase.auth.signUp({
    email,
    password: wachtwoord,
    options: { data: { naam } },
  });
  if (signErr) throw signErr;
  const userId = signUp.user?.id;
  if (!userId) throw new Error("Kon geen account aanmaken.");

  // 2. Create the company (RLS allows an authenticated user to insert a company)
  const slug = slugify(bedrijfsnaam);
  const { data: company, error: compErr } = await supabase
    .from("companies")
    .insert({ name: bedrijfsnaam, slug, accent })
    .select()
    .single();
  if (compErr) throw compErr;

  // 3. Create the admin profile linking the auth user to the company
  const { error: profErr } = await supabase.from("profiles").insert({
    id: userId,
    company_id: company.id,
    naam,
    email,
    telefoon: telefoon || "",
    rol: "admin",
    status: "actief",
  });
  if (profErr) throw profErr;

  // 4. Seed an empty state document for the company
  await supabase.from("company_state").insert({ company_id: company.id, data: emptyDataset() });

  return { userId, company };
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

let saveTimer = null;
export function saveStateDebounced(companyId, dataset) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await supabase.from("company_state").upsert({ company_id: companyId, data: dataset });
  }, 600);
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
    availability: {},
    workshopHours: { van: "08:00", tot: "17:00" },
  };
}
