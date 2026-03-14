import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

const functions = getFunctions(app, 'us-central1');

export const createPixPayment = async (userId: string, plan: '20' | '30', userEmail: string) => {
  const criarPagamento = httpsCallable(functions, 'criarPagamento');
  const result = await criarPagamento({ userId, plan, userEmail });
  return result.data as { url: string };
};
