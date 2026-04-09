import { doc, getDoc, setDoc, updateDoc, increment, onSnapshot, runTransaction } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';

export const getOrCreateUserCredits = async (
  userId: string
): Promise<number> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    console.log('🔍 Credits for user:', userId, 'Data:', userSnap.data());
    if (!userSnap.exists()) {
      const email = auth.currentUser?.email || '';
      await setDoc(userRef, {
        email: auth.currentUser?.email || '',
        uid: userId,
        credits: 0,
        subscriptionTier: 'free',
        created_at: new Date().toISOString()
      });
      return 0;
    }
    return userSnap.data().credits ?? userSnap.data().exp ?? 0;
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
        credits: 0,
        subscriptionTier: 'free',
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
    const data = userSnap.data();
    if (!userSnap.exists()) return false;

    const currentCredits = data?.credits ?? 0;
    const totalPurchased = data?.totalPurchased ?? 0;
    const released = data?.creditsReleased ?? 0;
    const blocked = Math.max(0, totalPurchased - released);
    const usable = currentCredits - blocked;

    if (usable < amount) {
      console.log('❌ Saldo insuficiente ou bloqueado:', { usable, amount, blocked });
      return false;
    }

    const today = new Date().toISOString().split('T')[0];
    const isNewDay = data?.dailyUsage?.date !== today;

    const updates: any = {
      totalPhotosGenerated: increment(1),
      credits: increment(-amount)
    };

    if (isNewDay) {
      updates.dailyUsage = {
        date: today,
        count: amount,
        chestsClaimed: 0
      };
    } else {
      updates['dailyUsage.count'] = increment(amount);
    }

    await updateDoc(userRef, updates);
    return true;
  } catch (error) {
    console.error('Erro ao deduzir crédito:', error);
    return false;
  }
};

export const processCreditRelease = async (
  userId: string
): Promise<void> => {
  // Liberação de créditos gerenciada pelo webhook
  // Esta função foi desativada para evitar conflito
  return;
};

export const claimChest = async (userId: string): Promise<number> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return 0;
    
    const data = userSnap.data();
    const today = new Date().toISOString().split('T')[0];
    
    const dailyUsage = data.dailyUsage?.date === today ? data.dailyUsage : { date: today, count: 0, chestsClaimed: 0 };
    const count = dailyUsage.count || 0;
    const claimed = dailyUsage.chestsClaimed || 0;
    
    // Check if used at least 50 credits for each chest and not already claimed for this milestone
    const availableChests = Math.floor(count / 50);
    
    if (availableChests > claimed) {
      await updateDoc(userRef, {
        credits: increment(10),
        'dailyUsage.date': today,
        'dailyUsage.chestsClaimed': increment(1)
      });
      return 10;
    }
    return 0;
  } catch (error) {
    console.error('Erro ao resgatar baú:', error);
    return 0;
  }
};

export const unlockClosetSpace = async (userId: string): Promise<boolean> => {
  const userRef = doc(db, 'users', userId);
  try {
    return await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) return false;
      
      const data = userSnap.data();
      const currentCredits = data.credits ?? data.exp ?? 0;
      
      if (currentCredits < 20) return false;
      
      const updates: any = {
        closetLimit: increment(10)
      };

      if (data.credits !== undefined) {
        updates.credits = increment(-20);
      } else if (data.exp !== undefined) {
        updates.exp = increment(-20);
      } else {
        updates.credits = increment(-20);
      }

      transaction.update(userRef, updates);
      return true;
    });
  } catch (error) {
    console.error('Erro ao desbloquear espaço no closet:', error);
    return false;
  }
};

export const addCredits = async (
  userId: string, 
  amount: number
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    const data = userSnap.data();
    
    const updates: any = {};
    if (data?.credits !== undefined) updates.credits = increment(amount);
    if (data?.exp !== undefined) updates.exp = increment(amount);
    
    if (Object.keys(updates).length === 0) {
      updates.credits = increment(amount);
    }

    await updateDoc(userRef, updates);
  } catch (error) {
    console.error('Erro ao adicionar créditos:', error);
  }
};

export const purchasePremium = async (userId: string): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    const data = userSnap.data();
    
    let newExpiry: Date;
    const now = new Date();
    
    if (data?.subscriptionTier === 'premium' && data?.subscriptionExpiresAt) {
      const currentExpiry = new Date(data.subscriptionExpiresAt);
      if (currentExpiry > now) {
        // Se ainda for premium, adiciona 30 dias à data de expiração atual
        newExpiry = new Date(currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);
      } else {
        // Se expirou, começa 30 dias a partir de agora
        newExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }
    } else {
      // Novo premium, 30 dias a partir de agora
      newExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    await updateDoc(userRef, {
      subscriptionTier: 'premium',
      subscriptionExpiresAt: newExpiry.toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
};

export const claimBadgeReward = async (userId: string, badge: 'gold' | 'diamond'): Promise<number> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return 0;
    
    const data = userSnap.data();
    const amount = badge === 'diamond' ? 200 : 50;
    const claimedField = badge === 'diamond' ? 'diamondRewardClaimed' : 'goldRewardClaimed';
    
    if (data[claimedField]) return 0;
    
    await updateDoc(userRef, {
      credits: increment(amount),
      [claimedField]: true
    });
    
    return amount;
  } catch (error) {
    console.error('Erro ao resgatar recompensa de nível:', error);
    return 0;
  }
};

export const listenToUser = (userId: string, callback: (data: any) => void) => {
  const userRef = doc(db, 'users', userId);
  return onSnapshot(userRef, (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
};
