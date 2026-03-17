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
  SUCCESS = 'SUCCESS',
  NO_REGISTRATION = 'NO_REGISTRATION',
  FAQ = 'FAQ',
  CADASTRO = 'CADASTRO',
  RECUPERAR_SENHA = 'RECUPERAR_SENHA',
  REDEFINIR_SENHA = 'REDEFINIR_SENHA'
}

export interface HistoryItem {
  id: string;
  date: string;
  generatedImage: string;
  userImage: string; // The base image used
  clothingImage?: string | null; // The clothing image used (if upload)
  prompt?: string | null; // The prompt used (if text)
  type: 'UPLOAD' | 'TEXT';
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
  generatedImage: string | null;
  generated360Images: string[] | null; // [Frente, Lado, Costas]
  credits: number;
  history: HistoryItem[];
  lastPlan: string | null;
}

export interface CategoryItem {
  id: string;
  label: string;
  image: string;
  span?: boolean;
  badge?: string;
}

export type ClothingType = 'Blusa' | 'Short' | 'Calça' | 'Saia' | 'Vestido' | 'Sapatos';