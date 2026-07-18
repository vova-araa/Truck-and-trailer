import React, { useState } from "react";
import { Building2, ShieldCheck, LogIn, KeyRound, AlertTriangle, Wrench } from "lucide-react";
import { signIn, signUpCompany, signUpWithCode, requestPasswordReset, activationCodeInfo } from "./api.js";

const ACCENT_PALETTE = ["#3B82F6", "#22D3B0", "#F59E0B", "#A855F7", "#EC4899", "#14B8A6"];
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  const [login, setLogin] = useState({ email: "", wachtwoord: "" });
  const [reg, setReg] = useState({ code: "", bedrijfsnaam: "", naam: "", email: "", telefoon: "", wachtwoord: "", wachtwoord2: "" });
  const [join, setJoin] = useState({ code: "", naam: "", email: "", telefoon: "", wachtwoord: "", wachtwoord2: "", rol: "chauffeur" });
  // Gegevens die al aan de code hangen (ingevuld bij het afsluiten van het
  // abonnement). Zodra ze bekend zijn, hoeven bedrijf/naam/e-mail niet opnieuw.
  const [codeInfo, setCodeInfo] = useState(null); // null = nog niet opgehaald / geen data
  const [codeChecking, setCodeChecking] = useState(false);

  // Zoek de bij de code horende gegevens op zodra er 12 cijfers staan.
  const onRegCode = async (raw) => {
    const clean = raw.replace(/[^0-9]/g, "").slice(0, 12);
    setReg((r) => ({ ...r, code: clean }));
    setCodeInfo(null);
    if (clean.length !== 12) return;
    setCodeChecking(true);
    try {
      const info = await activationCodeInfo(clean);
      if (info && (info.company_name || info.admin_email || info.admin_naam)) {
        setCodeInfo(info);
        setReg((r) => ({
          ...r,
          bedrijfsnaam: info.company_name || r.bedrijfsnaam,
          naam: info.admin_naam || r.naam,
          email: info.admin_email || r.email,
          telefoon: info.admin_telefoon || r.telefoon,
        }));
      }
    } catch {
      /* stil: geldigheid wordt bij activeren alsnog gecontroleerd */
    } finally {
      setCodeChecking(false);
    }
  };

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
    if ((reg.code || "").replace(/\D/g, "").length !== 12) return setErr("Vul de 12-cijferige abonnementscode in die je hebt ontvangen.");
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

  const doJoin = async () => {
    setErr("");
    if (!join.code.trim()) return setErr("Vul de bedrijfscode in die je van je werkgever kreeg.");
    if (!join.naam.trim()) return setErr("Vul je naam in.");
    if (!validEmail(join.email)) return setErr("Vul een geldig e-mailadres in.");
    if (join.wachtwoord.length < 6) return setErr("Kies een wachtwoord van minstens 6 tekens.");
    if (join.wachtwoord !== join.wachtwoord2) return setErr("Wachtwoorden komen niet overeen.");
    setBusy(true);
    try {
      await signUpWithCode({
        naam: join.naam.trim(), email: join.email, telefoon: join.telefoon,
        wachtwoord: join.wachtwoord, code: join.code, rol: join.rol,
      });
      onAuthed();
    } catch (e) {
      setErr(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  const joinRoles = [
    { id: "chauffeur", label: "Chauffeur", desc: "Meldingen maken", icon: AlertTriangle },
    { id: "garage", label: "Werkplaats", desc: "Werkvloer & planning", icon: Wrench },
  ];

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
          <button style={tab(mode === "register")} onClick={() => { setMode("register"); setErr(""); setNotice(""); }}>Bedrijf activeren</button>
        </div>

        {mode === "join" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={sectionLabel}>Bedrijfscode</div>
            <input style={{ ...input, letterSpacing: 3, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }} placeholder="Bv. 7K2Q90" value={join.code}
              onChange={(e) => setJoin({ ...join, code: e.target.value.toUpperCase() })} />
            <div style={{ ...sectionLabel, marginTop: 6 }}>Ik ben</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {joinRoles.map((r) => {
                const active = join.rol === r.id;
                return (
                  <button key={r.id} type="button" onClick={() => setJoin({ ...join, rol: r.id })}
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                      border: `1px solid ${active ? "#3B82F6" : "#2A3340"}`, background: active ? "#3B82F618" : "#161C25", textAlign: "left" }}>
                    <r.icon size={16} color={active ? "#3B82F6" : "#98A1B0"} />
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, color: active ? "#3B82F6" : "#E7ECF3" }}>{r.label}</span>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#98A1B0" }}>{r.desc}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ ...sectionLabel, marginTop: 6 }}>Jouw account</div>
            <input style={input} placeholder="Jouw naam" value={join.naam} onChange={(e) => setJoin({ ...join, naam: e.target.value })} />
            <input style={input} placeholder="E-mailadres" value={join.email} onChange={(e) => setJoin({ ...join, email: e.target.value })} />
            <input style={input} placeholder="Telefoon (optioneel)" value={join.telefoon} onChange={(e) => setJoin({ ...join, telefoon: e.target.value })} />
            <input style={input} type="password" placeholder="Wachtwoord (min. 6 tekens)" value={join.wachtwoord} onChange={(e) => setJoin({ ...join, wachtwoord: e.target.value })} />
            <input style={input} type="password" placeholder="Herhaal wachtwoord" value={join.wachtwoord2}
              onChange={(e) => setJoin({ ...join, wachtwoord2: e.target.value })} onKeyDown={(e) => e.key === "Enter" && doJoin()} />
            {err && <div style={errStyle}>{err}</div>}
            <button style={primaryBtn} disabled={busy} onClick={doJoin}><KeyRound size={16} /> {busy ? "Bezig..." : "Meedoen"}</button>
            <button style={linkBtn} disabled={busy} onClick={() => { setMode("login"); setErr(""); }}>← Terug naar inloggen</button>
          </div>
        ) : mode === "login" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <input style={input} placeholder="E-mailadres" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
            <input style={input} type="password" placeholder="Wachtwoord" value={login.wachtwoord}
              onChange={(e) => setLogin({ ...login, wachtwoord: e.target.value })} onKeyDown={(e) => e.key === "Enter" && doLogin()} />
            {err && <div style={errStyle}>{err}</div>}
            {notice && <div style={noticeStyle}>{notice}</div>}
            <button style={primaryBtn} disabled={busy} onClick={doLogin}><LogIn size={16} /> {busy ? "Bezig..." : "Inloggen"}</button>
            <button style={linkBtn} disabled={busy} onClick={doReset}>Wachtwoord vergeten?</button>
            <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid #1A2129", textAlign: "center" }}>
              <button style={linkBtn} disabled={busy} onClick={() => { setMode("join"); setErr(""); setNotice(""); }}>
                <KeyRound size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />
                Uitgenodigd met een bedrijfscode? Meedoen →
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={sectionLabel}>Abonnementscode</div>
            <input style={{ ...input, letterSpacing: 2, fontFamily: "'JetBrains Mono', monospace" }} inputMode="numeric" maxLength={14} placeholder="12-cijferige code" value={reg.code}
              onChange={(e) => onRegCode(e.target.value)} />
            <div style={{ color: "#98A1B0", fontSize: 11, fontFamily: "Inter, sans-serif", marginTop: -4 }}>
              {codeChecking ? "Code controleren…" : "Deze krijg je bij je abonnement. Zonder geldige code kun je geen bedrijf activeren."}
            </div>

            {codeInfo ? (
              // Gegevens hangen al aan de code (ingevuld bij het abonnement) —
              // niet nog eens vragen. Alleen een wachtwoord kiezen is nog nodig.
              <>
                <div style={summaryBox}>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#E7ECF3", fontWeight: 600, marginBottom: 6 }}>
                    <ShieldCheck size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5, color: "#34D399" }} />
                    Gegevens gevonden bij je abonnement
                  </div>
                  {reg.bedrijfsnaam && <div style={summaryRow}><span style={summaryKey}>Bedrijf</span><span style={summaryVal}>{reg.bedrijfsnaam}</span></div>}
                  {reg.naam && <div style={summaryRow}><span style={summaryKey}>Beheerder</span><span style={summaryVal}>{reg.naam}</span></div>}
                  {reg.email && <div style={summaryRow}><span style={summaryKey}>E-mail</span><span style={summaryVal}>{reg.email}</span></div>}
                </div>
                <div style={{ ...sectionLabel, marginTop: 2 }}>Kies een wachtwoord</div>
                <input style={input} type="password" placeholder="Wachtwoord (min. 6 tekens)" value={reg.wachtwoord} onChange={(e) => setReg({ ...reg, wachtwoord: e.target.value })} />
                <input style={input} type="password" placeholder="Herhaal wachtwoord" value={reg.wachtwoord2}
                  onChange={(e) => setReg({ ...reg, wachtwoord2: e.target.value })} onKeyDown={(e) => e.key === "Enter" && doRegister()} />
              </>
            ) : (
              // Terugval: code zonder vooraf-ingevulde gegevens (bv. oudere code).
              <>
                <div style={{ ...sectionLabel, marginTop: 6 }}>Bedrijf</div>
                <input style={input} placeholder="Bedrijfsnaam" value={reg.bedrijfsnaam} onChange={(e) => setReg({ ...reg, bedrijfsnaam: e.target.value })} />
                <div style={{ ...sectionLabel, marginTop: 6 }}>Jouw beheerdersaccount</div>
                <input style={input} placeholder="Jouw naam" value={reg.naam} onChange={(e) => setReg({ ...reg, naam: e.target.value })} />
                <input style={input} placeholder="E-mailadres" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} />
                <input style={input} placeholder="Telefoon (optioneel)" value={reg.telefoon} onChange={(e) => setReg({ ...reg, telefoon: e.target.value })} />
                <input style={input} type="password" placeholder="Wachtwoord (min. 6 tekens)" value={reg.wachtwoord} onChange={(e) => setReg({ ...reg, wachtwoord: e.target.value })} />
                <input style={input} type="password" placeholder="Herhaal wachtwoord" value={reg.wachtwoord2}
                  onChange={(e) => setReg({ ...reg, wachtwoord2: e.target.value })} onKeyDown={(e) => e.key === "Enter" && doRegister()} />
              </>
            )}
            {err && <div style={errStyle}>{err}</div>}
            <button style={primaryBtn} disabled={busy} onClick={doRegister}><Building2 size={16} /> {busy ? "Activeren..." : "Bedrijf activeren & starten"}</button>
            <div style={{ color: "#98A1B0", fontSize: 11, fontFamily: "Inter, sans-serif", textAlign: "center" }}>
              Je wordt direct ingelogd als beheerder. Daarna nodig je je medewerkers uit met de bedrijfscode (menu Gebruikers).
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function mapError(e) {
  const m = (e && e.message) || String(e);
  if (/INVALID_CODE_FORMAT/i.test(m)) return "De abonnementscode bestaat uit 12 cijfers.";
  if (/INVALID_CODE/i.test(m)) return "Deze code is ongeldig of al gebruikt. Controleer je abonnementscode (of, als medewerker, je bedrijfscode).";
  if (/EMAIL_CONFIRM_REQUIRED/i.test(m)) return "Je account is aangemaakt — bevestig eerst je e-mail (check je inbox) en log daarna in.";
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
const summaryBox = { background: "#0F141C", border: "1px solid #22303F", borderRadius: 10, padding: "11px 12px", display: "grid", gap: 4 };
const summaryRow = { display: "flex", justifyContent: "space-between", gap: 10, fontFamily: "Inter, sans-serif", fontSize: 12.5 };
const summaryKey = { color: "#98A1B0" };
const summaryVal = { color: "#E7ECF3", fontWeight: 600, textAlign: "right", wordBreak: "break-word" };
