import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { firebaseClient, formatUser } from '../firebase/client';
import * as firebaseData from '../firebase/data';
import { saveUserProfile } from '../firebase/community';
import { type UsuarioDto } from '../api/client';
import { applyTheme } from '../types/profile';
import { cacheSessionUser, clearSessionUser } from '../offline/cache';

type AuthContextValue = {
  user: UsuarioDto | null;
  loading: boolean;
  login: (correo: string, contrasena: string) => Promise<string | null>;
  loginWithGoogle: () => Promise<string | null>;
  continueAsGuest: () => Promise<string | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UsuarioDto | null>(null);
  const [loading, setLoading] = useState(true);

  // Escuchar cambios de autenticación de Firebase
  useEffect(() => {
    let unsub: (() => void) | null = null;

    firebaseClient.onAuthStateChanged(async (authUser) => {
      if (!authUser) {
        setUser(null);
        clearSessionUser();
        setLoading(false);
        return;
      }

      try {
        // Mapear usuario de Firebase a DTO
        const formatted = formatUser(authUser);
        if (!formatted) {
          setUser(null);
          setLoading(false);
          return;
        }
        const userDto: UsuarioDto = {
          id: formatted.uid,
          nombre: formatted.nombre,
          correo: formatted.correo,
          rol: 'USER',
          tema: 'dark',
        };

        // Asegurar que el documento de usuario existe en Firestore
        if (formatted.correo || !authUser.isAnonymous) {
          await firebaseData.getProfile().catch(() => null);
        }
        // Guardar/actualizar usuario en la colección users para visibilidad en chat/comunidad
        if (!authUser.isAnonymous) {
          await saveUserProfile(authUser.uid, {
            nombre: formatted.nombre,
            correo: formatted.correo,
            foto: formatted.foto,
          }).catch(() => null);
        }

        setUser(userDto);
        cacheSessionUser(userDto);
        if (userDto.tema) applyTheme(userDto.tema);
      } catch (error) {
        console.error('Error loading user profile:', error);
        const formatted = formatUser(authUser);
        if (!formatted) {
          setUser(null);
          setLoading(false);
          return;
        }
        const fallback: UsuarioDto = {
          id: formatted.uid,
          nombre: formatted.nombre,
          correo: formatted.correo,
          rol: 'USER',
        };
        setUser(fallback);
      } finally {
        setLoading(false);
      }
    }).then((fn) => {
      unsub = fn;
    });

    return () => {
      unsub?.();
    };
  }, []);

  const login = useCallback(async (correo: string, contrasena: string) => {
    try {
      const userCredential = await firebaseClient.signInWithEmail(correo, contrasena);
      const formatted = formatUser(userCredential.user);
      if (formatted) return null;
      return 'Error al iniciar sesión';
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'auth/wrong-password') return 'Correo o contraseña incorrectos.';
      if (err.code === 'auth/user-not-found') return 'No existe una cuenta con ese correo.';
      return String(err.message || 'Error al iniciar sesión');
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    try {
      const userCredential = await firebaseClient.signInWithGoogle();
      const formatted = formatUser(userCredential.user);
      if (formatted) return null;
      return 'Error al iniciar sesión con Google';
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'auth/popup-closed-by-user') return 'Inicio de sesión cancelado.';
      return String(err.message || 'Error al iniciar sesión con Google');
    }
  }, []);

  const continueAsGuest = useCallback(async () => {
    try {
      await firebaseClient.signInAnonymously();
      const current = formatUser(firebaseClient.auth.currentUser);
      if (current) return null;
      return 'No se pudo continuar como invitado';
    } catch (error: unknown) {
      return String((error as Error).message || 'No se pudo continuar como invitado.');
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await firebaseClient.signOut();
      await firebaseClient.signInAnonymously();
      clearSessionUser();
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, loginWithGoogle, continueAsGuest, logout }),
    [user, loading, login, loginWithGoogle, continueAsGuest, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

