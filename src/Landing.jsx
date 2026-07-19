import React, { useState } from "react";
import {
  Truck, AlertTriangle, KanbanSquare, Euro, Sparkles, FileText, ShieldCheck,
  BellRing, Globe, WifiOff, Check, ArrowRight, Mail, Phone, MessageCircle, LogIn, Ticket,
} from "lucide-react";
import { sendContactRequest } from "./api.js";

/*
  Landingspagina (marketing) voor truckandtrailer.nl. Wordt getoond aan
  uitgelogde bezoekers. "Inloggen" opent het bestaande inlogscherm; "Toegang
  aanvragen" scrollt naar het formulier (aanmelden gaat voorlopig op aanvraag).
*/

const ACCENT = "#3B82F6";
const CONTACT_EMAIL = "info@truckandtrailer.nl";
const CONTACT_TEL = "+31 6 12 34 56 78"; // pas aan naar je eigen nummer
const WHATSAPP = "31612345678";           // internationaal formaat, zonder +

const FEATURES = [
  { icon: AlertTriangle, titel: "Meldingen van chauffeurs", tekst: "Chauffeurs melden onderweg een probleem in een paar tikken — met foto, spraak en AI-schadeherkenning. In 11 talen en zelfs offline." },
  { icon: KanbanSquare, titel: "Digitale werkvloer & planning", tekst: "Alle meldingen op één overzichtelijk bord. Plan reparaties in, wijs monteurs toe en zie live wat er speelt." },
  { icon: Euro, titel: "Kosten, werkbonnen & facturen", tekst: "Registreer kosten per voertuig, maak werkbonnen met je eigen logo en BTW, en exporteer alles wanneer je wilt." },
  { icon: Sparkles, titel: "AI die meedenkt", tekst: "Schade herkennen op foto's en voorspellend onderhoud op basis van kilometers, leeftijd en terugkerende meldingen." },
  { icon: FileText, titel: "Documenten per voertuig", tekst: "Kentekenbewijs, verzekering en APK veilig opgeslagen bij elk voertuig — altijd bij de hand." },
  { icon: ShieldCheck, titel: "APK & verzekering bewaakt", tekst: "Automatische herinneringen per e-mail vóórdat een keuring of verzekering verloopt. Nooit meer een boete." },
];

const STAPPEN = [
  { n: "1", titel: "Voeg je vloot toe", tekst: "Zet je vrachtwagens, trailers en bestelwagens in de app — handmatig of razendsnel via kenteken." },
  { n: "2", titel: "Nodig je team uit", tekst: "Chauffeurs en monteurs krijgen hun eigen weergave. Chauffeurs melden, de werkplaats lost op." },
  { n: "3", titel: "Alles onder controle", tekst: "Meldingen, planning, kosten en keuringen op één plek — op kantoor én onderweg op je telefoon." },
];

