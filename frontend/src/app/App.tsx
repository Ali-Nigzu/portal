import React from "react";
import { BrowserRouter as Router } from "react-router-dom";

import { GlobalControlsProvider } from "../context/GlobalControlsContext";
import DemoOverlay from "../components/DemoOverlay";
import AppRoutes from "./routes";
import "react-datepicker/dist/react-datepicker.css";
import "../styles/VRMTheme.css";
import "../styles/DatePickerDark.css";

const App: React.FC = () => (
  <Router>
    <GlobalControlsProvider>
      <DemoOverlay>
        <AppRoutes />
      </DemoOverlay>
    </GlobalControlsProvider>
  </Router>
);

export default App;
