import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearDemoSession,
  isDemoSessionActive,
} from "../lib/demoSession";
import "../styles/DemoOverlay.css";

interface DemoOverlayProps {
  children: React.ReactNode;
}

const DemoOverlay: React.FC<DemoOverlayProps> = ({ children }) => {
  const [isActive, setIsActive] = useState(isDemoSessionActive());
  const navigate = useNavigate();

  useEffect(() => {
    const handleChange = () => setIsActive(isDemoSessionActive());
    window.addEventListener("demo-session-changed", handleChange);
    return () => {
      window.removeEventListener("demo-session-changed", handleChange);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (isActive) {
      document.body.classList.add("demo-overlay-active");
    } else {
      document.body.classList.remove("demo-overlay-active");
    }
  }, [isActive]);

  const handleExit = async () => {
    await clearDemoSession();
    navigate("/", { replace: true });
  };

  if (!isActive) {
    return <>{children}</>;
  }

  return (
    <div className="demo-overlay" role="dialog" aria-modal="true">
      <div className="demo-overlay__backdrop" />
      <div className="demo-overlay__shell">
        <button
          type="button"
          className="demo-overlay__close"
          onClick={handleExit}
          aria-label="Exit demo"
        >
          ×
        </button>
        <div className="demo-overlay__content">{children}</div>
      </div>
    </div>
  );
};

export default DemoOverlay;
