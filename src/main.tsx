import React from "react";
import { Capacitor } from "@capacitor/core";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

if (Capacitor.isNativePlatform() && !window.location.pathname.startsWith("/owner")) {
  window.history.replaceState({}, "", "/owner");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
