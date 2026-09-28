/**
 * pages/Login.tsx: the sign-in form.
 *
 * It is deliberately plain: the cookie session means there is nothing here but an email, a
 * password and the answer. Field errors land under the field the server named, and anything
 * without a field lands above the button, which is where the eye already is.
 */

import { useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface LocationState {
  from?: string;
}

export default function Login(): JSX.Element {
  const { signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setFields({});
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      toast('Signed in.', 'success');
      navigate(from === '/login' ? '/' : from, { replace: true });
    } catch (thrown) {
      if (thrown instanceof ApiError) {
        const next: Record<string, string> = {};
        Object.keys(thrown.fields).forEach((field) => {
          const first = thrown.fieldError(field);
          if (first) next[field] = first;
        });
        setFields(next);
        setError(Object.keys(next).length ? null : thrown.message);
      } else {
        setError(thrown instanceof Error ? thrown.message : 'Sign in failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <main className="auth__card">
        <div className="auth__brand">
          <span className="topbar__logo" aria-hidden="true">
            NB
          </span>
          <span className="topbar__name">Notebook</span>
        </div>
        <h1 className="auth__title">Sign in</h1>
        <p className="auth__sub">Your notebooks are waiting where you left them.</p>

        <form className="auth__form" onSubmit={(event) => void submit(event)} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="login-email">
              Email
            </label>
            <div className="field__control">
              <input
                id="login-email"
                className="field__input"
                type="email"
                name="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {fields['email'] ? <p className="field__message field__message--error">{fields['email']}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="login-password">
              Password
            </label>
            <div className="field__control">
              <input
                id="login-password"
                className="field__input"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {fields['password'] ? (
              <p className="field__message field__message--error">{fields['password']}</p>
            ) : null}
          </div>

          {error ? (
            <p className="field__message field__message--error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="auth__note">
          No account yet? <Link to="/register">Create one</Link>.
        </p>
      </main>
    </div>
  );
}
