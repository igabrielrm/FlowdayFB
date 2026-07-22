import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import MuiThemeProvider from './theme/MuiThemeProvider';
import './styles.css';
import { applyTheme } from './types/profile';
import { isNative } from './platform';
import { hydrateOfflineState } from './offline/cache';

// Polyfill para sockjs-client (y libs Node-style) en el navegador
const g = globalThis as typeof globalThis & { global?: typeof globalThis };
if (typeof g.global === 'undefined') {
  g.global = g;
}

// Catch uncaught errors so the app shows something instead of a white screen
window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});

const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light' || savedTheme === 'dark') {
  applyTheme(savedTheme);
}

if (!isNative && !import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/app/' }).catch(() => {
      /* registro opcional en producción */
    });
  });
} else if (!isNative && import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

const Router = isNative ? HashRouter : BrowserRouter;
const routerProps = isNative ? {} : { basename: '/app' };

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <MuiThemeProvider>
        <Router {...routerProps}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </Router>
      </MuiThemeProvider>
    </React.StrictMode>,
  );
}

void hydrateOfflineState().catch((err) => {
  console.warn('hydrateOfflineState failed:', err);
});
renderApp();
