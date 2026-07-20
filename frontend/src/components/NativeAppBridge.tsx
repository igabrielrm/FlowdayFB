import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isNative } from '../platform';
import { useAuth } from '../auth/AuthContext';
import { THEME_EVENT } from '../theme/MuiThemeProvider';

function applyStatusBarForTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
  StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => undefined);
}

export default function NativeAppBridge() {
  const { user } = useAuth();

  useEffect(() => {
    if (!isNative) return;

    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);
    applyStatusBarForTheme();

    const onTheme = () => applyStatusBarForTheme();
    window.addEventListener(THEME_EVENT, onTheme);

    const backListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const route = window.location.hash.replace(/^#/, '') || '/';
      if (canGoBack && route !== '/' && route !== '/login') {
        window.history.back();
      } else {
        CapacitorApp.exitApp();
      }
    });

    const urlListener = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      try {
        const parsed = new URL(url);
        const route = parsed.searchParams.get('route');
        if (route?.startsWith('/')) {
          window.location.hash = route;
        }
      } catch {
        // Ignore malformed deep links.
      }
    });

    return () => {
      window.removeEventListener(THEME_EVENT, onTheme);
      backListener.then((listener) => listener.remove());
      urlListener.then((listener) => listener.remove());
    };
  }, [user, isNative]);

  return null;
}

