export type UsuarioDto = {
  id: number | string;
  nombre: string;
  correo: string | null;
  rol: string;
  tema?: string;
  foto?: string;
};

export type ApiResponse<T> = {
  ok: boolean;
  data: T | null;
  error: string | null;
  meta?: Record<string, unknown>;
};

import type { ActividadDetail, ActividadListItem, CreateActividadPayload, PriorityAlert, ReschedulableItem, UpdateActividadPayload } from '../types/activity';
import type { NotificationItem } from '../notifications/types';
import type { Profile, UpdateProfilePayload } from '../types/profile';
import type { CommunityStats, CommunityUser } from '../types/community';
import type { CreateScheduleBlockPayload, ScheduleAlert, ScheduleBlock } from '../types/schedule';
import type { ChatMessage, Conversation } from '../types/chat';
import type { Note } from '../types/note';
import type { AdminAnnouncement, AdminStats, AdminTopUser, AdminUser, AdminWellbeing } from '../types/admin';
import type { StressReport, WellbeingStats } from '../types/wellbeing';
import {
  cacheApiGet,
  cacheSessionUser,
  isBrowserOffline,
  readApiGet,
} from '../offline/cache';
import * as firebaseData from '../firebase/data';
import { firebaseClient, formatUser } from '../firebase/client';

const OFFLINE_MSG = 'Sin conexión. Usa tus datos locales o conecta tu cuenta para respaldo en la nube.';

function ok<T>(data: T | null, meta?: Record<string, unknown>): ApiResponse<T> {
  return { ok: true, data, error: null, meta };
}

function fail<T>(error: string): ApiResponse<T> {
  return { ok: false, data: null, error };
}

function cachedResponse<T>(path: string, errorMsg: string): ApiResponse<T> {
  const cached = readApiGet<T>(path);
  if (cached != null) return ok(cached, { offline: true });
  return fail(errorMsg);
}

function mapFirebaseUser(user: ReturnType<typeof formatUser> | null): UsuarioDto | null {
  if (!user) return null;
  return {
    id: user.uid,
    nombre: user.nombre,
    correo: user.correo,
    rol: 'USER',
    foto: user.foto ?? undefined,
  };
}

async function ensureAuthUser() {
  const authUser = firebaseClient.auth.currentUser;
  if (!authUser) {
    await firebaseClient.signInAnonymously();
  }
}

