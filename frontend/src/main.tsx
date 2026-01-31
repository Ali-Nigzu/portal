import React from "react";
import ReactDOM from "react-dom/client";

import App from "./app/App";
import "./index.css";
import { applyDesignTokens } from "./styles/designTokens";

applyDesignTokens();

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
