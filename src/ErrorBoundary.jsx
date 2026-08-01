import React from "react";

/**
 * App-brede vangnet voor render-fouten. Zonder dit klapt de héle app naar een
 * wit scherm zodra er ergens een onverwachte fout optreedt. Nu tonen we in
 * plaats daarvan een nette, gebrande melding met een herstelknop.
 *
 * Bewust een class-component (React vereist dit voor error boundaries) en met
 * inline-stijlen, zodat de fallback niet zelf van de rest van de app afhangt.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Stil loggen zodat het in de console/monitoring terugkomt.
    console.error("[ErrorBoundary]", error, info);
  }

  handleReload = () => {
    // Volledige herlaad geeft de schoonste herstart.
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#0A0E14",
          color: "#E7ECF3",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: "420px",
            width: "100%",
            textAlign: "center",
            background: "#12171F",
            border: "1px solid #232B38",
            borderRadius: "16px",
            padding: "32px 28px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              margin: "0 auto 16px",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,138,0,0.12)",
              color: "#FF8A00",
              fontSize: "24px",
              fontWeight: 700,
            }}
            aria-hidden="true"
          >
            !
          </div>
          <h1 style={{ fontSize: "20px", margin: "0 0 8px", fontWeight: 600 }}>
            Er ging iets mis
          </h1>
          <p style={{ fontSize: "14px", color: "#B4BCC9", margin: "0 0 24px", lineHeight: 1.5 }}>
            De app liep tegen een onverwachte fout aan. Herlaad de pagina om
            verder te gaan — je gegevens zijn veilig opgeslagen.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              appearance: "none",
              border: "none",
              cursor: "pointer",
              background: "#FF8A00",
              color: "#0A0E14",
              fontWeight: 600,
              fontSize: "14px",
              padding: "11px 22px",
              borderRadius: "10px",
            }}
          >
            Pagina herladen
          </button>
        </div>
      </div>
    );
  }
}
