import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import {
  clearDemoSessionLocal,
  clearDemoSessionServer,
  isDemoSessionActive,
} from "../lib/demoSession";
import "../styles/DemoOverlay.css";

interface DemoOverlayProps {
  children: React.ReactNode;
}

const DemoOverlay: React.FC<DemoOverlayProps> = ({ children }) => {
  const [isActive, setIsActive] = useState(isDemoSessionActive());
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const closeTimeoutRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const shouldRender = isActive || isClosing;
  const overlayClassName = useMemo(() => {
    if (isClosing) {
      return "demo-overlay demo-overlay--closing";
    }
    if (isVisible) {
      return "demo-overlay demo-overlay--open";
    }
    return "demo-overlay";
  }, [isClosing, isVisible]);

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
    if (shouldRender) {
      document.body.classList.add("demo-overlay-active");
    } else {
      document.body.classList.remove("demo-overlay-active");
    }
  }, [shouldRender]);

  useEffect(() => {
    if (!shouldRender || isClosing) {
      setIsVisible(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setIsVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [shouldRender, isClosing]);


  useEffect(() => {
    if (!isActive || isClosing) {
      return;
    }
    if (navigationType === "POP" && location.pathname.startsWith("/sites")) {
      startClose();
    }
  }, [isActive, isClosing, navigationType, location.pathname]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const finishClose = () => {
    if (!closingRef.current) {
      return;
    }
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsClosing(false);
    closingRef.current = false;
    clearDemoSessionServer();
  };

  const startClose = () => {
    if (closingRef.current || !shouldRender) {
      return;
    }
    closingRef.current = true;
    setIsClosing(true);
    setIsVisible(false);
    clearDemoSessionLocal();
    navigate("/", { replace: true, state: { fromDemo: true } });
    closeTimeoutRef.current = window.setTimeout(finishClose, 240);
  };

  if (!shouldRender) {
    return <>{children}</>;
  }

  return (
    <div className={overlayClassName} role="dialog" aria-modal="true">
      <div className="demo-overlay__backdrop" />
      <div
        className="demo-overlay__shell"
        ref={shellRef}
        onTransitionEnd={(event) => {
          if (event.target !== shellRef.current) {
            return;
          }
          if (isClosing) {
            finishClose();
          }
        }}
      >
        <button
          type="button"
          className="demo-overlay__close"
          onClick={startClose}
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
