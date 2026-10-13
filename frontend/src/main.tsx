import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter as Router } from "react-router-dom";
import { LocalClockProvider } from "./components/HeaderStatusStrip";
import DemoOverlay from "./components/DemoOverlay";
import ErrorBoundary, { isAssetLoadError } from "./common/components/ErrorBoundary";
import AppRoutes from "./app/routes";
import "./styles/VRMTheme.css";
import { applyDesignTokens } from "./styles/designTokens";

// Only failed asset imports may reload automatically. Use real storage: the
// optional-storage memory fallback cannot protect a guard across a reload.
window.addEventListener("vite:preloadError", (event) => {
  const payload = (event as Event & { payload?: unknown }).payload;
  const message = payload instanceof Error ? payload.message : "";
  if (!isAssetLoadError(message)) return;
  try {
    const key = "camos:asset-reload-at";
    const previous = Number(window.sessionStorage.getItem(key));
    const now = Date.now();
    if (previous && now - previous < 5 * 60_000) return;
    window.sessionStorage.setItem(key, String(now));
    if (window.sessionStorage.getItem(key) !== String(now)) return;
    window.location.reload();
  } catch { /* The route boundary provides explicit recovery without storage. */ }
});

applyDesignTokens();

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(
  <React.StrictMode>
    <Router>
      <LocalClockProvider>
        <ErrorBoundary name="application" onReload={() => window.location.reload()}>
        <DemoOverlay>
          <AppRoutes />
        </DemoOverlay>
        </ErrorBoundary>
      </LocalClockProvider>
    </Router>
  </React.StrictMode>,
);
