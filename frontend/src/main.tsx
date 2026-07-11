import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import MuiThemeProvider from './theme/MuiThemeProvider';
import './styles.css';
import { applyTheme } from './types/profile';

// Polyfill para sockjs-client (y libs Node-style) en el navegador
const g = globalThis as typeof globalThis & { global?: typeof globalThis };
if (typeof g.global === 'undefined') {
  g.global = g;
}

const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light' || savedTheme === 'dark') {
  applyTheme(savedTheme);
}

if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* registro opcional en producción */
    });
  });
} else if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MuiThemeProvider>
      <BrowserRouter basename="/app">
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </MuiThemeProvider>
  </React.StrictMode>,
);
