export enum Screen {
  SPLASH = 'SPLASH',
  LOGIN = 'LOGIN',
  ONBOARDING = 'ONBOARDING',
  UPLOAD = 'UPLOAD',
  CATEGORY = 'CATEGORY',
  FINALIZE = 'FINALIZE',
  LOADING = 'LOADING',
  RESULT = 'RESULT',
  VIEW_360 = 'VIEW_360',
  RESULT_360 = 'RESULT_360',
  CREDITS = 'CREDITS',
  NO_REGISTRATION = 'NO_REGISTRATION',
  FAQ = 'FAQ',
  CADASTRO = 'CADASTRO',
  RECUPERAR_SENHA = 'RECUPERAR_SENHA',
  REDEFINIR_SENHA = 'REDEFINIR_SENHA',
  STYLE_QUIZ = 'STYLE_QUIZ',
  CHECKOUT = 'CHECKOUT',
  MAIN = 'MAIN'
}

export interface HistoryItem {
  id: string;
  date: string;
  generatedImage: string;
  userImage: string; // The base image used
  clothingImage?: string | null; // The clothing image used (if upload)
  prompt?: string | null; // The prompt used (if text)
  type: 'UPLOAD' | 'TEXT';
  stylistTip?: string;
  compliment?: string;
}

export interface UserState {
  email: string;
  name: string;
  cellphone?: string;
  taxId?: string;
  profileImage?: string | null;
  uploadedImage: string | null;
  sideImage: string | null;
  backImage: string | null;
  selectedCategory: string | null;
  clothingImage: string | null;
  clothingBackImage: string | null;
  generatedImage: string | null;
  generated360Images: string[] | null; // [Frente, Lado, Costas]
  credits: number;
  history: HistoryItem[];
  streak: number;
  lastLogin?: string;
  styleProfile?: string | null;
  styleTags?: string[];
  lastPlan: string | null;
  lastPurchaseAmount?: number | null;
  lastPurchaseCredits?: number | null;
  lastPurchaseDate?: any | null;
  lastCompliment?: string | null;
  subscriptionTier?: 'basic' | 'premium';
  subscriptionExpiresAt?: string | null;
  subscriptionStartDate?: string | null;
  creditsReleased?: number;
  totalPhotosGenerated?: number;
  dailyUsage?: { date: string, count: number } | null;
  lastRouletteSpin?: string | null;
  rechargeCount?: number;
  badge?: 'bronze' | 'silver' | 'gold' | 'diamond' | null;
  pendingCredits?: number;
  loyaltyBonusClaimed?: boolean;
  closetLimit?: number;
  createdAt?: string | null;
}

export interface CategoryItem {
  id: string;
  label: string;
  image: string;
  span?: boolean;
  badge?: string;
}

export type ClothingType = 'Blusa' | 'Short' | 'Calça' | 'Saia' | 'Vestido';