export const api = {
  me: async () => {
    await ensureAuthUser();
    const current = formatUser(firebaseClient.auth.currentUser);
    const user = mapFirebaseUser(current);
    if (!user) return fail<UsuarioDto>('No hay sesión activa');
    cacheSessionUser(user);
    return ok(user);
  },

  login: async (correo: string, contrasena: string) => {
    try {
      const userCredential = await firebaseClient.signInWithEmail(correo, contrasena);
      const user = mapFirebaseUser(formatUser(userCredential.user));
      return user ? ok(user) : fail<UsuarioDto>('No se pudo iniciar sesión.');
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const message = err.code === 'auth/wrong-password'
        ? 'Correo o contraseña incorrectos.'
        : err.code === 'auth/user-not-found'
          ? 'No existe una cuenta con ese correo.'
          : String(err.message || 'No se pudo iniciar sesión');
      return fail<UsuarioDto>(message);
    }
  },

  register: async (payload: { nombre: string; correo: string; contrasena: string; telefono: string; fechaNacimiento?: string; genero?: string; }) => {
    try {
      const userCredential = await firebaseClient.createUserWithEmail(payload.correo, payload.contrasena);
      await firebaseData.updateProfile({
        nombre: payload.nombre,
        telefono: payload.telefono,
        fechaNacimiento: payload.fechaNacimiento,
        genero: payload.genero,
      });
      const user = mapFirebaseUser(formatUser(userCredential.user));
      return user ? ok(user) : fail<UsuarioDto>('Registro completado, pero no se pudo recuperar el usuario.');
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const message = err.code === 'auth/email-already-in-use'
        ? 'Este correo ya está registrado.'
        : String(err.message || 'No se pudo crear la cuenta');
      return fail<UsuarioDto>(message);
    }
  },

  forgotPassword: async (correo: string) => {
    try {
      await firebaseClient.sendResetEmail(correo);
      return ok({ mensaje: 'Se ha enviado un correo para restablecer la contraseña.' });
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      return fail({ mensaje: String(err.message || 'No se pudo enviar el correo de restablecimiento.') });
    }
  },

  resetPasswordSession: async () => ok({ active: false }),
  resetPassword: async () => fail({ mensaje: 'Restablecimiento de contraseña no soportado desde la app.' }),
  oauthProviders: async () => ok(['google']),
  loginWithGoogle: async () => {
    try {
      const userCredential = await firebaseClient.signInWithGoogle();
      const user = mapFirebaseUser(formatUser(userCredential.user));
      return user ? ok(user) : fail<UsuarioDto>('No se pudo iniciar sesión con Google.');
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const message = err.code === 'auth/popup-closed-by-user'
        ? 'Inicio de sesión cancelado.'
        : String(err.message || 'No se pudo iniciar sesión con Google.');
      return fail<UsuarioDto>(message);
    }
  },
  continueAsGuest: async () => {
    try {
      await ensureAuthUser();
      const current = formatUser(firebaseClient.auth.currentUser);
      const user = mapFirebaseUser(current);
      return user ? ok(user) : fail<UsuarioDto>('No se pudo continuar como invitado.');
    } catch (error: unknown) {
      return fail<UsuarioDto>(String((error as Error).message || 'No se pudo continuar como invitado.'));
    }
  },
  mobileCompatibility: async () => ok(true),
  adminLogin: async () => fail<UsuarioDto>('Funcionalidad no disponible'),
  logout: async () => {
    try {
      await firebaseClient.signOut();
      await firebaseClient.signInAnonymously();
      return ok(null);
    } catch {
      return fail<void>('No se pudo cerrar la sesión.');
    }
  },

  activities: {
    list: async () => {
      await ensureAuthUser();
      try {
        const items = await firebaseData.listActivities();
        return ok(items);
      } catch {
        return cachedResponse<ActividadListItem[]>('/api/v1/activities', 'No se pudieron cargar las actividades');
      }
    },
    get: async (id: number | string) => {
      await ensureAuthUser();
      const cached = readApiGet<ActividadDetail>(`/api/v1/activities/${id}`);
      if (cached) return ok(cached);
      try {
        const item = await firebaseData.getActivity(String(id));
        return item ? ok(item) : fail<ActividadDetail>('Actividad no encontrada');
      } catch {
        return cached ? ok(cached, { offline: true }) : fail<ActividadDetail>('No se pudo cargar la actividad');
      }
    },
    byDate: async (fecha: string) => {
      await ensureAuthUser();
      try {
        const items = await firebaseData.listActivitiesByDate(fecha);
        return ok(items);
      } catch {
        return cachedResponse<ActividadListItem[]>(`/api/v1/activities/by-date?fecha=${encodeURIComponent(fecha)}`, 'No se pudieron cargar las actividades por fecha');
      }
    },
    byMonth: async (year: number, month: number) => {
      await ensureAuthUser();
      try {
        const items = await firebaseData.listActivitiesByMonth(year, month);
        return ok(items);
      } catch {
        return cachedResponse<ActividadListItem[]>(`/api/v1/activities/by-month?year=${year}&month=${month}`, 'No se pudo cargar el horario mensual');
      }
    },
    create: async (payload: CreateActividadPayload) => {
      await ensureAuthUser();
      try {
        const detail = await firebaseData.createActivity(payload);
        return ok(detail);
      } catch (error: unknown) {
        return fail<ActividadDetail>(String((error as Error).message || 'No se pudo crear la actividad'));
      }
    },
    update: async (id: number, payload: UpdateActividadPayload) => {
      await ensureAuthUser();
      try {
        const detail = await firebaseData.updateActivity(String(id), payload);
        return detail ? ok(detail) : fail<ActividadDetail>('Actividad no encontrada');
      } catch (error: unknown) {
        return fail<ActividadDetail>(String((error as Error).message || 'No se pudo actualizar la actividad'));
      }
    },
    updateStatus: async (id: number, estado: string) => {
      await ensureAuthUser();
      try {
        const item = await firebaseData.updateActivityStatus(String(id), estado);
        return item ? ok(item) : fail<ActividadListItem>('Actividad no encontrada');
      } catch (error: unknown) {
        return fail<ActividadListItem>(String((error as Error).message || 'No se pudo actualizar el estado'));
      }
    },
    remove: async (id: number) => {
      await ensureAuthUser();
      try {
        await firebaseData.removeActivity(String(id));
        return ok(null);
      } catch (error: unknown) {
        return fail<void>(String((error as Error).message || 'No se pudo eliminar la actividad'));
      }
    },
    priorityAlerts: async () => {
      await ensureAuthUser();
      try {
        const items = await firebaseData.priorityAlerts();
        return ok(items);
      } catch {
        return ok([]);
      }
    },
    reschedulable: async () => {
      await ensureAuthUser();
      try {
        const items = await firebaseData.reschedulable();
        return ok(items);
      } catch {
        return ok([]);
      }
    },
    reschedule: async (id: number, fecha: string, hora?: string) => {
      await ensureAuthUser();
      try {
        const detail = await firebaseData.reschedule(String(id), fecha, hora);
        return detail ? ok(detail) : fail<ActividadDetail>('No se pudo reagendar');
      } catch (error: unknown) {
        return fail<ActividadDetail>(String((error as Error).message || 'No se pudo reagendar la actividad'));
      }
    },
  },

  schedule: {
    list: async () => {
      await ensureAuthUser();
      try {
        const blocks = await firebaseData.listSchedule();
        return ok(blocks);
      } catch {
        return cachedResponse<ScheduleBlock[]>('/api/v1/schedule/blocks', 'No se pudo cargar el horario');
      }
    },
    create: async (payload: CreateScheduleBlockPayload) => {
      await ensureAuthUser();
      try {
        const block = await firebaseData.createScheduleBlock(payload as any);
        return ok(block);
      } catch (error: unknown) {
        return fail<ScheduleBlock>(String((error as Error).message || 'No se pudo crear el bloque')); 
      }
    },
    update: async (id: number, payload: CreateScheduleBlockPayload) => {
      await ensureAuthUser();
      try {
        const block = await firebaseData.updateScheduleBlock(String(id), payload as any);
        return block ? ok(block) : fail<ScheduleBlock>('Bloque no encontrado');
      } catch (error: unknown) {
        return fail<ScheduleBlock>(String((error as Error).message || 'No se pudo actualizar el bloque'));
      }
    },
    remove: async (id: number) => {
      await ensureAuthUser();
      try {
        await firebaseData.removeScheduleBlock(String(id));
        return ok(null);
      } catch (error: unknown) {
        return fail<void>(String((error as Error).message || 'No se pudo eliminar el bloque')); 
      }
    },
    alert: async (minutesBefore?: number) => {
      await ensureAuthUser();
      try {
        const alert = await firebaseData.scheduleAlert();
        return ok(alert as ScheduleAlert | null);
      } catch {
        return ok(null);
      }
    },
  },

  notes: {
    list: async () => {
      await ensureAuthUser();
      try {
        const notes = await firebaseData.listNotes();
        return ok(notes);
      } catch {
        return cachedResponse<Note[]>('/api/v1/notas', 'No se pudieron cargar las notas');
      }
    },
    create: async (titulo: string, contenido: string, color: string, pinned: boolean) => {
      await ensureAuthUser();
      try {
        const note = await firebaseData.createNote({ titulo, contenido, color, pinned });
        return ok(note);
      } catch (error: unknown) {
        return fail<Note>(String((error as Error).message || 'No se pudo crear la nota'));
      }
    },
    update: async (id: string, patch: Partial<Note>) => {
      await ensureAuthUser();
      try {
        const note = await firebaseData.updateNote(id, patch);
        return note ? ok(note) : fail<Note>('Nota no encontrada');
      } catch (error: unknown) {
        return fail<Note>(String((error as Error).message || 'No se pudo actualizar la nota'));
      }
    },
    remove: async (id: string) => {
      await ensureAuthUser();
      try {
        await firebaseData.removeNote(id);
        return ok(null);
      } catch (error: unknown) {
        return fail<void>(String((error as Error).message || 'No se pudo eliminar la nota'));
      }
    },
  },

  profile: {
    get: async () => {
      try {
        const profile = await firebaseData.getProfile();
        return ok(profile);
      } catch {
        return fail<Profile>('No se pudo cargar el perfil');
      }
    },
    update: async (payload: UpdateProfilePayload) => {
      try {
        const profile = await firebaseData.updateProfile(payload);
        return ok(profile);
      } catch (error: unknown) {
        return fail<Profile>(String((error as Error).message || 'No se pudo actualizar el perfil'));
      }
    },
    changePassword: async (currentPassword: string, nueva: string, confirmacion: string) => {
      if (nueva !== confirmacion) return fail<void>('Las contraseñas no coinciden');
      try {
        await firebaseClient.updatePassword(nueva);
        return ok(null);
      } catch (error: unknown) {
        return fail<void>(String((error as Error).message || 'No se pudo cambiar la contraseña'));
      }
    },
    changeTheme: async (tema: string) => {
      try {
        const profile = await firebaseData.changeTheme(tema);
        return ok(profile);
      } catch (error: unknown) {
        return fail<Profile>(String((error as Error).message || 'No se pudo cambiar el tema'));
      }
    },
    uploadPhoto: async () => fail<Profile>('Carga de foto no soportada en esta versión'),
  },

  bienestar: {
    stats: async () => {
      try {
        const stats = await firebaseData.getWellbeingStats();
        return ok(stats);
      } catch {
        return fail<WellbeingStats>('No se pudieron cargar las estadísticas de bienestar');
      }
    },
    stress: async () => {
      try {
        const stress = await firebaseData.getStressReport();
        return ok(stress);
      } catch {
        return fail<StressReport>('No se pudo cargar el informe de estrés');
      }
    },
    savePomodoro: async (mins: number) => {
      try {
        const result = await firebaseData.savePomodoro(mins);
        return ok(result);
      } catch (error: unknown) {
        return fail<{ mensaje: string }>(String((error as Error).message || 'No se pudo guardar el pomodoro'));
      }
    },
    savePause: async (tipo: string, mins: number) => {
      try {
        const result = await firebaseData.savePause(tipo, mins);
        return ok(result);
      } catch (error: unknown) {
        return fail<{ mensaje: string }>(String((error as Error).message || 'No se pudo guardar la pausa'));
      }
    },
  },

  community: {
    stats: async () => fail<CommunityStats>('Funcionalidad de comunidad no disponible'),
    users: async () => ok([]),
    suggestions: async (limit: number) => ok([]),
    connections: async () => ok([]),
    connect: async () => fail<void>('Funcionalidad de comunidad no disponible'),
    accept: async () => fail<void>('Funcionalidad de comunidad no disponible'),
    reject: async () => fail<void>('Funcionalidad de comunidad no disponible'),
    remove: async () => fail<void>('Funcionalidad de comunidad no disponible'),
  },

  chat: {
    conversations: async () => ok([]),
    messages: async () => ok([]),
    send: async () => fail<any>('Chat no disponible'),
    markRead: async () => fail<any>('Chat no disponible'),
    deleteConversation: async () => fail<any>('Chat no disponible'),
    unreadCount: async () => ok({ count: 0 }),
  },

  notifications: {
    list: async () => ok([]),
    unreadCount: async () => ok({ count: 0 }),
    markRead: async () => ok({ ok: true, count: 0 }),
    markAllRead: async () => ok({ ok: true, count: 0 }),
    remove: async () => ok({ ok: true, count: 0 }),
  },

  ia: {
    chat: async () => fail<any>('IA no disponible'),
    status: async () => fail<any>('IA no disponible'),
  },

  assistant: {
    message: async () => fail<any>('Asistente no disponible'),
    confirm: async () => fail<any>('Asistente no disponible'),
    cancel: async () => fail<any>('Asistente no disponible'),
  },

  admin: {
    stats: async () => fail<AdminStats>('Admin no disponible'),
    wellbeing: async () => fail<AdminWellbeing>('Admin no disponible'),
    users: async () => fail<AdminUser[]>('Admin no disponible'),
    announcements: async () => fail<AdminAnnouncement[]>('Admin no disponible'),
    toggleRole: async () => fail<AdminUser>('Admin no disponible'),
    deleteUser: async () => fail<void>('Admin no disponible'),
    createAnnouncement: async () => fail<AdminAnnouncement>('Admin no disponible'),
    archiveAnnouncement: async () => fail<AdminAnnouncement>('Admin no disponible'),
    restoreAnnouncement: async () => fail<AdminAnnouncement>('Admin no disponible'),
    deleteAnnouncement: async () => fail<void>('Admin no disponible'),
  },
};
