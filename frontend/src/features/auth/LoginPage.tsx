import { requestFetch, RequestFailure } from "./transport/me";
import React, { type FormEvent, useState, useCallback } from "react";

import { Link, useNavigate, useLocation } from "react-router-dom";
import AuthBottomNav from "../../components/auth/AuthBottomNav";
import {
  AuthDesktopArtwork,
  AuthLogoHeader,
} from "../../components/auth/AuthLogoHeader";
import AuthTopBar from "../../components/auth/AuthTopBar";
import { useIsPhoneLayout } from "../../common/hooks/useIsPhoneLayout";
import "./LoginPage.css";
import ProviderAuth from "./components/ProviderAuth";
import { isProviderRequired, type Provider } from "./transport/providerAuth";
import { type AuthUser } from "./transport/me";

interface LoginPageProps {
  onLogin: () => void | Promise<void>;
}

type LoginStep = "email" | "password";

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const isPhoneLayout = useIsPhoneLayout();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = (location.state as { message?: string } | null)
    ?.message;
  const {
    email,
    password,
    error,
    loading,
    providers,
    setEmail,
    setPassword,
    handleSubmit,
  } = useLoginForm(onLogin, (location.state as { email?: string } | null)?.email || "");

  const [step, setStep] = useState<LoginStep>("email");
  const [emailStepError, setEmailStepError] = useState<string | null>(null);
  const [staySignedIn, setStaySignedIn] = useState(true);

  const onPrimaryAction = async (event: React.FormEvent) => {
    event.preventDefault();

    if (step === "email") {
      if (!email.trim()) {
        setEmailStepError("This field is required");
        return;
      }
      setEmailStepError(null);
      setStep("password");
      return;
    }

    await handleSubmit(event);
  };

  const handleResetPasswordClick: React.MouseEventHandler<HTMLAnchorElement> = (event) => {
    event.preventDefault();
    navigate("/reset-password", { state: { email: email.trim() } });
  };

  return (
    <div className="login-page">
      {isPhoneLayout ? <AuthLogoHeader /> : <AuthTopBar />}

      <div className="login-shell">
        <section className="login-left-pane" aria-label="Login form panel">
          <div className="login-content">
            <h1 className="login-hero">Welcome Back</h1>
            {successMessage && (
              <p role="status" className="verify-email-message">
                {successMessage}
              </p>
            )}

            <ProviderAuth intent="login" disabled={loading} requiredProviders={providers.length ? providers : (location.state as { providers?: Provider[] } | null)?.providers} />

            <form className="login-form" onSubmit={onPrimaryAction}>
              <div className="vrm-field login-field">
                <label className="vrm-label" htmlFor="login-email">
                  Email
                </label>
                <input
                  id="login-email"
                  className="vrm-input"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailStepError) {
                      setEmailStepError(null);
                    }
                  }}
                  placeholder="Enter email"
                  autoComplete="email"
                  aria-invalid={Boolean(emailStepError)}
                  aria-describedby={
                    emailStepError ? "login-email-error" : undefined
                  }
                />
                <div className="login-error-slot" aria-live="polite">
                  {emailStepError && (
                    <div id="login-email-error" className="login-error">
                      {emailStepError}
                    </div>
                  )}
                </div>
              </div>

              {step === "password" && (
                <div className="vrm-field login-field">
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
                  />
                </div>
              )}

              {error && step === "password" && (
                <div
                  className="vrm-status vrm-status-warning login-request-error"
                  role="alert"
                  aria-live="assertive"
                >
                  {error}
                </div>
              )}

              <div className="login-actions">
                <button
                  type="submit"
                  className="vrm-btn vrm-btn-primary login-submit"
                  disabled={loading}
                >
                  {step === "email"
                    ? "Continue"
                    : loading
                      ? "Signing in…"
                      : "Login"}
                </button>
              </div>

              <div className="login-under-cta">
                <label
                  className="login-utility-row login-checkbox-row"
                  htmlFor="login-stay-signed-in"
                >
                  <input
                    id="login-stay-signed-in"
                    type="checkbox"
                    checked={staySignedIn}
                    onChange={(event) => setStaySignedIn(event.target.checked)}
                  />
                  <span>Stay signed-in</span>
                </label>

                <p className="login-utility-row login-muted-row">
                  Don’t have an account yet?{" "}
                  <Link to="/create-account" className="login-inline-link">
                    Sign up
                  </Link>
                </p>

                {step === "password" && (
                  <p className="login-utility-row login-muted-row">
                    Forgot your password?{" "}
                    <a
                      href="#"
                      onClick={handleResetPasswordClick}
                      className="login-inline-link"
                    >
                      Reset password
                    </a>
                  </p>
                )}
              </div>
            </form>
          </div>
        </section>

        <aside className="login-right-pane" aria-hidden="true">
          <AuthDesktopArtwork />
        </aside>
      </div>

      {isPhoneLayout ? <AuthBottomNav /> : null}
    </div>
  );
};

export default LoginPage;

type UseLoginFormResult = {
  email: string;
  password: string;
  error: string | null;
  loading: boolean;
  providers: Provider[];
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  handleSubmit: (event: FormEvent) => Promise<void>;
};

const useLoginForm = (
  onLogin: () => void | Promise<void>,
  initialEmail: string,
): UseLoginFormResult => {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setLoading(true);
      setError(null);

      try {
        const result = await login(email, password);
        if (result.ok) {
          await onLogin();
        } else if (isProviderRequired(result.data)) {
          setProviders(result.data.providers); setPassword("");
          setError("Please sign in with your provider.");
        } else if (result.status === 401) {
          setError("Invalid email or password");
        } else {
          setError("Unable to complete request. Please try again.");
        }
      } catch {
        setError("Unable to complete request. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [email, onLogin, password],
  );

  return {
    email,
    password,
    error,
    loading,
    providers,
    setEmail: value => { setEmail(value); setProviders([]); setError(null); },
    setPassword,
    handleSubmit,
  };
};

type LoginResponse = {
  user: AuthUser;
};

type LoginResult =
  { ok: true; data: LoginResponse } | { ok: false; status: number; data: unknown };

const login = async (
  email: string,
  password: string,
): Promise<LoginResult> => {
  const response = await requestFetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "camOS",
    },
    credentials: "include",
    body: JSON.stringify({ email: email.trim(), password }),
  });

  if (!response.ok) {
    return { ok: false, status: response.status, data: await response.json().catch(() => null) };
  }

  const data = (await response.json()) as LoginResponse;
  return { ok: true, data };
};
