import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isNative } from '../platform';
import { exchangeNativeOAuthCode } from '../auth/nativeAuth';
import { useAuth } from '../auth/AuthContext';
import { THEME_EVENT } from '../theme/MuiThemeProvider';

function applyStatusBarForTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  // Capacitor: Style.Dark = light icons (dark bg); Style.Light = dark icons (light bg).
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
  StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => undefined);
}

export default function NativeAppBridge() {
  const { refresh } = useAuth();

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
        const code = parsed.searchParams.get('code');
        if (code) {
          const exchanged = await exchangeNativeOAuthCode(code);
          await Browser.close().catch(() => undefined);
          if (exchanged) {
            await refresh();
            window.location.hash = '/';
          } else {
            window.location.hash = '/login?error=oauth_exchange';
          }
          return;
        }
        const error = parsed.searchParams.get('error');
        if (error) {
          await Browser.close().catch(() => undefined);
          window.location.hash = `/login?error=${encodeURIComponent(error)}`;
          return;
        }
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
  }, [refresh]);

  return null;
}
