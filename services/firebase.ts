import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, User, deleteUser, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";

// Firebase configuration from environment variables or config file

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
console.log('🔥 Initializing Firebase with config:', JSON.stringify({ ...config, apiKey: '***' }));
export const app = initializeApp(config);

// Initialize Firestore
export const db = getFirestore(app);

export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');
export { httpsCallable };

const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
export const auth = getAuth(app);

if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence)
    .then(() => {
      console.log('Persistência configurada');
    })
    .catch((error) => {
      console.error('Erro na persistência:', error);
    });
}

export const googleProvider = new GoogleAuthProvider();

// --- Firestore Error Handling ---
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Connection Test ---
import { doc, getDocFromCache, getDocFromServer } from "firebase/firestore";

async function testConnection() {
  if (typeof window === 'undefined') return;
  try {
    // Try to get a non-existent doc just to test connectivity
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error.message && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
    // Other errors (like permission denied on the test doc) are expected and mean we ARE connected
  }
}

testConnection();

export const loginWithGoogle = async (): Promise<{ user: User | null; isNewUser: boolean; error?: string }> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    // Check if the user is new by comparing creation time and last sign in time
    // Or check additionalUserInfo if available (but that's only available on result)
    // The most reliable way without additionalUserInfo is checking metadata
    const isNewUser = user.metadata.creationTime === user.metadata.lastSignInTime;
    
    return { user, isNewUser };
  } catch (error: any) {
    console.error("Google Login Error:", error);
    return { user: null, isNewUser: false, error: error.message };
  }
};

export const loginWithEmail = async (email: string, password: string): Promise<{ user: User | null; error?: string }> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return { user: result.user };
  } catch (error: any) {
    console.error("Email Login Error:", error);
    let errorMessage = "Erro ao fazer login.";
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      errorMessage = "Email ou senha incorretos.";
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = "Email inválido.";
    }
    return { user: null, error: errorMessage };
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout Error:", error);
  }
};

export const deleteCurrentUser = async () => {
  const user = auth.currentUser;
  if (user) {
    try {
      await deleteUser(user);
    } catch (error) {
      console.error("Delete User Error:", error);
    }
  }
};

import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

export const requestNotificationPermission = async (
  userId: string
): Promise<string | null> => {
  try {
    if (typeof window === 'undefined') return null;
    if (!('Notification' in window)) return null;

    const supported = await isSupported();
    if (!supported) {
      console.warn('FCM is not supported in this browser.');
      return null;
    }

    const messaging = getMessaging(app);

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
    });

    if (token && userId) {
      const { doc, updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'users', userId), {
        fcmToken: token,
        notificationsEnabled: true
      });
      console.log('✅ Notificações ativadas');
    }

    return token;
  } catch (error) {
    console.error('Erro notificações:', error);
    return null;
  }
};
