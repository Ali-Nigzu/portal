import React, { useState } from 'react';

import { Credentials } from '../types/credentials';
import { deriveOrgIdFromTableName, determineOrgId } from '../lib/org';
import { companyLogoDataUri } from '../assets/companyLogo';

interface LoginPageProps {
  onLogin: (credentials: Credentials) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        const orgFromResponse =
          data?.user?.orgId ??
          data?.user?.org_id ??
          deriveOrgIdFromTableName(data?.user?.table_name);

        onLogin({
          username,
          password,
          orgId: orgFromResponse ?? determineOrgId({ username }),
        });
      } else if (response.status === 401) {
        setError('Invalid username or password');
      } else {
        setError('Connection error. Please try again.');
      }
    } catch (err) {
      setError('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vrm-auth-shell">
      <div className="vrm-auth-card" role="dialog" aria-labelledby="camOS-login-title">
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
              onChange={(e) => setUsername(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
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
              style={{ width: '100%' }}
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Login'}
            </button>
          </div>
        </form>
        <div className="vrm-auth-hint">
          <strong>Demo credentials</strong>
          <br />
          Client: client1 / client123 <br />
          Admin: admin / admin123
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
