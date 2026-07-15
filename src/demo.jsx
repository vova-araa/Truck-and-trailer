import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import TruckTrailerApp from "./TruckTrailerApp.jsx";

// Demo-modus: geen session -> de app draait op seed-data zonder Supabase.
// Handig als publieke rondleiding (kies een rol en klik rond) en als basis
// voor de losse preview. Data wordt niet bewaard; ververs = opnieuw beginnen.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TruckTrailerApp session={null} onLogout={() => window.location.reload()} />
  </React.StrictMode>
);
