/**
 * main.tsx: the entry point Vite builds and app.blade.php mounts.
 *
 * The provider order is load-bearing. Auth is what the API client's 401 rule talks to, and
 * Preferences reads the signed-in user's stored settings, so Preferences sits inside Auth;
 * both of them report failures through Toast, so Toast is outside both.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app';
import { AuthProvider } from './context/AuthContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { ToastProvider } from './context/ToastContext';

const host = document.getElementById('app');

if (!host) {
  throw new Error('The application mount point #app is missing from the page.');
}

createRoot(host).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <PreferencesProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </PreferencesProvider>
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
);
