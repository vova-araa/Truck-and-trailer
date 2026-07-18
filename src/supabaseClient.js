import { createClient } from "@supabase/supabase-js";

// These come from Railway/Vite environment variables (VITE_ prefix = exposed to the browser).
// The anon key is safe to expose IF Row Level Security (RLS) is enabled — see schema.sql.
// We normaliseren de waarden defensief: een per ongeluk meegekomen spatie/nieuwe
// regel of een schuine streep aan het eind van de URL gaf "Invalid path specified
// in request URL". Trimmen + eind-slash(es) weghalen voorkomt dat.
const url = (import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
