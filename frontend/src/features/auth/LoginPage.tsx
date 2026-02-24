import React from "react";

import { companyLogoDataUri } from "../../assets/companyLogo";
import { useLoginForm } from "./hooks/useLoginForm";

interface LoginPageProps {
  onLogin: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const {
    email,
    password,
    error,
    loading,
    setEmail,
    setPassword,
    handleSubmit,
  } = useLoginForm(onLogin);

  return (
    <div className="vrm-auth-shell">
      <div
        className="vrm-auth-card"
        role="dialog"
        aria-labelledby="camOS-login-title"
      >
        <div>
          <div className="vrm-auth-logo">
            <img src={companyLogoDataUri} alt="Company Logo" />
          </div>
          <h2 id="camOS-login-title" className="vrm-auth-title">
            camOS
          </h2>
          <p className="vrm-auth-subtitle">Sign in</p>
        </div>
        <form onSubmit={handleSubmit} className="vrm-auth-form">
          <div className="vrm-field">
            <label className="vrm-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className="vrm-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter email"
              autoComplete="email"
              required
            />
          </div>
          <div className="vrm-field">
            <label className="vrm-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="vrm-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <div
              className="vrm-status vrm-status-warning vrm-auth-error"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}
          <div className="vrm-auth-actions">
            <button
              type="submit"
              className="vrm-btn vrm-btn-primary"
              style={{ width: "100%" }}
              disabled={loading}
            >
              {loading ? "Signing in…" : "Login"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
