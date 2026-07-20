import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, UsuarioDto } from '../api/client';
import { applyTheme } from '../types/profile';
import { cacheSessionUser, clearSessionUser, readSessionUser } from '../offline/cache';
import { isNative } from '../platform';
import { pendingCount } from '../offline/queue';

type AuthContextValue = {
  user: UsuarioDto | null;
  loading: boolean;
  login: (correo: string, contrasena: string) => Promise<string | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UsuarioDto | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const cached = readSessionUser();
    if (cached) {
      setUser(cached);
      if (cached.tema) applyTheme(cached.tema);
      setLoading(false);
    }

    try {
      const res = await api.me();
      if (res.ok && res.data) {
        setUser(res.data);
        cacheSessionUser(res.data);
        if (res.data.tema) applyTheme(res.data.tema);
      } else if (!cached) {
        setUser(null);
      }
    } catch {
      if (!cached) {
        setUser(null);
      }
    } finally {
      if (!cached) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (correo: string, contrasena: string) => {
    const res = await api.login(correo, contrasena);
    if (!res.ok || !res.data) return res.error || 'Error al iniciar sesión';
    setUser(res.data);
    cacheSessionUser(res.data);
    if (res.data.tema) applyTheme(res.data.tema);
    return null;
  }, []);

  const logout = useCallback(async () => {
    const pending = await pendingCount();
    if (
      pending > 0
      && !window.confirm(
        `Tienes ${pending} cambio(s) pendiente(s) de sincronizar. `
          + 'Si cierras sesión se conservarán, pero solo se enviarán cuando vuelvas a entrar con esta cuenta. ¿Continuar?',
      )
    ) {
      return;
    }
    if (navigator.onLine || isNative) {
      await api.logout();
    }
    clearSessionUser();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
