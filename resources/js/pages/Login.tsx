/**
 * pages/Login.tsx: the sign-in screen.
 *
 * Two halves. What the notebook is on the left, in the app's own vocabulary (workspaces,
 * folders, notes, files, the vault) rather than in marketing words, because this is the only
 * screen that has to explain the product to someone who is not inside it yet. The one thing
 * to do on the right. Below 880px the left half steps aside and the form is the whole page.
 *
 * The form keeps the app's field language: label above, control, then the message. The error
 * copy never says which half of a pair was wrong, and the two failure shapes are told apart
 * by what the reader can do about them: a throttle is a wait, anything else is a retry.
 */

import { useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import Icon from '../components/Icon';
import type { IconName } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface LocationState {
  from?: string;
}

/** What the notebook holds. Each line names a part of the app, not a promise about it. */
const PARTS: { icon: IconName; name: string; text: string }[] = [
  { icon: 'layers', name: 'Workspaces', text: 'keep separate notebooks apart.' },
  { icon: 'folder', name: 'Folders and notes', text: 'nest as deep as the work does.' },
  { icon: 'file', name: 'Files', text: 'attach to a folder or a note, and stream back on request.' },
  { icon: 'database', name: 'The vault', text: 'seals a note body in this browser, before it is sent.' },
];

export default function Login(): JSX.Element {
  const { signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
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
        if (Object.keys(next).length) {
          // The server named the field, so the field carries the message.
          setError(null);
        } else if (thrown.status === 429) {
          setError('Too many attempts from here. Wait a minute, then try again.');
        } else {
          setError(thrown.message);
        }
      } else {
        setError(thrown instanceof Error ? thrown.message : 'Sign in failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth auth--split">
      <aside className="auth__aside">
        <div className="auth__brand">
          <span className="topbar__logo" aria-hidden="true">
            X
          </span>
          <span className="topbar__name">Xave</span>
        </div>

        <div>
          <h2 className="auth__aside-title">Everything you keep, in one notebook.</h2>
          <p className="auth__aside-sub">
            Workspaces, folders, notes, files and tasks in one place, and a vault that seals a
            note in this browser.
          </p>
        </div>

        <ul className="auth__facts">
          {PARTS.map((part) => (
            <li key={part.name}>
              <Icon name={part.icon} size={15} />
              <span>
                <strong>{part.name}</strong> {part.text}
              </span>
            </li>
          ))}
        </ul>

        <p className="auth__aside-foot">
          Each account keeps its own notebooks. Nothing here is shared with another account.
        </p>
      </aside>

      <main className="auth__card">
        <h1 className="auth__title">Sign in</h1>
        <p className="auth__sub">Use the email and password this notebook was created with.</p>

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
                aria-invalid={fields['email'] ? true : undefined}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {fields['email'] ? (
              <p className="field__message field__message--error" role="alert">
                <Icon name="warning" size={12} />
                {fields['email']}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="login-password">
              Password
            </label>
            <div className="field__control auth__field">
              <input
                id="login-password"
                className="field__input"
                type={reveal ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                aria-invalid={fields['password'] ? true : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                className="icon-btn icon-btn--sm auth__reveal"
                type="button"
                aria-pressed={reveal}
                aria-label={reveal ? 'Hide password' : 'Show password'}
                title={reveal ? 'Hide password' : 'Show password'}
                onClick={() => setReveal((current) => !current)}
              >
                <Icon name="eye" size={15} />
              </button>
            </div>
            {fields['password'] ? (
              <p className="field__message field__message--error" role="alert">
                <Icon name="warning" size={12} />
                {fields['password']}
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="field__message field__message--error" role="alert">
              <Icon name="warning" size={12} />
              {error}
            </p>
          ) : null}

          <button className="btn btn--primary auth__submit" type="submit" disabled={busy}>
            {busy ? (
              <>
                <Icon name="spinner" size={14} />
                <span>Signing in...</span>
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="auth__note">
          No account yet? <Link to="/register">Create one</Link>.
        </p>
      </main>
    </div>
  );
}
