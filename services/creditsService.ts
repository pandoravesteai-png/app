import { doc, getDoc, setDoc, updateDoc, increment, onSnapshot } from 'firebase/firestore';
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
        credits: 10, 
        subscriptionTier: 'basic',
        created_at: new Date().toISOString() 
      });
      return 10;
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
        credits: 10, 
        exp: 10,
        subscriptionTier: 'basic',
        createdAt: new Date().toISOString() 
      });
    } else {
      await updateDoc(userRef, { email, subscriptionTier: 'basic' });
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
    const currentCredits = data?.credits ?? data?.exp ?? 0;

    if (!userSnap.exists() || currentCredits < amount) {
      return false;
    }

    const today = new Date().toISOString().split('T')[0];
    const dailyUsage = data?.dailyUsage?.date === today 
      ? { date: today, count: data.dailyUsage.count + amount }
      : { date: today, count: amount };

    const updates: any = {
      dailyUsage,
      totalPhotosGenerated: increment(1)
    };
    
    if (data?.credits !== undefined) updates.credits = increment(-amount);
    if (data?.exp !== undefined) updates.exp = increment(-amount);
    
    if (Object.keys(updates).filter(k => k === 'credits' || k === 'exp').length === 0) {
      updates.credits = increment(-amount);
    }

    await updateDoc(userRef, updates);
    return true;
  } catch (error) {
    console.error('Erro ao deduzir crédito:', error);
    return false;
  }
};

export const processCreditRelease = async (userId: string): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    
    const data = userSnap.data();
    if (!data.subscriptionStartDate || !data.lastPurchaseAmount) return;

    const startDate = new Date(data.subscriptionStartDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    let totalToRelease = 0;
    const amount = data.lastPurchaseAmount;

    if (amount === 19.9 || amount === 20) {
      // 19.90 (Basic): 100 total. 60 immediate, 20 next day, 20 day 4. +20 day 6.
      totalToRelease = 60;
      if (diffDays >= 1) totalToRelease += 20;
      if (diffDays >= 4) totalToRelease += 20;
      if (diffDays >= 6) totalToRelease += 20;
    } else if (amount === 29.9 || amount === 30) {
      // 29.90 (Premium): 300 total. 150 immediate, 100 day 4, 50 day 6.
      totalToRelease = 150;
      if (diffDays >= 4) totalToRelease += 100;
      if (diffDays >= 6) totalToRelease += 50;
    }

    const alreadyReleased = data.creditsReleased || 0;
    const releaseNow = totalToRelease - alreadyReleased;

    if (releaseNow > 0) {
      await updateDoc(userRef, {
        credits: increment(releaseNow),
        creditsReleased: totalToRelease
      });
    }

    // Loyalty Bonus: 2nd recharge of 19.90 gives +20 credits
    if (data.rechargeCount === 2 && (amount === 19.9 || amount === 20) && !data.loyaltyBonusClaimed) {
      await updateDoc(userRef, {
        credits: increment(20),
        loyaltyBonusClaimed: true
      });
    }

    // Check for badges based on totalPhotosGenerated
    const photos = data.totalPhotosGenerated || 0;
    let newBadge = data.badge;
    let creditsToAdd = 0;
    
    if (photos >= 100) {
      newBadge = 'diamond';
      if (!data.diamondRewardClaimed) creditsToAdd = 200;
    } else if (photos >= 60) {
      newBadge = 'gold';
      if (!data.goldRewardClaimed && data.badge !== 'diamond') creditsToAdd = 50;
    } else if (photos >= 40) {
      newBadge = 'silver';
    } else if (photos >= 20) {
      newBadge = 'bronze';
    }

    if (newBadge !== data.badge || creditsToAdd > 0) {
      const badgeUpdates: any = { badge: newBadge };
      if (creditsToAdd > 0) {
        badgeUpdates.credits = increment(creditsToAdd);
        if (newBadge === 'diamond' || data.badge === 'diamond') badgeUpdates.diamondRewardClaimed = true;
        else if (newBadge === 'gold' || data.badge === 'gold') badgeUpdates.goldRewardClaimed = true;
      }
      await updateDoc(userRef, badgeUpdates);
    }

  } catch (error) {
    console.error('Erro ao processar liberação de créditos:', error);
  }
};

export const claimChest = async (userId: string): Promise<number> => {
  const userRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return 0;
    
    const data = userSnap.data();
    const today = new Date().toISOString().split('T')[0];
    
    // Check if used 30 credits today and not already claimed
    if (data.dailyUsage?.date === today && data.dailyUsage.count >= 30 && !data.dailyUsage.claimedChest) {
      // Give 10 credits
      await updateDoc(userRef, {
        credits: increment(10),
        'dailyUsage.claimedChest': true
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
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return false;
    
    const data = userSnap.data();
    const currentCredits = data.credits ?? 0;
    
    if (currentCredits < 20) return false;
    
    await updateDoc(userRef, {
      credits: increment(-20),
      closetLimit: increment(10)
    });
    return true;
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

export const listenToUser = (userId: string, callback: (data: any) => void) => {
  const userRef = doc(db, 'users', userId);
  return onSnapshot(userRef, (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
};
