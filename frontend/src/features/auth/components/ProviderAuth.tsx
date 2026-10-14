import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AccessDialog from "../../../common/components/AccessDialog";
import {
  AuthRequestError,
  providerRequest,
  type Provider,
} from "../transport/providerAuth";
import "./ProviderAuth.css";

const names = { google: "Google", microsoft: "Microsoft" };
const messages: Record<string, string> = {
  "provider-cancelled": "Sign-in cancelled.",
  "signup-required": "Create an account first to continue.",
  "provider-expired": "This request expired. Please restart sign-in.",
  "provider-email": "Your provider did not supply a usable email address.",
  "provider-error": "Unable to sign in. Please try again.",
  "provider-unavailable": "Provider sign-in is unavailable right now.",
  "provider-conflict":
    "Unable to connect this account. Please restart sign-in.",
  "provider-required": "Please sign in with your provider.",
};

type Props = {
  intent: "login" | "signup";
  requiredProviders?: Provider[];
  disabled?: boolean;
  staySignedIn?: boolean;
};
export default function ProviderAuth({
  intent,
  requiredProviders = [],
  disabled = false,
  staySignedIn = true,
}: Props) {
  const location = useLocation(),
    navigate = useNavigate();
  const marker = new URLSearchParams(location.search).get("auth") || "";
  const verifying = intent === "signup" && marker === "verify-provider-email";
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Provider | null>(null);
  const [linked, setLinked] = useState<Provider | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const inFlight = useRef(false);
  const focusTarget = useRef<HTMLButtonElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    setError(null);
    setMessage(messages[marker] || null);
    setLinked(null);
    if (marker === "confirm-provider") {
      providerRequest<{ provider: Provider }>("link")
        .then((value) => {
          if (current) {
            focusTarget.current?.focus();
            setLinked(value.provider);
          }
        })
        .catch(() => {
          if (current)
            setError("This request expired. Please restart sign-in.");
        });
    } else if (marker === "provider-required") {
      providerRequest<{ providers: Provider[] }>("result")
        .then((value) => {
          if (current) setProviders(value.providers);
        })
        .catch(() => {});
    } else if (verifying) {
      providerRequest<{ email: string; resendCooldownSeconds: number }>(
        "signup",
      )
        .then((value) => {
          if (current) {
            setEmail(value.email);
            setCooldown(value.resendCooldownSeconds);
            setMessage(
              new URLSearchParams(location.search).get("mail") === "unavailable"
                ? "Unable to send the code. Please try resend."
                : "We sent a verification code to your email.",
            );
            codeInput.current?.focus();
          }
        })
        .catch(() => {
          if (current) setError("This request expired. Please restart signup.");
        });
    }
    return () => {
      current = false;
    };
  }, [marker, verifying, location.search]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const perform = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to complete sign-in. Please try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      setActive(null);
    }
  };

  const start = (provider: Provider) =>
    perform(async () => {
      setActive(provider);
      try {
        const value = await providerRequest<{ authorization_url: string }>(
          `${provider}/start`,
          "POST",
          { intent, stay_signed_in: intent === "login" ? staySignedIn : true },
        );
        const url = new URL(value.authorization_url);
        const host =
          provider === "google"
            ? "accounts.google.com"
            : "login.microsoftonline.com";
        if (url.protocol !== "https:" || url.hostname !== host)
          throw new Error("Unable to start sign-in.");
        window.location.assign(value.authorization_url);
      } catch (failure) {
        if (failure instanceof AuthRequestError && failure.status === 503)
          throw new Error(
            `${names[provider]} sign-in is unavailable right now.`,
          );
        throw failure;
      }
    });

  const cancelLink = () =>
    perform(async () => {
      await providerRequest("link", "DELETE");
      setLinked(null);
      setPassword("");
      navigate(intent === "signup" ? "/create-account" : "/login", {
        replace: true,
      });
    });
  const confirm = (event: FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError("Enter your camOS password.");
      return;
    }
    void perform(async () => {
      await providerRequest("link", "POST", { password });
      window.location.assign("/home");
    });
  };
  const verify = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter your 6-digit verification code.");
      return;
    }
    void perform(async () => {
      await providerRequest("signup/verify", "POST", { code });
      window.location.assign("/home");
    });
  };

  if (verifying)
    return (
      <section
        className="provider-verification"
        aria-label="Verify Microsoft signup email"
      >
        <p className="provider-auth-message">
          Enter the 6-digit code
          {email ? ` sent to ${email}` : " sent to your email"}.
        </p>
        <form
          className="provider-auth-code-form"
          onSubmit={verify}
          aria-busy={busy}
        >
          <label className="vrm-label" htmlFor="provider-email-code">
            Verification code
          </label>
          <input
            ref={codeInput}
            id="provider-email-code"
            className="vrm-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            disabled={busy}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "provider-auth-error" : undefined}
          />
          {error && (
            <p
              id="provider-auth-error"
              className="provider-auth-error"
              role="alert"
            >
              {error}
            </p>
          )}
          {message && (
            <p className="provider-auth-message" role="status">
              {message}
            </p>
          )}
          <button className="vrm-btn vrm-btn-primary" disabled={busy || !email}>
            {busy ? "Verifying…" : "Verify email"}
          </button>
          <div className="provider-auth-secondary-actions">
            <button
              type="button"
              className="provider-auth-text-button"
              disabled={busy || cooldown > 0 || !email}
              onClick={() =>
                void perform(async () => {
                  const value = await providerRequest<{
                    resendCooldownSeconds: number;
                  }>("signup/resend", "POST");
                  setCooldown(value.resendCooldownSeconds);
                  setMessage("A new verification code was sent.");
                })
              }
            >
              {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
            <button
              type="button"
              className="provider-auth-text-button"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await providerRequest("signup", "DELETE");
                  navigate("/create-account", { replace: true });
                })
              }
            >
              Start over
            </button>
          </div>
        </form>
      </section>
    );

  const preferred = requiredProviders.length ? requiredProviders : providers;
  return (
    <div className="provider-auth">
      {!linked && error && (
        <p className="provider-auth-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="provider-auth-message" role="status">
          {message}
          {marker === "signup-required" && (
            <>
              {" "}
              <Link to="/create-account">Create account</Link>
            </>
          )}
        </p>
      )}
      <div
        className="provider-auth-buttons"
        aria-label={
          intent === "signup"
            ? "Create account with a provider"
            : "Sign in with a provider"
        }
      >
        {(["google", "microsoft"] as const).map((provider, index) => (
          <button
            key={provider}
            ref={index === 0 ? focusTarget : undefined}
            type="button"
            className={`provider-auth-button${preferred.includes(provider) ? " provider-auth-button--preferred" : ""}`}
            disabled={disabled || busy}
            aria-busy={busy && active === provider}
            onClick={() => void start(provider)}
          >
            <img
              src={`/static/auth/${`${provider}.svg`}`}
              alt=""
              width={20}
              height={20}
              aria-hidden="true"
            />
            <span>
              {busy && active === provider
                ? "Connecting…"
                : `Continue with ${names[provider]}`}
            </span>
          </button>
        ))}
      </div>
      <div className="provider-auth-divider" aria-hidden="true">
        <span>or</span>
      </div>
      {linked && (
        <AccessDialog
          title="Confirm your account"
          description={`Enter your camOS password to connect ${names[linked]}.`}
          className="provider-link-dialog"
          busy={busy}
          onClose={() => void cancelLink()}
        >
          <form className="settings-form-grid" onSubmit={confirm}>
            <label
              className="settings-form-label"
              htmlFor="provider-link-password"
            >
              Password
            </label>
            <input
              data-autofocus
              id="provider-link-password"
              className="settings-input"
              type="password"
              autoComplete="current-password"
              maxLength={1024}
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "provider-link-error" : undefined}
            />
            {error && (
              <p
                id="provider-link-error"
                className="settings-form-error"
                role="alert"
              >
                {error}
              </p>
            )}
            <div className="settings-form-actions">
              <button
                type="button"
                className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                disabled={busy}
                onClick={() => void cancelLink()}
              >
                Cancel
              </button>
              <button
                className="vrm-btn vrm-btn-primary vrm-btn-sm"
                disabled={busy}
              >
                {busy ? "Connecting…" : "Continue"}
              </button>
            </div>
          </form>
        </AccessDialog>
      )}
    </div>
  );
}
