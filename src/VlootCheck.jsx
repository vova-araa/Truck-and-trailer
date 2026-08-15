import React, { useEffect, useState } from "react";
import { Truck, ArrowLeft, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";

/*
  Publieke RDW vloot-check (leadmagneet, geen account nodig): plak je
  kentekens en zie direct welke APK's (bijna) verlopen — met dezelfde gratis
  RDW open data die de app 's nachts voor klanten bewaakt. De uitsmijter is de
  brug naar het product: "dit is precies wat de app elke nacht automatisch doet".
*/

const ACCENT = "#3B82F6";

function statusVan(dagen) {
  if (dagen == null) return { label: "Onbekend", color: "#98A1B0" };
  if (dagen < 0) return { label: `${Math.abs(dagen)} dagen verlopen`, color: "#F0453F" };
  if (dagen <= 30) return { label: `Nog ${dagen} dagen`, color: "#FF8A00" };
  return { label: "In orde", color: "#34D399" };
}

export default function VlootCheck({ onBack, onDemo, onActivate }) {
  useEffect(() => { try { window.scrollTo(0, 0); document.title = "Gratis APK vloot-check — Truck & Trailer Software"; } catch { /* noop */ } }, []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState(null);

  const run = async () => {
    const kentekens = input.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!kentekens.length) { setErr("Plak eerst één of meer kentekens."); return; }
    if (kentekens.length > 50) { setErr("Maximaal 50 kentekens per check."); return; }
    setBusy(true); setErr(""); setResults(null);
    try {
      const r = await fetch("/api/vloot-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kentekens }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "De check mislukte — probeer het later opnieuw.");
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (e) {
      setErr(e.message || "De check mislukte — probeer het later opnieuw.");
    } finally {
      setBusy(false);
    }
  };

  const aandacht = (results || []).filter((r) => r.gevonden && r.dagen != null && r.dagen <= 30).length;

  const s = {
    wrap: { maxWidth: 860, margin: "0 auto", padding: "0 20px" },
    card: { background: "#12171F", border: "1px solid #232B38", borderRadius: 14, padding: 22 },
  };

  return (
    <div style={{ background: "#0A0E14", minHeight: "100vh", color: "#E7ECF3" }}>
      <div style={{ borderBottom: "1px solid #161C25", position: "sticky", top: 0, background: "rgba(10,14,20,.82)", backdropFilter: "blur(10px)", zIndex: 10 }}>
        <div style={s.wrap}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 62 }}>
            <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "#E7ECF3", fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600 }}>
              <ArrowLeft size={16} /> Terug
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Truck size={16} color={ACCENT} />
              <span style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: .5 }}>TRUCK <span style={{ color: ACCENT }}>&amp;</span> TRAILER</span>
            </div>
          </div>
        </div>
      </div>

      <div style={s.wrap}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "44px 0 72px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 999, border: "1px solid #233047", background: "rgba(59,130,246,.08)", marginBottom: 14, fontFamily: "Inter, sans-serif", fontSize: 12, color: "#B4BCC9" }}>
            <ShieldCheck size={13} color="#22D3B0" /> Gratis · geen account nodig · officiële RDW-data
          </div>
          <h1 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 34, lineHeight: 1.1, margin: "0 0 10px" }}>Gratis APK vloot-check</h1>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, color: "#B4BCC9", lineHeight: 1.6, maxWidth: 560, margin: "0 0 22px" }}>
            Plak de kentekens van je wagenpark (max 50) en zie direct welke APK's verlopen zijn of binnen 30 dagen aflopen — rechtstreeks uit de open data van de RDW.
          </p>

          <div style={s.card}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={4}
              placeholder={"Bv.\n84-BSX-2\nVX-77-KL, SD-14-TR"}
              style={{ width: "100%", boxSizing: "border-box", background: "#0D1219", border: "1px solid #2A3340", borderRadius: 10, color: "#E7ECF3", fontFamily: "JetBrains Mono, monospace", fontSize: 14, padding: "12px 14px", resize: "vertical", outline: "none" }}
            />
            {err && <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#F0453F", marginTop: 10 }}>{err}</div>}
            <button onClick={run} disabled={busy} style={{ marginTop: 12, width: "100%", padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer", background: `linear-gradient(180deg,#4C8DFF,${ACCENT})`, color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, opacity: busy ? .7 : 1 }}>
              {busy ? "Checken bij de RDW…" : "Check mijn vloot"}
            </button>
          </div>

          {results && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "#B4BCC9", marginBottom: 12 }}>
                {aandacht > 0
                  ? <span style={{ color: "#FF8A00", fontWeight: 700 }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {aandacht} voertuig{aandacht === 1 ? "" : "en"} met een APK die aandacht nodig heeft.</span>
                  : <span style={{ color: "#34D399", fontWeight: 700 }}><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> Geen verlopen of bijna-verlopen APK's gevonden.</span>}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {results.map((r) => {
                  const st = r.gevonden ? statusVan(r.dagen) : { label: "Niet gevonden bij de RDW", color: "#98A1B0" };
                  return (
                    <div key={r.kenteken} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#12171F", border: `1px solid ${st.color}44`, borderRadius: 10, padding: "10px 14px" }}>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 14, background: "#F5C518", color: "#0A0E14", borderRadius: 5, padding: "2px 8px", flexShrink: 0 }}>{r.kenteken}</span>
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#B4BCC9", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 140px" }}>{r.merk || "—"}</span>
                      {r.gevonden && r.apk && <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#98A1B0", flexShrink: 0 }}>APK t/m {r.apk}</span>}
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 700, color: st.color, flexShrink: 0, marginLeft: "auto" }}>{st.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* De brug naar het product */}
              <div style={{ marginTop: 24, background: "linear-gradient(135deg,#12233E,#12171F)", border: "1px solid #3B82F644", borderRadius: 14, padding: 22 }}>
                <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 19, fontWeight: 600, marginBottom: 6 }}>Dit is precies wat Truck &amp; Trailer elke nacht automatisch doet</div>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#B4BCC9", lineHeight: 1.6, margin: "0 0 14px", maxWidth: 560 }}>
                  De app houdt deze datums voor je in de gaten, mailt je op tijd vóórdat iets verloopt, en bewaakt óók verzekering, tachograaf-keuring, chauffeurspapieren en documenten. Plus meldingen, werkbonnen, planning en urenregistratie — in één systeem.
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={onDemo} style={{ padding: "10px 18px", borderRadius: 10, border: "none", cursor: "pointer", background: `linear-gradient(180deg,#4C8DFF,${ACCENT})`, color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700 }}>Bekijk de demo — zonder account</button>
                  <button onClick={onActivate} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${ACCENT}66`, cursor: "pointer", background: "transparent", color: "#8FB8FF", fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700 }}>Toegang aanvragen</button>
                </div>
              </div>
            </div>
          )}

          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "#6B7585", marginTop: 26, lineHeight: 1.5 }}>
            Bron: RDW open data (gekentekende voertuigen). Wij slaan de ingevoerde kentekens niet op. Aan de uitkomst kunnen geen rechten worden ontleend — controleer bij twijfel het officiële RDW-register.
          </p>
        </div>
      </div>
    </div>
  );
}
