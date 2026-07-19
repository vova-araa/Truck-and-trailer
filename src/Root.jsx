import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./supabaseClient.js";
import AuthScreen from "./AuthScreen.jsx";
import Landing from "./Landing.jsx";
import { getSessionUser, getProfile, getCompany, loadState, signOut, loadAllCompaniesWithState, loadCompanyStateScoped, driverBootstrap, setOwnPassword } from "./api.js";
import TruckTrailerApp from "./TruckTrailerApp.jsx";

// Uitgelogde bezoekers zien standaard de landingspagina; /inloggen en /activeren
// (of een uitnodigings-/herstel-link) openen meteen het inlogscherm.
const AUTH_PATHS = /^\/(inloggen|activeren|aanmelden)\/?$/i;
function wantsAuthFromUrl() {
  try {
    const s = (window.location.search || "") + (window.location.hash || "");
    if (/type=(invite|recovery)/.test(s) || /[?&]welkom=1/.test(window.location.search || "")) return true;
    return AUTH_PATHS.test(window.location.pathname || "/");
  } catch { return false; }
}

export default function Root() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null); // { user, profile, company, state }
  const [loadErr, setLoadErr] = useState("");
  // Uitnodiging/wachtwoord-reset: de gebruiker landt via een e-maillink en moet
  // eerst zelf een wachtwoord instellen voordat de app opent.
  const [needPassword, setNeedPassword] = useState(false);
  // Uitgelogd: landingspagina of inlogscherm. "activate" opent de "Bedrijf
  // activeren"-tab van het inlogscherm.
  const [authView, setAuthView] = useState(() => (wantsAuthFromUrl() ? "auth" : "landing"));
  const [authMode, setAuthMode] = useState(() => (/^\/(activeren|aanmelden)\/?$/i.test((typeof window !== "undefined" && window.location.pathname) || "") ? "register" : "login"));
  const goAuth = (mode) => { setAuthMode(mode === "register" ? "register" : "login"); setAuthView("auth"); try { window.history.pushState(null, "", mode === "register" ? "/activeren" : "/inloggen"); } catch { /* noop */ } };
  const goLanding = () => { setAuthView("landing"); try { window.history.pushState(null, "", "/"); } catch { /* noop */ } };

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
    // Kwam de gebruiker via een uitnodigings- of herstel-link binnen? Dan eerst
    // een wachtwoord laten kiezen.
    try {
      const h = (window.location.hash || "") + (window.location.search || "");
      if (/type=(invite|recovery)/.test(h) || /[?&]welkom=1/.test(window.location.search || "")) setNeedPassword(true);
    } catch {}
    boot();
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      if (evt === "PASSWORD_RECOVERY") setNeedPassword(true);
      if (!s) setSession(null);
    });
    // Terug/vooruit-knop: houd landing vs. inlogscherm in sync met de URL.
    const onPop = () => setAuthView(wantsAuthFromUrl() ? "auth" : "landing");
    window.addEventListener("popstate", onPop);
    return () => { sub?.subscription?.unsubscribe(); window.removeEventListener("popstate", onPop); };
  }, []);

  if (!supabaseConfigured) return <SetupNotice />;
  if (!ready) return <Splash text="Laden..." />;
  if (needPassword) return <SetPasswordScreen onDone={() => { setNeedPassword(false); try { window.history.replaceState(null, "", window.location.pathname); } catch {} boot(); }} onCancel={async () => { setNeedPassword(false); await signOut(); setSession(null); }} />;
  if (loadErr) return <Splash text={"Fout bij laden: " + loadErr} />;
  if (!session) {
    if (authView === "auth") return <AuthScreen onAuthed={boot} onBack={goLanding} initialMode={authMode} />;
    return <Landing onLogin={() => goAuth("login")} onActivate={() => goAuth("register")} />;
  }

  return (
    <TruckTrailerApp
      session={session}
      onLogout={async () => { await signOut(); setSession(null); }}
    />
  );
}

function SetPasswordScreen({ onDone, onCancel }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    setErr("");
    if (pw.length < 6) { setErr("Kies een wachtwoord van minstens 6 tekens."); return; }
    if (pw !== pw2) { setErr("De wachtwoorden zijn niet gelijk."); return; }
    setBusy(true);
    try { await setOwnPassword(pw); onDone(); }
    catch (e) { setErr(e.message || "Kon het wachtwoord niet instellen. Open de link uit de e-mail opnieuw."); setBusy(false); }
  };
  return (
    <div style={splash}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#E7ECF3", marginBottom: 6, textAlign: "center" }}>
          TRUCK <span style={{ color: "#3B82F6" }}>&amp;</span> TRAILER
        </div>
        <div style={{ color: "#B4BCC9", fontFamily: "Inter, sans-serif", fontSize: 13.5, textAlign: "center", marginBottom: 18 }}>
          Welkom! Kies een wachtwoord om je account te activeren en direct in te loggen.
        </div>
        <label style={lbl}>Nieuw wachtwoord</label>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Minstens 6 tekens" style={inp} />
        <label style={lbl}>Herhaal wachtwoord</label>
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Nogmaals" style={inp} />
        {err && <div style={{ color: "#F0453F", fontFamily: "Inter, sans-serif", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
        <button onClick={submit} disabled={busy} style={{ width: "100%", background: "linear-gradient(180deg,#4C8DFF,#3B82F6)", color: "#fff", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, border: "none", borderRadius: 10, padding: "12px 0", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Bezig..." : "Wachtwoord instellen & inloggen"}
        </button>
        <button onClick={onCancel} style={{ width: "100%", background: "transparent", color: "#98A1B0", fontFamily: "Inter, sans-serif", fontSize: 12.5, border: "none", marginTop: 10, cursor: "pointer" }}>Annuleren</button>
      </div>
    </div>
  );
}

const lbl = { display: "block", color: "#98A1B0", fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, marginBottom: 5, marginTop: 10 };
const inp = { width: "100%", background: "#161C25", border: "1px solid #2A3340", borderRadius: 9, padding: "10px 12px", color: "#E7ECF3", fontFamily: "Inter, sans-serif", fontSize: 14, marginBottom: 4, boxSizing: "border-box" };

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
