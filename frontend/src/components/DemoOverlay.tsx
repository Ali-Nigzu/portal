import { optionalSessionStorage } from "../common/optionalStorage";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import {
  clearDemoSessionLocal,
  clearDemoSessionServer,
  isDemoSessionActive,
} from "../features/organisation-dashboard/demoSession";
import "../styles/DemoOverlay.css";

function demoReturnPath(candidate: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(candidate); } catch { return '/'; }
  let checked = decoded;
  for (let i = 0; i < 4; i++) {
    if (!checked.startsWith('/') || checked.startsWith('//') || /[\u0000-\u001F\u007F\\]/u.test(checked)) return '/';
    try {
      const next = decodeURIComponent(checked);
      if (next === checked) return new URL(decoded, 'https://camos.invalid').origin === 'https://camos.invalid' ? decoded : '/';
      checked = next;
    } catch { return '/'; }
  }
  return '/';
}

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
  const suppressOverlay = location.pathname === "/" || location.pathname === "/home";
  const shouldRender = (isActive || isClosing) && !suppressOverlay;
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
    const handleChange = () => {
      const nextActive = isDemoSessionActive();
      setIsActive(nextActive);
      if (!nextActive && !closingRef.current) {
        setIsClosing(false);
        closingRef.current = false;
      }
    };

    const handlePopState = () => {
      if (!isDemoSessionActive()) {
        return;
      }
      startClose();
    };

    window.addEventListener("demo-session-changed", handleChange);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("demo-session-changed", handleChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [shouldRender]);

  useLayoutEffect(() => {
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

  const resolveReturnPath = () => {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get("returnTo");
    const fromStorage = optionalSessionStorage.getItem("demo:returnTo");
    const candidate = fromQuery ?? fromStorage ?? "/";

    return demoReturnPath(candidate);
  };

  const startClose = () => {
    if (closingRef.current || !shouldRender) {
      return;
    }
    const targetPath = resolveReturnPath();
    closingRef.current = true;
    setIsClosing(true);
    setIsVisible(false);
    clearDemoSessionLocal();
    optionalSessionStorage.removeItem("demo:returnTo");
    navigate(targetPath, { replace: true, state: { fromDemo: true } });
    closeTimeoutRef.current = window.setTimeout(finishClose, 240);
  };

  return (
    <div className={shouldRender ? overlayClassName : "demo-overlay--inactive"} role={shouldRender ? "dialog" : undefined} aria-modal={shouldRender ? true : undefined}>
      {shouldRender && <div className="demo-overlay__backdrop" />}
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
        {shouldRender && <button
          type="button"
          className="demo-overlay__close"
          onClick={startClose}
          aria-label="Exit demo"
          disabled={isClosing}
        >
          ×
        </button>}
        <div className="demo-overlay__content">{children}</div>
      </div>
    </div>
  );
};

export default DemoOverlay;
