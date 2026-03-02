import React, { useMemo, useState } from 'react';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import AuthTopBar from '../../components/auth/AuthTopBar';
import camsvg from '../../assets/camsvg.svg';
import { useCreateAccountForm } from './hooks/useCreateAccountForm';
import './CreateAccountPage.css';

const COUNTRY_CODES = [
  { label: 'United Kingdom (+44)', value: '+44' },
  { label: 'United States (+1)', value: '+1' },
  { label: 'Germany (+49)', value: '+49' },
  { label: 'France (+33)', value: '+33' },
  { label: 'India (+91)', value: '+91' },
];

const stopNavigation: React.MouseEventHandler<HTMLAnchorElement> = (event) => {
  event.preventDefault();
};

const CreateAccountPage: React.FC = () => {
  const navigate = useNavigate();
  const form = useCreateAccountForm((email) => {
    navigate(`/verify-email?email=${encodeURIComponent(email)}`);
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const showPasswordHint = isPasswordFocused || form.password.length > 0;
  const showPasswordError = useMemo(
    () => form.visibleErrors.password && form.visibleErrors.password !== 'Password must be at least 8 characters',
    [form.visibleErrors.password],
  );

  return (
    <div className="create-account-page">
      <AuthTopBar />

      <div className="create-account-shell">
        <section className="create-account-left-pane" aria-label="Create account form panel">
          <div className="create-account-content">
            <Link to="/login" className="create-account-back-link">
              <ArrowLeft size={18} aria-hidden="true" />
              <span>Login</span>
            </Link>

            <p className="create-account-title">Create Account</p>
            <h1 className="create-account-hero">Join Us &amp; See More</h1>

            {form.formError && (
              <div className="create-account-error create-account-form-error" role="alert">
                {form.formError}
              </div>
            )}

            <form className="create-account-form" onSubmit={form.submit}>
              <div className="vrm-field create-account-field">
                <label className="vrm-label" htmlFor="create-username">Username</label>
                <input
                  id="create-username"
                  className="vrm-input"
                  autoComplete="username"
                  value={form.username}
                  onChange={(e) => form.setUsername(e.target.value)}
                  onBlur={() => form.markTouched('username')}
                  aria-invalid={Boolean(form.visibleErrors.username)}
                  aria-describedby={form.visibleErrors.username ? 'create-username-error' : undefined}
                />
                <div className="create-account-error-slot" aria-live="polite">
                  {form.visibleErrors.username && (
                    <div id="create-username-error" className="create-account-error">{form.visibleErrors.username}</div>
                  )}
                </div>
              </div>

              <div className="vrm-field create-account-field">
                <label className="vrm-label" htmlFor="create-email">Email</label>
                <input
                  id="create-email"
                  type="email"
                  className="vrm-input"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => form.setEmail(e.target.value)}
                  onBlur={() => form.markTouched('email')}
                  aria-invalid={Boolean(form.visibleErrors.email)}
                  aria-describedby={form.visibleErrors.email ? 'create-email-error' : undefined}
                />
                <div className="create-account-error-slot" aria-live="polite">
                  {form.visibleErrors.email && (
                    <div id="create-email-error" className="create-account-error">{form.visibleErrors.email}</div>
                  )}
                </div>
              </div>

              <div className="vrm-field create-account-field">
                <label className="vrm-label" htmlFor="create-country">Phone (optional)</label>
                <div className="create-account-phone-row">
                  <select
                    id="create-country"
                    className="vrm-input"
                    value={form.countryCode}
                    onChange={(e) => form.setCountryCode(e.target.value)}
                  >
                    {COUNTRY_CODES.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <input
                    className="vrm-input"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="Phone number"
                    value={form.phoneLocal}
                    onChange={(e) => form.setPhoneLocal(e.target.value.replace(/[^\d]/g, ''))}
                    onBlur={() => form.markTouched('phone')}
                    aria-invalid={Boolean(form.visibleErrors.phone)}
                    aria-describedby={form.visibleErrors.phone ? 'create-phone-error' : undefined}
                  />
                </div>
                <div className="create-account-error-slot" aria-live="polite">
                  {form.visibleErrors.phone && (
                    <div id="create-phone-error" className="create-account-error">{form.visibleErrors.phone}</div>
                  )}
                </div>
              </div>

              <div className="vrm-field create-account-field">
                <label className="vrm-label" htmlFor="create-password">Password</label>
                <div className="create-account-password-wrap">
                  <input
                    id="create-password"
                    type={showPassword ? 'text' : 'password'}
                    className="vrm-input create-account-password-input"
                    autoComplete="new-password"
                    value={form.password}
                    onFocus={() => setIsPasswordFocused(true)}
                    onBlur={() => {
                      setIsPasswordFocused(false);
                      form.markTouched('password');
                    }}
                    onChange={(e) => form.setPassword(e.target.value)}
                    aria-invalid={Boolean(showPasswordError)}
                    aria-describedby={[
                      showPasswordError ? 'create-password-error' : '',
                      showPasswordHint ? 'create-password-hint' : '',
                    ].filter(Boolean).join(' ') || undefined}
                  />
                  <button
                    type="button"
                    className="create-account-password-toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
                <div className="create-account-password-hint-slot" aria-live="polite">
                  {showPasswordHint && (
                    <div id="create-password-hint" className="create-account-hint">Use at least 8 characters.</div>
                  )}
                </div>
                <div className="create-account-error-slot" aria-live="polite">
                  {showPasswordError && (
                    <div id="create-password-error" className="create-account-error">{form.visibleErrors.password}</div>
                  )}
                </div>
              </div>

              <div className="vrm-field create-account-field">
                <label className="vrm-label" htmlFor="create-confirm-password">Confirm password</label>
                <div className="create-account-password-wrap">
                  <input
                    id="create-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="vrm-input create-account-password-input"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={(e) => form.setConfirmPassword(e.target.value)}
                    onBlur={() => form.markTouched('confirmPassword')}
                    aria-invalid={Boolean(form.visibleErrors.confirmPassword)}
                    aria-describedby={form.visibleErrors.confirmPassword ? 'create-confirm-password-error' : undefined}
                  />
                  <button
                    type="button"
                    className="create-account-password-toggle"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
                <div className="create-account-error-slot" aria-live="polite">
                  {form.visibleErrors.confirmPassword && (
                    <div id="create-confirm-password-error" className="create-account-error">{form.visibleErrors.confirmPassword}</div>
                  )}
                </div>
              </div>

              <div className="create-account-actions">
                <button className="vrm-btn vrm-btn-primary create-account-submit" type="submit" disabled={!form.canSubmit}>
                  {form.submitting ? 'Creating…' : 'Create Account'}
                </button>
              </div>

              <div className="create-account-legal" aria-label="Legal disclaimers">
                <p>
                  This site is protected by{' '}
                  <a href="#" onClick={stopNavigation}>reCAPTCHA</a>{' '}
                  and the Google{' '}
                  <a href="#" onClick={stopNavigation}>Privacy Policy</a>{' '}
                  and{' '}
                  <a href="#" onClick={stopNavigation}>Terms of Service</a>{' '}
                  apply.
                </p>
                <p>
                  By creating an account you comply to our{' '}
                  <a href="#" onClick={stopNavigation}>privacy policy</a>.{' '}
                  You can find the policy{' '}
                  <a href="#" onClick={stopNavigation}>here</a>
                </p>
              </div>
            </form>
          </div>
        </section>

        <aside className="create-account-right-pane" aria-label="System visual placeholder">
          <img
            src={camsvg}
            alt=""
            aria-hidden="true"
            focusable="false"
            className="auth-right-pane-overlay"
          />
        </aside>
      </div>
    </div>
  );
};

export default CreateAccountPage;
