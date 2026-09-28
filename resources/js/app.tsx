/**
 * app.tsx: the routes.
 *
 * Three of them. The workspace is behind RequireAuth, and everything else a signed-in user
 * reaches is a panel or a dialog inside that shell rather than a page of its own, which is
 * what keeps the tree, the sort and the search from being re-mounted by navigation.
 */

import type { JSX } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Workspace from './pages/Workspace';

/** Full-screen placeholder while the session check is in flight. */
function Booting(): JSX.Element {
  return (
    <div className="empty-state empty-state--big">
      <span className="empty-state__mark" aria-hidden="true">
        X
      </span>
      <p>Opening your notebook...</p>
    </div>
  );
}

/**
 * The guard. While the session is unknown it shows the boot state rather than the form, so
 * a reload on / never flashes the sign-in screen at a user who is already signed in.
 */
function RequireAuth({ children }: { children: JSX.Element }): JSX.Element {
  const { user, booting, bootError } = useAuth();
  const location = useLocation();

  if (booting) return <Booting />;
  if (!user) {
    // The session check failed for a reason that is not "signed out". Saying so here is the
    // difference between a reader who retries and a reader who thinks their notes are gone.
    if (bootError) {
      return (
        <div className="empty-state empty-state--big">
          <span className="empty-state__mark" aria-hidden="true">
            X
          </span>
          <p className="empty-state__body" role="alert">
            {bootError}
          </p>
          <div className="empty-state__actions">
            <a className="btn btn--primary" href="/login">
              Sign in
            </a>
          </div>
        </div>
      );
    }
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/** A signed-in user has no business on the sign-in form. */
function RedirectIfSignedIn({ children }: { children: JSX.Element }): JSX.Element {
  const { user, booting } = useAuth();
  if (booting) return <Booting />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfSignedIn>
            <Login />
          </RedirectIfSignedIn>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfSignedIn>
            <Register />
          </RedirectIfSignedIn>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Workspace />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
