import React, { useState } from "react";
import { Building2, ShieldCheck, LogIn } from "lucide-react";
import { signIn, signUpCompany, slugify, requestPasswordReset } from "./api.js";

const ACCENT_PALETTE = ["#3B82F6", "#22D3B0", "#F59E0B", "#A855F7", "#EC4899", "#14B8A6"];
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  const [login, setLogin] = useState({ email: "", wachtwoord: "" });
  const [reg, setReg] = useState({ bedrijfsnaam: "", naam: "", email: "", telefoon: "", wachtwoord: "", wachtwoord2: "" });

  const doReset = async () => {
    setErr(""); setNotice("");
    if (!validEmail(login.email)) return setErr("Vul eerst je e-mailadres in, dan sturen we een resetlink.");
    setBusy(true);
    try {
      await requestPasswordReset(login.email);
      setNotice("Als dit e-mailadres bestaat, is er een link gestuurd om je wachtwoord opnieuw in te stellen.");
    } catch (e) {
      setErr(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  const doLogin = async () => {
    setErr("");
    if (!validEmail(login.email)) return setErr("Vul een geldig e-mailadres in.");
    if (!login.wachtwoord) return setErr("Vul je wachtwoord in.");
    setBusy(true);
    try {
      await signIn(login);
      onAuthed();
    } catch (e) {
      setErr(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async () => {
    setErr("");
    if (!reg.bedrijfsnaam.trim()) return setErr("Vul een bedrijfsnaam in.");
    if (!reg.naam.trim()) return setErr("Vul je naam in.");
    if (!validEmail(reg.email)) return setErr("Vul een geldig e-mailadres in.");
    if (reg.wachtwoord.length < 6) return setErr("Kies een wachtwoord van minstens 6 tekens.");
    if (reg.wachtwoord !== reg.wachtwoord2) return setErr("Wachtwoorden komen niet overeen.");
    setBusy(true);
    try {
      const accent = ACCENT_PALETTE[Math.floor(Math.random() * ACCENT_PALETTE.length)];
      await signUpCompany({ ...reg, accent });
      onAuthed();
    } catch (e) {
      setErr(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 26, fontWeight: 700, color: "#E7ECF3", letterSpacing: 0.5 }}>
            TRUCK <span style={{ color: "#3B82F6" }}>&amp;</span> TRAILER
          </span>
        </div>

        <div style={toggleRow}>
          <button style={tab(mode === "login")} onClick={() => { setMode("login"); setErr(""); setNotice(""); }}>Inloggen</button>
          <button style={tab(mode === "register")} onClick={() => { setMode("register"); setErr(""); setNotice(""); }}>Bedrijf aanmelden</button>
        </div>

        {mode === "login" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <input style={input} placeholder="E-mailadres" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
            <input style={input} type="password" placeholder="Wachtwoord" value={login.wachtwoord}
              onChange={(e) => setLogin({ ...login, wachtwoord: e.target.value })} onKeyDown={(e) => e.key === "Enter" && doLogin()} />
            {err && <div style={errStyle}>{err}</div>}
            {notice && <div style={noticeStyle}>{notice}</div>}
            <button style={primaryBtn} disabled={busy} onClick={doLogin}><LogIn size={16} /> {busy ? "Bezig..." : "Inloggen"}</button>
            <button style={linkBtn} disabled={busy} onClick={doReset}>Wachtwoord vergeten?</button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={sectionLabel}>Bedrijf</div>
            <input style={input} placeholder="Bedrijfsnaam" value={reg.bedrijfsnaam} onChange={(e) => setReg({ ...reg, bedrijfsnaam: e.target.value })} />
            <div style={{ ...sectionLabel, marginTop: 6 }}>Jouw beheerdersaccount</div>
            <input style={input} placeholder="Jouw naam" value={reg.naam} onChange={(e) => setReg({ ...reg, naam: e.target.value })} />
            <input style={input} placeholder="E-mailadres" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} />
            <input style={input} placeholder="Telefoon (optioneel)" value={reg.telefoon} onChange={(e) => setReg({ ...reg, telefoon: e.target.value })} />
            <input style={input} type="password" placeholder="Wachtwoord (min. 6 tekens)" value={reg.wachtwoord} onChange={(e) => setReg({ ...reg, wachtwoord: e.target.value })} />
            <input style={input} type="password" placeholder="Herhaal wachtwoord" value={reg.wachtwoord2}
              onChange={(e) => setReg({ ...reg, wachtwoord2: e.target.value })} onKeyDown={(e) => e.key === "Enter" && doRegister()} />
            {err && <div style={errStyle}>{err}</div>}
            <button style={primaryBtn} disabled={busy} onClick={doRegister}><Building2 size={16} /> {busy ? "Aanmaken..." : "Bedrijf aanmelden & starten"}</button>
            <div style={{ color: "#98A1B0", fontSize: 11, fontFamily: "Inter, sans-serif", textAlign: "center" }}>
              Je krijgt een eigen, lege omgeving en wordt direct ingelogd als beheerder.
            </div>
          </div>
        )}

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #1A2129", textAlign: "center" }}>
          <a href="/demo.html" style={{ color: "#8FB8FF", fontFamily: "Inter, sans-serif", fontSize: 12.5, textDecoration: "none" }}>
            Liever eerst rondkijken? Bekijk de demo →
          </a>
        </div>
      </div>
    </div>
  );
}

function mapError(e) {
  const m = (e && e.message) || String(e);
  if (/already registered|already exists|duplicate/i.test(m)) return "Dit e-mailadres of bedrijf bestaat al.";
  if (/invalid login credentials/i.test(m)) return "Onjuist e-mailadres of wachtwoord.";
  if (/email not confirmed/i.test(m)) return "Bevestig eerst je e-mail (check je inbox), of schakel e-mailbevestiging uit in Supabase.";
  return m;
}

const wrap = { minHeight: "100vh", background: "#0A0E14", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Inter, sans-serif" };
const toggleRow = { display: "flex", border: "1px solid #232B38", borderRadius: 12, overflow: "hidden", margin: "16px 0 20px" };
const tab = (active) => ({ flex: 1, padding: "10px 0", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", border: "none", background: active ? "#1A2129" : "transparent", color: active ? "#3B82F6" : "#98A1B0" });
const input = { background: "#161C25", border: "1px solid #2A3340", color: "#E7ECF3", borderRadius: 9, padding: "11px 12px", fontFamily: "Inter, sans-serif", fontSize: 15, outline: "none", width: "100%", boxSizing: "border-box" };
const primaryBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(180deg,#4C8DFF,#3B82F6)", color: "#fff", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" };
const sectionLabel = { fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, color: "#98A1B0", textTransform: "uppercase", letterSpacing: 0.5 };
const errStyle = { color: "#F0453F", fontFamily: "Inter, sans-serif", fontSize: 12.5 };
const noticeStyle = { color: "#34D399", fontFamily: "Inter, sans-serif", fontSize: 12.5 };
const linkBtn = { background: "transparent", border: "none", color: "#8FB8FF", fontFamily: "Inter, sans-serif", fontSize: 12.5, cursor: "pointer", padding: 2 };
