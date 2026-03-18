import { doc, getDoc, setDoc, updateDoc, increment, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';

export const getOrCreateUserCredits = async (userId: string): Promise<number> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      const email = auth.currentUser?.email || '';
      await setDoc(userRef, { 
        email,
        credits: 1, 
        createdAt: new Date().toISOString() 
      });
      return 1;
    }
    
    return userSnap.data().credits || 0;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    return 0; // Unreachable
  }
};

export const saveUserEmail = async (userId: string, email: string): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      await setDoc(userRef, { 
        email, 
        credits: 1, 
        createdAt: new Date().toISOString() 
      });
    } else {
      await updateDoc(userRef, { email });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
};

export const deductCredit = async (userId: string, amount: number = 10): Promise<boolean> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists() || (userSnap.data().credits || 0) < amount) return false;
    
    await updateDoc(userRef, { credits: increment(-amount) });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
    return false;
  }
};

export const addCredits = async (userId: string, amount: number): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  try {
    await updateDoc(userRef, { credits: increment(amount) });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
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
