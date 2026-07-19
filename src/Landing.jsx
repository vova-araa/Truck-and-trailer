import React, { useState, useRef, useEffect } from "react";
import {
  Truck, AlertTriangle, KanbanSquare, Euro, Sparkles, FileText, ShieldCheck,
  BellRing, Globe, WifiOff, Check, ArrowRight, Mail, Phone as PhoneIcon, MessageCircle, LogIn, Ticket, Star,
} from "lucide-react";
import { sendContactRequest } from "./api.js";

/*
  Premium landingspagina voor truckandtrailer.nl. Getoond aan uitgelogde
  bezoekers, met echte app-screenshots in laptop/telefoon-mockups en verzorgde
  scroll-animaties. "Inloggen" opent het inlogscherm; "Toegang aanvragen"
  scrollt naar het formulier (aanmelden gaat voorlopig op aanvraag).

  Pas onderaan je eigen contactgegevens aan (e-mail / telefoon / WhatsApp).
*/

const ACCENT = "#3B82F6";
const TEAL = "#22D3B0";
const CONTACT_EMAIL = "info@truckandtrailer.nl";
const CONTACT_TEL = "+31 6 12 34 56 78"; // pas aan naar je eigen nummer
const WHATSAPP = "31612345678";           // internationaal, zonder +

const FEATURES = [
  { icon: AlertTriangle, kleur: "#F0453F", titel: "Meldingen van chauffeurs", tekst: "Chauffeurs melden onderweg een probleem in een paar tikken — met foto, spraak en AI-schadeherkenning. In 11 talen en zelfs offline." },
  { icon: KanbanSquare, kleur: ACCENT, titel: "Digitale werkvloer & planning", tekst: "Alle meldingen op één overzichtelijk bord. Plan reparaties in, wijs monteurs toe en zie live wat er speelt." },
  { icon: Euro, kleur: TEAL, titel: "Kosten, werkbonnen & facturen", tekst: "Registreer kosten per voertuig, maak werkbonnen met je eigen logo en BTW, en exporteer alles wanneer je wilt." },
  { icon: Sparkles, kleur: "#A855F7", titel: "AI die meedenkt", tekst: "Schade herkennen op foto's en voorspellend onderhoud op basis van kilometers, leeftijd en terugkerende meldingen." },
  { icon: FileText, kleur: "#F59E0B", titel: "Documenten per voertuig", tekst: "Kentekenbewijs, verzekering en APK veilig opgeslagen bij elk voertuig — altijd bij de hand." },
  { icon: ShieldCheck, kleur: TEAL, titel: "APK & verzekering bewaakt", tekst: "Automatische herinneringen per e-mail vóórdat een keuring of verzekering verloopt. Nooit meer een boete." },
];

const STAPPEN = [
  { n: "1", titel: "Voeg je vloot toe", tekst: "Zet je vrachtwagens, trailers en bestelwagens in de app — handmatig of razendsnel via kenteken." },
  { n: "2", titel: "Nodig je team uit", tekst: "Chauffeurs en monteurs krijgen hun eigen weergave. Chauffeurs melden, de werkplaats lost op." },
  { n: "3", titel: "Alles onder controle", tekst: "Meldingen, planning, kosten en keuringen op één plek — op kantoor én onderweg op je telefoon." },
];

const STATS = [
  { v: "11", l: "talen voor chauffeurs" },
  { v: "1 app", l: "vloot + werkplaats" },
  { v: "24/7", l: "onderweg bereikbaar" },
  { v: "0", l: "installatie nodig" },
];

// Reveal-on-scroll wrapper (module-level component → geen remounts).
function Reveal({ children, delay = 0, y = 26, style }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ ...style, opacity: shown ? 1 : 0, transform: shown ? "none" : `translateY(${y}px)`, transition: `opacity .7s ease ${delay}ms, transform .8s cubic-bezier(.2,.7,.2,1) ${delay}ms` }}>
      {children}
    </div>
  );
}

function Laptop({ src, alt }) {
  return (
    <div style={{ width: "100%", maxWidth: 760 }}>
      <div style={{ background: "linear-gradient(180deg,#1b2432,#0d1119)", borderRadius: "16px 16px 5px 5px", padding: 11, border: "1px solid #2a3444", boxShadow: "0 40px 90px rgba(0,0,0,.55)" }}>
        <div style={{ borderRadius: 9, overflow: "hidden", border: "1px solid #05070b", background: "#0A0E14" }}>
          <img src={src} alt={alt} loading="lazy" style={{ width: "100%", display: "block" }} />
        </div>
      </div>
      <div style={{ position: "relative", height: 15, width: "110%", marginLeft: "-5%", background: "linear-gradient(180deg,#222c3d,#121822)", borderRadius: "0 0 13px 13px", boxShadow: "0 24px 34px rgba(0,0,0,.45)" }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 96, height: 6, background: "#05070b", borderRadius: "0 0 7px 7px" }} />
      </div>
    </div>
  );
}

