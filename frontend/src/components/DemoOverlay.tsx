import React, { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearDemoSessionLocal,
  clearDemoSessionServer,
  isDemoSessionActive,
} from "../lib/demoSession";
import "../styles/DemoOverlay.css";

interface DemoOverlayProps {
  children: React.ReactNode;
}

const CLOSE_ANIMATION_MS = 220;

const DemoOverlay: React.FC<DemoOverlayProps> = ({ children }) => {
  const [isActive, setIsActive] = useState(isDemoSessionActive());
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const navigate = useNavigate();
  const closeTimeoutRef = useRef<number | null>(null);
  const exitInProgressRef = useRef(false);
  const hasNavigatedRef = useRef(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const shouldRender = isActive || isClosing;

  const overlayClassName = isClosing
    ? "demo-overlay demo-overlay--closing"
    : isVisible
      ? "demo-overlay demo-overlay--open"
      : "demo-overlay";

  const resetCloseGuards = () => {
    exitInProgressRef.current = false;
    hasNavigatedRef.current = false;
  };

  const finalizeExit = () => {
    if (!exitInProgressRef.current || hasNavigatedRef.current) {
      return;
    }
    hasNavigatedRef.current = true;
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    clearDemoSessionLocal();
    setIsClosing(false);
    resetCloseGuards();
    navigate("/", { replace: true, state: { fromDemo: true } });
    void clearDemoSessionServer();
  };

  const startExit = () => {
    if (exitInProgressRef.current || !shouldRender) {
      return;
    }
    exitInProgressRef.current = true;
    setIsClosing(true);
    setIsVisible(false);
    closeTimeoutRef.current = window.setTimeout(finalizeExit, CLOSE_ANIMATION_MS + 50);
  };

  useLayoutEffect(() => {
    const handleChange = () => {
      const nextActive = isDemoSessionActive();
      setIsActive(nextActive);
      if (!nextActive) {
        resetCloseGuards();
      }
    };

    const handlePopState = () => {
      if (!isDemoSessionActive()) {
        return;
      }
      startExit();
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

  useLayoutEffect(() => {
    if (!shouldRender || isClosing) {
      setIsVisible(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setIsVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [shouldRender, isClosing]);


  useLayoutEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

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
          if (event.target !== shellRef.current || !isClosing) {
            return;
          }
          finalizeExit();
        }}
      >
        <button
          type="button"
          className="demo-overlay__close"
          onClick={startExit}
          aria-label="Exit demo"
          disabled={isClosing}
        >
          ×
        </button>
        <div className="demo-overlay__content">{children}</div>
      </div>
    </div>
  );
};

export default DemoOverlay;
