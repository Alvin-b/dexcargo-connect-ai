import React from "react";
import ReactDOM from "react-dom/client";
import { OpsApp } from "../../src/routes/ops";
import { Toaster } from "../../src/components/ui/sonner";
import "../../src/styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <OpsApp />
    <Toaster richColors position="top-right" />
  </React.StrictMode>,
);