export default function Landing({ onLogin, onActivate }) {
  const [form, setForm] = useState({ naam: "", bedrijf: "", email: "", telefoon: "", bericht: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");

  const submit = async () => {
    setErr("");
    if (!form.naam.trim()) { setErr("Vul je naam in."); return; }
    if (!validEmail(form.email)) { setErr("Vul een geldig e-mailadres in."); return; }
    setBusy(true);
    try { await sendContactRequest(form); setSent(true); }
    catch (e) { setErr(e.message || "Kon de aanvraag niet versturen. Mail ons gerust rechtstreeks."); }
    finally { setBusy(false); }
  };

  const scrollToForm = () => { try { document.getElementById("aanvraag")?.scrollIntoView({ behavior: "smooth" }); } catch { /* noop */ } };

  return (
    <div style={{ background: "#0A0E14", minHeight: "100vh", color: "#E7ECF3" }}>
      <style>{`
        .ln-wrap { max-width: 1100px; margin: 0 auto; padding: 0 20px; }
        .ln-btn { font-family: Inter, sans-serif; font-weight: 600; font-size: 14px; border-radius: 10px; padding: 12px 20px; cursor: pointer; border: none; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: transform .12s, box-shadow .12s, background .12s; }
        .ln-btn:hover { transform: translateY(-1px); }
        .ln-primary { background: linear-gradient(180deg,#4C8DFF,#3B82F6); color: #fff; box-shadow: 0 6px 20px rgba(59,130,246,.35); }
        .ln-ghost { background: #12171F; color: #E7ECF3; border: 1px solid #232B38; }
        .ln-card { background: #12171F; border: 1px solid #1E2733; border-radius: 16px; padding: 22px; }
        .ln-grid { display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(0,1fr)); }
        .ln-input { width: 100%; background: #0E1520; border: 1px solid #2A3340; border-radius: 10px; padding: 11px 13px; color: #E7ECF3; font-family: Inter, sans-serif; font-size: 14px; box-sizing: border-box; }
        .ln-input:focus { outline: none; border-color: ${ACCENT}; }
        .ln-h1 { font-family: Oswald, sans-serif; font-weight: 700; font-size: 52px; line-height: 1.05; letter-spacing: -0.5px; }
        .ln-eyebrow { font-family: Inter, sans-serif; font-size: 12.5px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #6E9BF0; }
        @media (max-width: 780px) {
          .ln-grid { grid-template-columns: minmax(0,1fr); }
          .ln-h1 { font-size: 36px; }
          .ln-hide-mobile { display: none !important; }
        }
      `}</style>

      {/* Topbar */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(10,14,20,.82)", backdropFilter: "blur(10px)", borderBottom: "1px solid #161C25" }}>
        <div className="ln-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: ACCENT + "22", display: "flex", alignItems: "center", justifyContent: "center" }}><Truck size={17} color={ACCENT} /></div>
            <span style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: .5 }}>TRUCK <span style={{ color: ACCENT }}>&amp;</span> TRAILER</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="ln-btn ln-ghost ln-hide-mobile" onClick={onActivate}><Ticket size={15} /> Bedrijf activeren</button>
            <button className="ln-btn ln-ghost" onClick={onLogin}><LogIn size={15} /> Inloggen</button>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="ln-wrap" style={{ paddingTop: 72, paddingBottom: 56, textAlign: "center" }}>
        <div className="ln-eyebrow" style={{ marginBottom: 14 }}>Voor transportbedrijven</div>
        <h1 className="ln-h1" style={{ maxWidth: 820, margin: "0 auto" }}>Je hele vloot en werkplaats in <span style={{ color: ACCENT }}>één app</span></h1>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17.5, color: "#B4BCC9", maxWidth: 620, margin: "18px auto 0", lineHeight: 1.6 }}>
          Van de melding van een chauffeur onderweg tot de werkbon in de werkplaats — Truck &amp; Trailer houdt je wagenpark rijdend, je planning strak en je kosten inzichtelijk.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 30, flexWrap: "wrap" }}>
          <button className="ln-btn ln-primary" onClick={scrollToForm}>Toegang aanvragen <ArrowRight size={16} /></button>
          <button className="ln-btn ln-ghost" onClick={onLogin}>Inloggen</button>
        </div>
        <div style={{ display: "flex", gap: 20, justifyContent: "center", marginTop: 26, flexWrap: "wrap", fontFamily: "Inter, sans-serif", fontSize: 13, color: "#98A1B0" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Globe size={14} color="#22D3B0" /> 11 talen</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><WifiOff size={14} color="#22D3B0" /> Werkt offline</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BellRing size={14} color="#22D3B0" /> Push-meldingen</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ShieldCheck size={14} color="#22D3B0" /> Veilig &amp; AVG-proof</span>
        </div>
      </div>

      {/* Features */}
      <div className="ln-wrap" style={{ paddingBottom: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="ln-eyebrow">Alles-in-één</div>
          <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 30, marginTop: 6 }}>Gemaakt voor de praktijk</h2>
        </div>
        <div className="ln-grid">
          {FEATURES.map((f) => (
            <div key={f.titel} className="ln-card">
              <div style={{ width: 42, height: 42, borderRadius: 11, background: ACCENT + "18", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><f.icon size={21} color={ACCENT} /></div>
              <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 18, marginBottom: 6 }}>{f.titel}</div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#B4BCC9", lineHeight: 1.6 }}>{f.tekst}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Hoe werkt het */}
      <div className="ln-wrap" style={{ paddingTop: 56, paddingBottom: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="ln-eyebrow">In 3 stappen live</div>
          <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 30, marginTop: 6 }}>Zo werkt het</h2>
        </div>
        <div className="ln-grid">
          {STAPPEN.map((s) => (
            <div key={s.n} className="ln-card">
              <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 30, color: ACCENT }}>{s.n}</div>
              <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 18, margin: "6px 0" }}>{s.titel}</div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#B4BCC9", lineHeight: 1.6 }}>{s.tekst}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Aanvraag / contact */}
      <div id="aanvraag" className="ln-wrap" style={{ paddingTop: 56, paddingBottom: 70 }}>
        <div className="ln-card" style={{ padding: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "minmax(0,1fr)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 0 }}>
            <div style={{ padding: "30px 26px", borderBottom: "1px solid #1E2733", background: "linear-gradient(135deg,#12233E,#0E1520)" }}>
              <div className="ln-eyebrow">Aanmelden op aanvraag</div>
              <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 26, marginTop: 8 }}>Vraag toegang aan</h2>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "#B4BCC9", lineHeight: 1.6, marginTop: 8, maxWidth: 560 }}>
                Laat je gegevens achter, dan nemen we contact op en zetten we je bedrijf klaar. Liever direct contact? Gebruik de knoppen hieronder.
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <a className="ln-btn ln-ghost" href={`mailto:${CONTACT_EMAIL}`}><Mail size={15} /> {CONTACT_EMAIL}</a>
                <a className="ln-btn ln-ghost" href={`tel:${CONTACT_TEL.replace(/\s/g, "")}`}><Phone size={15} /> Bellen</a>
                <a className="ln-btn ln-ghost" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> WhatsApp</a>
              </div>
            </div>

            <div style={{ padding: "26px" }}>
              {sent ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#12271C", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Check size={28} color="#34D399" /></div>
                  <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 20 }}>Bedankt, we hebben je aanvraag ontvangen!</div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "#B4BCC9", marginTop: 6 }}>We nemen zo snel mogelijk contact met je op.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                  <div style={{ gridColumn: "1 / -1" }}><Field label="Naam *" value={form.naam} onChange={(v) => set("naam", v)} /></div>
                  <Field label="Bedrijf" value={form.bedrijf} onChange={(v) => set("bedrijf", v)} />
                  <Field label="Telefoon" value={form.telefoon} onChange={(v) => set("telefoon", v)} />
                  <div style={{ gridColumn: "1 / -1" }}><Field label="E-mail *" type="email" value={form.email} onChange={(v) => set("email", v)} /></div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>Bericht</label>
                    <textarea className="ln-input" rows={3} style={{ resize: "vertical" }} value={form.bericht} onChange={(e) => set("bericht", e.target.value)} placeholder="Bv. aantal voertuigen, wat je zoekt…" />
                  </div>
                  {err && <div style={{ gridColumn: "1 / -1", color: "#F0453F", fontFamily: "Inter, sans-serif", fontSize: 12.5 }}>{err}</div>}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <button className="ln-btn ln-primary" onClick={submit} disabled={busy} style={{ width: "100%", justifyContent: "center", opacity: busy ? 0.7 : 1 }}>{busy ? "Versturen…" : "Aanvraag versturen"}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #161C25" }}>
        <div className="ln-wrap" style={{ padding: "22px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#6B7585" }}>© {new Date().getFullYear()} Truck &amp; Trailer — vloot- en werkplaatsbeheer</span>
          <button onClick={onLogin} style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#8FB8FF", background: "none", border: "none", cursor: "pointer" }}>Inloggen →</button>
        </div>
      </div>
    </div>
  );
}

const lbl = { display: "block", color: "#98A1B0", fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, marginBottom: 5 };
function Field({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <input className="ln-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
