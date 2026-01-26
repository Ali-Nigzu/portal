import React from "react";
import { BrowserRouter as Router } from "react-router-dom";

import { GlobalControlsProvider } from "../context/GlobalControlsContext";
import AppRoutes from "./routes";
import "../styles/VRMTheme.css";

const App: React.FC = () => (
  <Router>
    <GlobalControlsProvider>
      <AppRoutes />
    </GlobalControlsProvider>
  </Router>
);

export default App;
