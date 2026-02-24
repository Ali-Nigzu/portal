import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateAccountForm } from './hooks/useCreateAccountForm';
import './CreateAccountPage.css';

const COUNTRY_CODES = [
  { label: 'United Kingdom (+44)', value: '+44' },
  { label: 'United States (+1)', value: '+1' },
  { label: 'Germany (+49)', value: '+49' },
  { label: 'France (+33)', value: '+33' },
  { label: 'India (+91)', value: '+91' },
];

const CreateAccountPage: React.FC = () => {
  const navigate = useNavigate();
  const form = useCreateAccountForm(() => navigate('/dashboard'));

  return (
    <div className="create-account-shell">
      <section className="create-account-form-pane" aria-label="Create account form panel">
        <div className="create-account-card">
          <h1 className="create-account-title">Create Account</h1>
          <p className="create-account-subtitle">Set up your account access.</p>
          {form.formError && (
            <div className="create-account-error" role="alert">{form.formError}</div>
          )}
          <form className="create-account-form" onSubmit={form.submit}>
            <div className="vrm-field">
              <label className="vrm-label" htmlFor="create-name">Name</label>
              <input id="create-name" className="vrm-input" value={form.name} onChange={(e) => form.setName(e.target.value)} />
              {form.fieldErrors.name && <div className="create-account-error">{form.fieldErrors.name}</div>}
            </div>

            <div className="vrm-field">
              <label className="vrm-label" htmlFor="create-email">Email</label>
              <input id="create-email" type="email" className="vrm-input" value={form.email} onChange={(e) => form.setEmail(e.target.value)} />
              {form.fieldErrors.email && <div className="create-account-error">{form.fieldErrors.email}</div>}
            </div>

            <div className="vrm-field">
              <label className="vrm-label" htmlFor="create-country">Phone (optional)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 8 }}>
                <select id="create-country" className="vrm-input" value={form.countryCode} onChange={(e) => form.setCountryCode(e.target.value)}>
                  {COUNTRY_CODES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <input className="vrm-input" inputMode="tel" placeholder="Phone number" value={form.phoneLocal} onChange={(e) => form.setPhoneLocal(e.target.value.replace(/[^\d]/g, ''))} />
              </div>
              {form.fieldErrors.phone && <div className="create-account-error">{form.fieldErrors.phone}</div>}
            </div>

            <div className="vrm-field">
              <label className="vrm-label" htmlFor="create-password">Password</label>
              <input id="create-password" type="password" className="vrm-input" value={form.password} onChange={(e) => form.setPassword(e.target.value)} />
              {form.fieldErrors.password && <div className="create-account-error">{form.fieldErrors.password}</div>}
            </div>

            <div className="vrm-field">
              <label className="vrm-label" htmlFor="create-confirm-password">Confirm password</label>
              <input id="create-confirm-password" type="password" className="vrm-input" value={form.confirmPassword} onChange={(e) => form.setConfirmPassword(e.target.value)} />
              {form.fieldErrors.confirmPassword && <div className="create-account-error">{form.fieldErrors.confirmPassword}</div>}
            </div>

            <div className="create-account-actions">
              <button className="vrm-btn vrm-btn-primary" type="submit" disabled={!form.canSubmit}>
                {form.submitting ? 'Creating account…' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </section>
      <aside className="create-account-right-pane" aria-label="System visual placeholder" />
    </div>
  );
};

export default CreateAccountPage;
