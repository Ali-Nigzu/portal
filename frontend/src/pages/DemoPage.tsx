import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  applyDemoDefaultsOnce,
  enableDemoSession,
} from "../lib/demoSession";

const DemoPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const params = new URLSearchParams(location.search);
    const isEmbedMode = params.get("embed") === "1";

    const startDemo = async () => {
      try {
        await enableDemoSession();
        applyDemoDefaultsOnce();
        if (!isMounted) {
          return;
        }
        navigate(
          isEmbedMode
            ? "/demo/site-a/dashboard?embed=1"
            : "/demo/site-a/dashboard",
          { replace: true },
        );
      } catch (err) {
        if (!isMounted) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Unable to start demo session.";
        setError(message);
      }
    };
    startDemo();
    return () => {
      isMounted = false;
    };
  }, [location.search, navigate]);

  if (error) {
    return (
      <div className="vrm-card" style={{ margin: "32px" }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Demo Unavailable</h3>
        </div>
        <div className="vrm-card-body">
          <p style={{ color: "#8b3a2f", marginBottom: "16px" }}>
            {error}
          </p>
          <button className="vrm-btn" onClick={() => navigate(0)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "60vh",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: "40px",
            height: "40px",
            border: "4px solid var(--line-default)",
            borderTop: "4px solid var(--signal-gold)",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 16px",
          }}
        />
        <div>Loading live demo…</div>
      </div>
    </div>
  );
};

export default DemoPage;
