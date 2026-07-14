import { createClient } from "@supabase/supabase-js";

// These come from Railway/Vite environment variables (VITE_ prefix = exposed to the browser).
// The anon key is safe to expose IF Row Level Security (RLS) is enabled — see schema.sql.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
