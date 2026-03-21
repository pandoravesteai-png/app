import { doc, getDoc, setDoc, updateDoc, increment, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';

export const getOrCreateUserCredits = async (
  userId: string
): Promise<number> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      const email = auth.currentUser?.email || '';
      await setDoc(userRef, { 
        email: auth.currentUser?.email || '',
        uid: userId,
        credits: 10, 
        createdAt: new Date().toISOString() 
      });
      return 10;
    }
    return userSnap.data().credits || 0;
  } catch (error) {
    console.error('Erro ao buscar créditos:', error);
    return 0;
  }
};

export const saveUserEmail = async (userId: string, email: string): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      await setDoc(userRef, { 
        email: auth.currentUser?.email || email,
        uid: userId,
        credits: 10, 
        createdAt: new Date().toISOString() 
      });
    } else {
      await updateDoc(userRef, { email });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
};

export const deductCredit = async (
  userId: string, 
  amount: number = 10
): Promise<boolean> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists() || 
        (userSnap.data().credits || 0) < amount) {
      return false;
    }
    await updateDoc(userRef, { 
      credits: increment(-amount) 
    });
    return true;
  } catch (error) {
    console.error('Erro ao deduzir crédito:', error);
    return false;
  }
};

export const addCredits = async (
  userId: string, 
  amount: number
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  try {
    await updateDoc(userRef, { 
      credits: increment(amount) 
    });
  } catch (error) {
    console.error('Erro ao adicionar créditos:', error);
  }
};

export const listenToUser = (userId: string, callback: (data: any) => void) => {
  const userRef = doc(db, 'users', userId);
  return onSnapshot(userRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data());
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
  });
};
