import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Root from "./Root.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

// Service worker registreren (voor push-meldingen én "installeren op beginscherm").
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* stil: app werkt ook zonder */ });
  });
}
