import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updatePassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  enableIndexedDbPersistence,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);

let persistenceEnabled = false;

export type FirebaseProfile = {
  nombre?: string;
  correo?: string;
  telefono?: string;
  fechaNacimiento?: string;
  genero?: string;
  tema?: string;
  foto?: string;
};

export type FirebaseStats = {
  minutosPomodoro: number;
  sesionesPomodoro: number;
  totalPomodoros: number;
  totalPausas: number;
  ultimasSesiones: Array<{
    id: string;
    tipo: string;
    valor?: number;
    descripcion?: string;
    fecha?: string;
  }>;
};

export const firebaseClient = {
  auth,
  firestore,
  async ensurePersistence() {
    if (persistenceEnabled) return;
    try {
      await setPersistence(auth, browserLocalPersistence);
      await enableIndexedDbPersistence(firestore, { synchronizeTabs: true });
    } catch {
      // Firestore persistence is best-effort.
    }
    persistenceEnabled = true;
  },
  async onAuthStateChanged(onChange: (user: FirebaseUser | null) => void) {
    await this.ensurePersistence();
    return onAuthStateChanged(auth, onChange);
  },
  async signInAnonymously() {
    await this.ensurePersistence();
    return signInAnonymously(auth);
  },
  async signInWithEmail(email: string, password: string) {
    await this.ensurePersistence();
    return signInWithEmailAndPassword(auth, email, password);
  },
  async createUserWithEmail(email: string, password: string) {
    await this.ensurePersistence();
    return createUserWithEmailAndPassword(auth, email, password);
  },
  async signInWithGoogle() {
    await this.ensurePersistence();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return signInWithPopup(auth, provider);
  },
  async signOut() {
    return firebaseSignOut(auth);
  },
  async linkAnonymousWithEmail(email: string, password: string) {
    const current = auth.currentUser;
    if (!current?.isAnonymous) {
      return signInWithEmailAndPassword(auth, email, password);
    }
    const credential = EmailAuthProvider.credential(email, password);
    try {
      return linkWithCredential(current, credential);
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'auth/credential-already-in-use') {
        const signed = await signInWithCredential(auth, credential);
        return signed;
      }
      throw error;
    }
  },
  async linkAnonymousWithGoogle() {
    const current = auth.currentUser;
    if (!current?.isAnonymous) {
      return this.signInWithGoogle();
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      return linkWithPopup(current, auth, provider);
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'auth/credential-already-in-use') {
        return this.signInWithGoogle();
      }
      throw error;
    }
  },
  async sendResetEmail(email: string) {
    return sendPasswordResetEmail(auth, email);
  },
  async updatePassword(password: string) {
    if (!auth.currentUser) throw new Error('No hay usuario autenticado');
    return updatePassword(auth.currentUser, password);
  },
  async requestEmailVerification() {
    if (!auth.currentUser) throw new Error('No hay usuario autenticado');
    return sendEmailVerification(auth.currentUser);
  },
  userDocRef(uid: string) {
    return doc(firestore, 'users', uid);
  },
  activitiesCollection(uid: string) {
    return collection(firestore, 'users', uid, 'activities');
  },
  notesCollection(uid: string) {
    return collection(firestore, 'users', uid, 'notes');
  },
  scheduleCollection(uid: string) {
    return collection(firestore, 'users', uid, 'schedule');
  },
  wellbeingCollection(uid: string) {
    return collection(firestore, 'users', uid, 'wellbeing');
  },
};

export function normalizeSnapshot<T extends DocumentData>(snapshot: DocumentData & { id?: string }, id?: string) {
  const data = { ...(snapshot as Record<string, unknown>) };
  if (id) data.id = id;
  if (data.updatedAt && typeof data.updatedAt?.toDate === 'function') {
    data.updatedAt = data.updatedAt.toDate().toISOString();
  }
  if (data.createdAt && typeof data.createdAt?.toDate === 'function') {
    data.createdAt = data.createdAt.toDate().toISOString();
  }
  return data as T;
}

export function formatUser(user: FirebaseUser | null) {
  if (!user) return null;
  return {
    uid: user.uid,
    nombre: user.displayName ?? (user.email ? user.email.split('@')[0] : 'Invitado'),
    correo: user.email ?? null,
    foto: user.photoURL ?? null,
    isAnonymous: user.isAnonymous,
  };
}

export function activityFromDoc(docRef: DocumentReference<DocumentData>, data: DocumentData) {
  return normalizeSnapshot<{
    id: string;
    titulo: string;
    tipo: string;
    estado: string;
    materia?: string | null;
    fechaInicio?: string | null;
    horaInicio?: string | null;
    duracionMinutos?: number | null;
    prioridad?: string | null;
    color?: string | null;
    esPropietario: boolean;
    esCompartida: boolean;
    description?: string | null;
    recurrence?: Record<string, unknown>;
    updatedAt?: string;
  }>(data, docRef.id);
}

export function noteFromDoc(docRef: DocumentReference<DocumentData>, data: DocumentData) {
  return normalizeSnapshot<{
    id: string;
    titulo: string;
    contenido: string;
    pinned: boolean;
    color: string;
    recurrence?: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
  }>(data, docRef.id);
}

export function scheduleFromDoc(docRef: DocumentReference<DocumentData>, data: DocumentData) {
  return normalizeSnapshot<{
    id: string;
    materia: string;
    diaSemana: number;
    diaNombre: string;
    horaInicio: string;
    horaFin: string;
    aula?: string | null;
    profesor?: string | null;
    color: string;
  }>(data, docRef.id);
}
