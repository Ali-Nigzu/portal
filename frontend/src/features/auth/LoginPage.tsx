import React from "react";

import { companyLogoDataUri } from "../../assets/companyLogo";
import { Credentials } from "../../types/credentials";
import { useLoginForm } from "./hooks/useLoginForm";

interface LoginPageProps {
  onLogin: (credentials: Credentials) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const {
    username,
    password,
    error,
    loading,
    setUsername,
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
          <p className="vrm-auth-subtitle">Sign in to monitor your sites</p>
        </div>
        <form onSubmit={handleSubmit} className="vrm-auth-form">
          <div className="vrm-field">
            <label className="vrm-label" htmlFor="login-username">
              Username
            </label>
            <input
              id="login-username"
              className="vrm-input"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter username"
              autoComplete="username"
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
        <div className="vrm-auth-hint">
          <strong>Demo credentials</strong>
          <br />
          Client: client1 / client123
          <br />
          Admin: admin / admin123
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
