/**
 * pages/Register.tsx: the account form.
 *
 * The server throttles this route at six attempts a minute, so a 429 has to read as a wait
 * rather than as a broken form. Everything else is the login form's shape, with one more
 * field and one more rule: the two passwords have to match before anything is sent.
 */

import { useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const MIN_PASSWORD = 8;

export default function Register(): JSX.Element {
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setFields({});

    const local: Record<string, string> = {};
    if (!name.trim()) local['name'] = 'Enter your name.';
    if (!email.trim()) local['email'] = 'Enter your email.';
    if (password.length < MIN_PASSWORD) local['password'] = 'Use at least ' + MIN_PASSWORD + ' characters.';
    if (password !== confirm) local['password_confirmation'] = 'The two passwords do not match.';
    if (Object.keys(local).length) {
      setFields(local);
      return;
    }

    setBusy(true);
    try {
      await signUp({
        name: name.trim(),
        email: email.trim(),
        password,
        password_confirmation: confirm,
      });
      toast('Welcome to Notebook.', 'success');
      navigate('/', { replace: true });
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
        setError(thrown instanceof Error ? thrown.message : 'That account could not be created.');
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
        <h1 className="auth__title">Create an account</h1>
        <p className="auth__sub">Notes, folders and tasks in one workspace.</p>

        <form className="auth__form" onSubmit={(event) => void submit(event)} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="register-name">
              Name
            </label>
            <div className="field__control">
              <input
                id="register-name"
                className="field__input"
                type="text"
                name="name"
                autoComplete="name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {fields['name'] ? <p className="field__message field__message--error">{fields['name']}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="register-email">
              Email
            </label>
            <div className="field__control">
              <input
                id="register-email"
                className="field__input"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {fields['email'] ? <p className="field__message field__message--error">{fields['email']}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="register-password">
              Password
            </label>
            <div className="field__control">
              <input
                id="register-password"
                className="field__input"
                type="password"
                name="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {fields['password'] ? (
              <p className="field__message field__message--error">{fields['password']}</p>
            ) : (
              <p className="field__message">At least {MIN_PASSWORD} characters.</p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="register-confirm">
              Confirm password
            </label>
            <div className="field__control">
              <input
                id="register-confirm"
                className="field__input"
                type="password"
                name="password_confirmation"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            {fields['password_confirmation'] ? (
              <p className="field__message field__message--error">{fields['password_confirmation']}</p>
            ) : null}
          </div>

          {error ? (
            <p className="field__message field__message--error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <p className="auth__note">
          Already have an account? <Link to="/login">Sign in</Link>.
        </p>
      </main>
    </div>
  );
}
