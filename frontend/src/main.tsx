import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter as Router } from "react-router-dom";
import { GlobalControlsProvider } from "./components/HeaderStatusStrip";
import DemoOverlay from "./components/DemoOverlay";
import AppRoutes from "./app/routes";
import "./styles/VRMTheme.css";
import { applyDesignTokens } from "./styles/designTokens";

applyDesignTokens();

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(
  <React.StrictMode>
    <Router>
      <GlobalControlsProvider>
        <DemoOverlay>
          <AppRoutes />
        </DemoOverlay>
      </GlobalControlsProvider>
    </Router>
  </React.StrictMode>,
);
