import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./supabaseClient.js";
import AuthScreen from "./AuthScreen.jsx";
import { getSessionUser, getProfile, getCompany, loadState, signOut, loadAllCompaniesWithState, loadCompanyStateScoped, driverBootstrap } from "./api.js";
import TruckTrailerApp from "./TruckTrailerApp.jsx";

export default function Root() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null); // { user, profile, company, state }
  const [loadErr, setLoadErr] = useState("");

  const boot = async () => {
    setReady(false);
    setLoadErr("");
    try {
      const user = await getSessionUser();
      if (!user) { setSession(null); setReady(true); return; }
      const profile = await getProfile(user.id);
      const company = await getCompany(profile.company_id);
      // Rol-gescheiden laden: een beheerder/superadmin leest de volledige dataset;
      // de werkplaats krijgt 'm zonder kosten; een chauffeur krijgt alleen
      // voertuigen (om te kiezen) + zijn eigen meldingen — nooit de rest.
      let state;
      if (profile.rol === "chauffeur") {
        const boot = await driverBootstrap();
        state = { vehicles: boot.vehicles || [], reports: boot.reports || [] };
      } else if (profile.rol === "garage") {
        state = await loadCompanyStateScoped();
      } else {
        state = await loadState(profile.company_id);
      }
      // Platformbeheerder: laad álle bedrijven + hun data zodat je alles kunt inzien.
      let allCompanies = null;
      if (profile.is_superadmin) {
        try { allCompanies = await loadAllCompaniesWithState(); } catch (e) { console.warn("Kon niet alle bedrijven laden:", e?.message || e); }
      }
      setSession({ user, profile, company, state, allCompanies });
    } catch (e) {
      setLoadErr(e.message || String(e));
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    if (!supabaseConfigured) { setReady(true); return; }
    boot();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!s) setSession(null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  if (!supabaseConfigured) return <SetupNotice />;
  if (!ready) return <Splash text="Laden..." />;
  if (loadErr) return <Splash text={"Fout bij laden: " + loadErr} />;
  if (!session) return <AuthScreen onAuthed={boot} />;

  return (
    <TruckTrailerApp
      session={session}
      onLogout={async () => { await signOut(); setSession(null); }}
    />
  );
}

function Splash({ text }) {
  return (
    <div style={splash}>
      <div style={{ color: "#B4BCC9", fontFamily: "Inter, sans-serif", fontSize: 14 }}>{text}</div>
    </div>
  );
}

function SetupNotice() {
  return (
    <div style={splash}>
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#E7ECF3", marginBottom: 12 }}>
          TRUCK <span style={{ color: "#3B82F6" }}>&amp;</span> TRAILER
        </div>
        <div style={{ color: "#B4BCC9", fontFamily: "Inter, sans-serif", fontSize: 14, lineHeight: 1.6 }}>
          Supabase is nog niet geconfigureerd. Zet <code style={code}>VITE_SUPABASE_URL</code> en{" "}
          <code style={code}>VITE_SUPABASE_ANON_KEY</code> in je environment variables (Railway → Variables),
          en draai <code style={code}>schema.sql</code> in Supabase. Zie README.md.
        </div>
      </div>
    </div>
  );
}

const splash = { minHeight: "100vh", background: "#0A0E14", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
const code = { background: "#161C25", border: "1px solid #2A3340", borderRadius: 5, padding: "1px 6px", color: "#8FB8FF", fontSize: 12.5 };