function Phone({ src, alt, style }) {
  return (
    <div style={{ width: 214, background: "#05070b", borderRadius: 32, padding: 7, border: "1px solid #2a3444", boxShadow: "0 34px 60px rgba(0,0,0,.6)", ...style }}>
      <div style={{ position: "relative", borderRadius: 26, overflow: "hidden", background: "#0A0E14" }}>
        <div style={{ position: "absolute", top: 7, left: "50%", transform: "translateX(-50%)", width: 64, height: 16, background: "#05070b", borderRadius: 11, zIndex: 2 }} />
        <img src={src} alt={alt} loading="lazy" style={{ width: "100%", display: "block" }} />
      </div>
    </div>
  );
}

export default function Landing({ onLogin, onActivate, onLegal }) {
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
    <div style={{ background: "#0A0E14", minHeight: "100vh", color: "#E7ECF3", overflowX: "hidden", position: "relative" }}>
      <style>{`
        .ln-wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px; position: relative; z-index: 1; }
        .ln-btn { font-family: Inter, sans-serif; font-weight: 600; font-size: 14px; border-radius: 11px; padding: 12px 20px; cursor: pointer; border: none; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; transition: transform .14s ease, box-shadow .14s ease, background .14s ease, border-color .14s ease; }
        .ln-btn:hover { transform: translateY(-2px); }
        .ln-primary { background: linear-gradient(180deg,#5A97FF,#3B82F6); color: #fff; box-shadow: 0 10px 26px rgba(59,130,246,.4); }
        .ln-primary:hover { box-shadow: 0 14px 34px rgba(59,130,246,.55); }
        .ln-ghost { background: rgba(255,255,255,.03); color: #E7ECF3; border: 1px solid #232B38; }
        .ln-ghost:hover { border-color: #3B82F6; background: rgba(59,130,246,.08); }
        .ln-card { background: linear-gradient(180deg,rgba(24,31,43,.7),rgba(15,20,30,.7)); border: 1px solid #1E2733; border-radius: 18px; padding: 24px; transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .ln-card:hover { transform: translateY(-4px); border-color: #2c3a4e; box-shadow: 0 20px 40px rgba(0,0,0,.35); }
        .ln-input { width: 100%; background: #0E1520; border: 1px solid #2A3340; border-radius: 11px; padding: 12px 14px; color: #E7ECF3; font-family: Inter, sans-serif; font-size: 14px; box-sizing: border-box; transition: border-color .15s ease; }
        .ln-input:focus { outline: none; border-color: ${ACCENT}; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
        .ln-eyebrow { font-family: Inter, sans-serif; font-size: 12.5px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #6E9BF0; }
        .ln-grad { background: linear-gradient(100deg,#9EC1FF, #3B82F6 40%, #22D3B0); -webkit-background-clip: text; background-clip: text; color: transparent; background-size: 200% auto; animation: ln-shimmer 6s linear infinite; }
        .ln-blob { position: absolute; border-radius: 50%; filter: blur(90px); opacity: .5; z-index: 0; pointer-events: none; }
        .ln-float { animation: ln-float 7s ease-in-out infinite; }
        .ln-float2 { animation: ln-float 8.5s ease-in-out infinite; }
        @keyframes ln-shimmer { to { background-position: 200% center; } }
        @keyframes ln-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes ln-drift { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(40px,30px) scale(1.15); } }
        .ln-h1 { font-family: Oswald, sans-serif; font-weight: 700; font-size: 58px; line-height: 1.03; letter-spacing: -0.5px; }
        .ln-h2 { font-family: Oswald, sans-serif; font-weight: 600; font-size: 34px; }
        .ln-hero-grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 30px; align-items: center; }
        .ln-showcase { display: grid; grid-template-columns: 1.15fr .85fr; gap: 34px; align-items: center; }
        @media (max-width: 900px) {
          .ln-hero-grid, .ln-showcase { grid-template-columns: minmax(0,1fr); }
          .ln-h1 { font-size: 40px; }
          .ln-h2 { font-size: 27px; }
          .ln-hide-sm { display: none !important; }
          .ln-hero-mock { margin-top: 8px; }
        }
        @media (prefers-reduced-motion: reduce) { .ln-float,.ln-float2,.ln-grad { animation: none !important; } }
      `}</style>

      {/* Aurora achtergrond */}
      <div className="ln-blob" style={{ width: 520, height: 520, top: -120, left: -80, background: "#1e4fb0", animation: "ln-drift 20s ease-in-out infinite alternate" }} />
      <div className="ln-blob" style={{ width: 460, height: 460, top: 180, right: -120, background: "#0f6b63", animation: "ln-drift 24s ease-in-out infinite alternate-reverse" }} />

      {/* Topbar */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(10,14,20,.72)", backdropFilter: "blur(12px)", borderBottom: "1px solid #161C25" }}>
        <div className="ln-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 66 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: ACCENT + "22", display: "flex", alignItems: "center", justifyContent: "center" }}><Truck size={18} color={ACCENT} /></div>
            <span style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 19, letterSpacing: .5 }}>TRUCK <span style={{ color: ACCENT }}>&amp;</span> TRAILER</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="ln-btn ln-ghost ln-hide-sm" onClick={onActivate}><Ticket size={15} /> Bedrijf activeren</button>
            <button className="ln-btn ln-ghost" onClick={onLogin}><LogIn size={15} /> Inloggen</button>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="ln-wrap" style={{ paddingTop: 64, paddingBottom: 40 }}>
        <div className="ln-hero-grid">
          <div>
            <Reveal>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 999, border: "1px solid #233047", background: "rgba(59,130,246,.08)", marginBottom: 18 }}>
                <span style={{ display: "inline-flex", gap: 1 }}>{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={11} color="#F5B301" fill="#F5B301" />)}</span>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#B4BCC9" }}>Voor Nederlandse transportbedrijven</span>
              </div>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="ln-h1">Je hele vloot en<br />werkplaats in <span className="ln-grad">één app</span></h1>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17, color: "#B4BCC9", maxWidth: 500, marginTop: 18, lineHeight: 1.6 }}>
                Van de melding van een chauffeur onderweg tot de werkbon in de werkplaats — Truck &amp; Trailer houdt je wagenpark rijdend, je planning strak en je kosten inzichtelijk.
              </p>
            </Reveal>
            <Reveal delay={180}>
              <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
                <button className="ln-btn ln-primary" onClick={scrollToForm}>Toegang aanvragen <ArrowRight size={16} /></button>
                <button className="ln-btn ln-ghost" onClick={onLogin}>Inloggen</button>
              </div>
            </Reveal>
            <Reveal delay={240}>
              <div style={{ display: "flex", gap: 18, marginTop: 26, flexWrap: "wrap", fontFamily: "Inter, sans-serif", fontSize: 13, color: "#98A1B0" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Globe size={14} color={TEAL} /> 11 talen</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><WifiOff size={14} color={TEAL} /> Werkt offline</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BellRing size={14} color={TEAL} /> Push-meldingen</span>
              </div>
            </Reveal>
          </div>

          {/* Hero mockups */}
          <Reveal delay={200} y={34} style={{ position: "relative" }}>
            <div className="ln-hero-mock" style={{ position: "relative", paddingBottom: 40 }}>
              <div className="ln-float"><Laptop src="/landing/dashboard.png" alt="Truck & Trailer dashboard op laptop" /></div>
              <div className="ln-float2 ln-hide-sm" style={{ position: "absolute", right: -6, bottom: -6, zIndex: 2 }}>
                <Phone src="/landing/driver.png" alt="Meldingen maken op telefoon" />
              </div>
            </div>
          </Reveal>
        </div>

        {/* Stats-strip */}
        <Reveal delay={120}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginTop: 46 }}>
            {STATS.map((s) => (
              <div key={s.l} style={{ textAlign: "center", padding: "16px 8px", borderRadius: 14, border: "1px solid #1A2230", background: "rgba(255,255,255,.015)" }}>
                <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 26, color: "#E7ECF3" }}>{s.v}</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#98A1B0" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* Features */}
      <div className="ln-wrap" style={{ paddingTop: 64, paddingBottom: 20 }}>
        <Reveal><div style={{ textAlign: "center", marginBottom: 34 }}>
          <div className="ln-eyebrow">Alles-in-één</div>
          <h2 className="ln-h2" style={{ marginTop: 8 }}>Gemaakt voor de praktijk</h2>
        </div></Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.titel} delay={(i % 3) * 80}>
              <div className="ln-card" style={{ height: "100%" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: f.kleur + "1e", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 15 }}><f.icon size={22} color={f.kleur} /></div>
                <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 18.5, marginBottom: 7 }}>{f.titel}</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#B4BCC9", lineHeight: 1.6 }}>{f.tekst}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Showcase: werkvloer + phone */}
      <div className="ln-wrap" style={{ paddingTop: 72, paddingBottom: 20 }}>
        <div className="ln-showcase">
          <Reveal><div className="ln-float" style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #1E2733", boxShadow: "0 40px 80px rgba(0,0,0,.5)" }}>
            <img src="/landing/werkvloer.png" alt="Digitale werkvloer" loading="lazy" style={{ width: "100%", display: "block" }} />
          </div></Reveal>
          <Reveal delay={100}>
            <div className="ln-eyebrow">Werkvloer &amp; planning</div>
            <h2 className="ln-h2" style={{ marginTop: 8 }}>Overzicht dat rust geeft</h2>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, color: "#B4BCC9", lineHeight: 1.65, marginTop: 12 }}>
              Elke melding komt binnen op een helder bord. Sleep 'm door de werkplaats, plan de reparatie in en sluit af met een werkbon op je eigen briefpapier — inclusief BTW en handtekening.
            </p>
            <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
              {["Meldingen live binnen — ook push als de app dicht is", "Planning per dag met monteurs en tijden", "Werkbon als PDF met je eigen logo & gegevens", "Kosten automatisch bij het juiste voertuig"].map((t) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "Inter, sans-serif", fontSize: 14, color: "#D3DAE5" }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, background: TEAL + "1e", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Check size={13} color={TEAL} /></span>
                  {t}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>

      {/* Hoe werkt het */}
      <div className="ln-wrap" style={{ paddingTop: 72, paddingBottom: 20 }}>
        <Reveal><div style={{ textAlign: "center", marginBottom: 34 }}>
          <div className="ln-eyebrow">In 3 stappen live</div>
          <h2 className="ln-h2" style={{ marginTop: 8 }}>Zo werkt het</h2>
        </div></Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
          {STAPPEN.map((s, i) => (
            <Reveal key={s.n} delay={i * 90}>
              <div className="ln-card" style={{ height: "100%" }}>
                <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 30, color: ACCENT }}>{s.n}</div>
                <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 18.5, margin: "6px 0" }}>{s.titel}</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#B4BCC9", lineHeight: 1.6 }}>{s.tekst}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Aanvraag / contact */}
      <div id="aanvraag" className="ln-wrap" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <Reveal>
          <div className="ln-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "32px 28px", borderBottom: "1px solid #1E2733", background: "linear-gradient(135deg,rgba(30,79,176,.35),rgba(15,20,30,.2))" }}>
              <div className="ln-eyebrow">Aanmelden op aanvraag</div>
              <h2 className="ln-h2" style={{ marginTop: 8 }}>Vraag toegang aan</h2>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, color: "#B4BCC9", lineHeight: 1.6, marginTop: 10, maxWidth: 580 }}>
                Laat je gegevens achter, dan nemen we contact op en zetten we je bedrijf klaar. Liever direct contact? Gebruik de knoppen hieronder.
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <a className="ln-btn ln-ghost" href={`mailto:${CONTACT_EMAIL}`}><Mail size={15} /> {CONTACT_EMAIL}</a>
                <a className="ln-btn ln-ghost" href={`tel:${CONTACT_TEL.replace(/\s/g, "")}`}><PhoneIcon size={15} /> Bellen</a>
                <a className="ln-btn ln-ghost" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> WhatsApp</a>
              </div>
            </div>
            <div style={{ padding: 28 }}>
              {sent ? (
                <div style={{ textAlign: "center", padding: "26px 0" }}>
                  <div style={{ width: 58, height: 58, borderRadius: "50%", background: "#12271C", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Check size={30} color="#34D399" /></div>
                  <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 21 }}>Bedankt, we hebben je aanvraag ontvangen!</div>
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
        </Reveal>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #161C25", position: "relative", zIndex: 1 }}>
        <div className="ln-wrap" style={{ padding: "22px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Truck size={15} color={ACCENT} />
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#6B7585" }}>© {new Date().getFullYear()} Truck &amp; Trailer — vloot- en werkplaatsbeheer</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => onLegal && onLegal("/privacy")} style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#8FB8FF", background: "none", border: "none", cursor: "pointer" }}>Privacy</button>
            <button onClick={() => onLegal && onLegal("/voorwaarden")} style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#8FB8FF", background: "none", border: "none", cursor: "pointer" }}>Voorwaarden</button>
            <button onClick={onLogin} style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#8FB8FF", background: "none", border: "none", cursor: "pointer" }}>Inloggen →</button>
          </div>
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
