import * as React from 'react';
import { useState, useEffect, useRef, Component, useMemo } from 'react';
import { processCreditRelease } from './services/creditsService';
import { Screen, UserState, ClothingType, HistoryItem } from './types';
import { AppLogo, Button, Input } from './components/UI';
import { CATEGORIES, HOME_CAROUSEL_1 } from './constants';
import { Mail, Lock, Upload, Image as ImageIcon, Camera as CameraIcon, Check, ArrowRight, RefreshCw, Eye, Sparkles, Zap, Trash2, Download, RefreshCcw, Box, Rotate3d, Home, ArrowLeft, Plus, Wallet, Info, ShieldCheck, AlertTriangle, X, ChevronDown, ChevronUp, Pencil, Save, ExternalLink, UserX, ZoomIn, Move, Instagram, MessageCircle, HelpCircle, Star, User, ShoppingBag, ChevronRight, Terminal, Trophy, Gift, RotateCw, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { GoogleGenAI } from "@google/genai";
import { doc, updateDoc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc, increment } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, auth, handleFirestoreError, OperationType, storage, functions, httpsCallable } from './services/firebase';
import { 
  signOut, 
  onAuthStateChanged,
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  confirmPasswordReset,
  GoogleAuthProvider
} from 'firebase/auth';
import { generateFashionTip, generateTryOnLook, generate360View, extractStyleTags, generateCompliment } from './services/geminiService';
import { loginWithGoogle, loginWithEmail, deleteCurrentUser, googleProvider, requestNotificationPermission } from './services/firebase';
import { getOrCreateUserCredits, deductCredit, addCredits, listenToUser, saveUserEmail, purchasePremium, claimChest, unlockClosetSpace } from './services/creditsService';
import { createPixPayment } from './services/paymentService';


// --- Helper functions ---
const parseFirebaseDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date === 'string') {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  }
  // Handle Firestore Timestamp
  if (date && typeof date === 'object') {
    if (typeof date.toDate === 'function') return date.toDate();
    if (date.seconds !== undefined) return new Date(date.seconds * 1000);
  }
  return null;
};

// --- Stylist Tips Generator ---
const getStylistTip = (category: string): string => {
  const tips: Record<string, string[]> = {
    'Blusa': [
      "Combine esta blusa com acessórios dourados para um look mais sofisticado.",
      "Tente usar esta peça com uma calça de cintura alta para alongar a silhueta.",
      "Esta cor combina perfeitamente com tons neutros como bege ou branco."
    ],
    'Short': [
      "Este short fica incrível com uma sandália rasteira para um look casual de verão.",
      "Adicione um cinto fino para dar um toque de elegância extra ao visual.",
      "Combine com uma t-shirt básica para um estilo 'effortless chic'."
    ],
    'Calça': [
      "Esta calça pede um salto alto para um visual mais poderoso e profissional.",
      "Dobre a barra da calça para um look mais moderno e despojado.",
      "Use com uma blusa por dentro para destacar a cintura."
    ],
    'Saia': [
      "Esta saia fica ótima com uma bota de cano curto para os dias mais frescos.",
      "Combine com uma blusa mais justa para equilibrar o volume da saia.",
      "Acessórios prateados vão dar um brilho especial a este conjunto."
    ],
    'Vestido': [
      "Este vestido é versátil: use com tênis para o dia ou salto para a noite.",
      "Um colar longo vai ajudar a alongar o visual com este decote.",
      "Adicione uma jaqueta jeans para um look mais jovem e descontraído."
    ],
    'default': [
      "Você ficou incrível! Esta combinação realça muito o seu estilo pessoal.",
      "Uma escolha audaciosa e elegante. Você está pronta para qualquer evento!",
      "Este look transmite confiança e modernidade. Arrasou!"
    ]
  };

  const categoryTips = tips[category] || tips['default'];
  return categoryTips[Math.floor(Math.random() * categoryTips.length)];
};

// --- Style Quiz Screen ---
const StyleQuizScreen: React.FC<{
  onComplete: (style: string) => void;
  onBack: () => void;
}> = ({ onComplete, onBack }) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);

  const questions = [
    {
      q: "Como você descreveria seu look ideal para o dia a dia?",
      options: [
        { label: "Simples, limpo e funcional", style: "Minimalista" },
        { label: "Confortável, com estampas e texturas", style: "Boho" },
        { label: "Alinhado, profissional e elegante", style: "Executivo" },
        { label: "Urbano, moderno e com tênis", style: "Streetwear" },
        { label: "Delicado, com cores suaves e detalhes", style: "Romântico" }
      ]
    },
    {
      q: "Qual paleta de cores mais te atrai?",
      options: [
        { label: "Preto, branco, cinza e bege", style: "Minimalista" },
        { label: "Tons terrosos, vinho e mostarda", style: "Boho" },
        { label: "Azul marinho, off-white e preto", style: "Executivo" },
        { label: "Cores vibrantes, neon ou grafites", style: "Streetwear" },
        { label: "Rosa, lavanda, menta e tons pastéis", style: "Romântico" }
      ]
    },
    {
      q: "Qual acessório você não vive sem?",
      options: [
        { label: "Um relógio clássico ou nada", style: "Minimalista" },
        { label: "Muitos anéis e colares de pedras", style: "Boho" },
        { label: "Uma bolsa de couro estruturada", style: "Executivo" },
        { label: "Boné, bucket hat ou óculos escuros", style: "Streetwear" },
        { label: "Tiara, laço ou joias delicadas", style: "Romântico" }
      ]
    }
  ];

  const handleAnswer = (style: string) => {
    const newAnswers = [...answers, style];
    if (step < questions.length - 1) {
      setAnswers(newAnswers);
      setStep(step + 1);
    } else {
      // Calcula o estilo predominante
      const counts: Record<string, number> = {};
      newAnswers.forEach(s => counts[s] = (counts[s] || 0) + 1);
      const finalStyle = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
      onComplete(finalStyle);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col p-6 animate-fade-in">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-xl font-bold">Descubra seu Estilo</h2>
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="mb-8">
          <div className="flex gap-2 mb-4">
            {questions.map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-purple-600' : 'bg-gray-100'}`} 
              />
            ))}
          </div>
          <p className="text-xs font-bold text-purple-600 uppercase tracking-widest mb-2">Pergunta {step + 1} de {questions.length}</p>
          <h3 className="text-2xl font-bold text-[#2E0249] leading-tight">{questions[step].q}</h3>
        </div>

        <div className="space-y-3">
          {questions[step].options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleAnswer(opt.style)}
              className="w-full p-5 text-left rounded-2xl border-2 border-gray-100 hover:border-purple-500 hover:bg-purple-50 transition-all group flex items-center justify-between"
            >
              <span className="font-medium text-[#2E0249] group-hover:text-purple-900">{opt.label}</span>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-purple-500" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Sharing Functions ---
const compartilharWhatsApp = (imageUrl?: string) => {
  const text = encodeURIComponent("Olha que incrível como essa peça ficou em mim usando a Pandora AI! ✨👗\n\nExperimente você também: https://pandora-ai.com");
  const url = `https://wa.me/?text=${text}`;
  window.open(url, '_blank');
};

const compartilharInstagram = () => {
  window.open('https://www.instagram.com/', '_blank');
};

// --- PWA and Notifications ---
declare global {
  interface Window {
    deferredPrompt: any;
  }
}

// Captura evento de instalação PWA
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPrompt = e;
});

// --- Error Boundary Component ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<any, any> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let message = "Ocorreu um erro inesperado.";
      try {
        const err = (this.state as any).error;
        if (err && err.message) {
          const errorData = JSON.parse(err.message);
          if (errorData.error && errorData.error.includes("insufficient permissions")) {
            message = "Você não tem permissão para realizar esta ação. Verifique se você está logado corretamente.";
          }
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="flex flex-col items-center justify-center h-screen p-6 text-center bg-white">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#2E0249] mb-2">Ops! Algo deu errado.</h2>
          <p className="text-gray-600 mb-6">{message}</p>
          <Button onClick={() => window.location.reload()}>Recarregar Aplicativo</Button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

// --- No Registration Screen ---
const NoRegistrationScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="w-full h-screen bg-white flex flex-col items-center justify-center p-6 animate-fade-in text-center relative">
      <button 
        onClick={onBack}
        className="absolute top-6 left-6 p-2 rounded-full hover:bg-gray-100 text-[#2E0249] transition-colors"
      >
        <ArrowLeft size={24} />
      </button>

      <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mb-6 text-purple-600">
        <UserX size={40} />
      </div>
      <h2 className="text-2xl font-bold text-[#2E0249] mb-2">Conta não encontrada</h2>
      <p className="text-[#2E0249]/80 mb-8 max-w-xs">
        Não encontramos um cadastro para este usuário. Crie sua conta agora para acessar o Pandora AI.
      </p>
      
      <a 
        href="https://pandora-style-ai.lovable.app" 
        target="_blank" 
        rel="noopener noreferrer"
        className="w-full max-w-xs py-4 px-6 bg-[#6A00F4] hover:bg-[#5800cc] text-white rounded-2xl font-semibold shadow-lg shadow-purple-200 transition-all transform active:scale-95 flex items-center justify-center gap-2"
      >
        Cadastrar Agora <ExternalLink size={18} />
      </a>
      
      <p className="mt-6 text-xs text-gray-400">
        Após o cadastro, retorne e faça login novamente.
      </p>
    </div>
  );
};

// --- Promo Carousel ---
const PromoCarousel: React.FC<{ isPremium?: boolean }> = ({ isPremium }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  
  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % 5);

  const slides = [
    // Slide 1: A Dor da Imagem Comum
    (
      <div className="w-full h-full bg-white border-4 border-purple-500 rounded-3xl flex flex-col items-center justify-center p-4 relative overflow-hidden text-center">
        <div className="absolute top-2 left-2 text-purple-600">
           <CameraIcon size={16} />
        </div>
        <h3 className="text-lg font-bold text-[#6A00F4] mb-2 leading-tight">Sua Imagem Profissional Começa Agora!</h3>
        <p className="text-[10px] text-[#2E0249]/70 mb-3 px-2 leading-tight">
           Cansado de selfies que não transmitem seu potencial? Um retrato profissional abre portas.
        </p>
        <div className="flex items-center justify-center gap-2 mb-2">
           <div className="w-16 h-20 bg-white p-1 shadow-[0_0_10px_rgba(168,85,247,0.3)] border border-purple-200 transform -rotate-3">
             <div className="w-full h-14 bg-gray-200 overflow-hidden">
               <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=60" className="w-full h-full object-cover grayscale" alt="Selfie" />
             </div>
           </div>
           <div className="w-16 h-20 bg-white p-1 shadow-[0_0_10px_rgba(168,85,247,0.3)] border border-purple-200 transform rotate-3 flex items-center justify-center">
             <div className="w-full h-14 bg-gray-50 flex items-center justify-center text-purple-300">
               <span className="text-2xl font-bold">?</span>
             </div>
           </div>
        </div>
        <button onClick={nextSlide} className="text-[10px] font-bold text-purple-600 hover:text-purple-800 flex items-center gap-1">
           Saiba Mais <ArrowRight size={10} />
        </button>
      </div>
    ),
    // Slide 2: A Solução Inteligente
    (
      <div className="w-full h-full bg-white border-4 border-purple-500 rounded-3xl flex flex-col items-center justify-center p-4 relative overflow-hidden text-center">
        <div className="absolute top-2 right-2 text-purple-600 animate-pulse">
           <Sparkles size={16} />
        </div>
        <h3 className="text-lg font-bold text-[#6A00F4] mb-2 leading-tight">Transforme-se com a IA do Pandora AI!</h3>
        <p className="text-[10px] text-gray-600 mb-3 px-2 leading-tight">
           Retratos corporativos que impressionam. Sem estúdio, com a qualidade que você merece.
        </p>
        <div className="flex items-center justify-center gap-2 mb-2">
           <div className="w-16 h-20 bg-white p-1 shadow-[0_0_10px_rgba(168,85,247,0.3)] border border-purple-200 relative">
             <div className="w-full h-14 bg-gray-200 overflow-hidden">
               <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=60" className="w-full h-full object-cover grayscale" alt="Antes" />
             </div>
             <div className="absolute bottom-1 left-0 right-0 text-[6px] text-center text-gray-400">ANTES</div>
           </div>
           <ArrowRight size={12} className="text-purple-400" />
           <div className="w-16 h-20 bg-white p-1 shadow-[0_0_10px_rgba(168,85,247,0.3)] border border-purple-200 relative">
             <div className="w-full h-14 bg-gray-200 overflow-hidden">
               <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&q=60" className="w-full h-full object-cover" alt="Depois" />
             </div>
             <div className="absolute bottom-1 left-0 right-0 text-[6px] text-center text-purple-600 font-bold">DEPOIS</div>
           </div>
        </div>
      </div>
    ),
    // Slide 3: O Poder de um Book Completo
    (
      <div className="w-full h-full bg-white border-4 border-purple-500 rounded-3xl flex flex-col items-center justify-center p-4 relative overflow-hidden text-center">
        <h3 className="text-lg font-bold text-[#6A00F4] mb-2 leading-tight">Um Book Profissional Completo para Você!</h3>
        <p className="text-[10px] text-gray-600 mb-3 px-2 leading-tight">
           25 fotos exclusivas geradas por IA. Perfeitas para LinkedIn, currículo e redes sociais.
        </p>
        <div className="relative w-full h-20 flex justify-center items-center mb-2">
           {[1, 2, 3].map((i) => (
             <div key={i} className={`absolute w-14 h-18 bg-white p-0.5 shadow-[0_0_10px_rgba(168,85,247,0.3)] border border-purple-200 transform ${i === 1 ? '-translate-x-8 -rotate-6' : i === 2 ? 'translate-x-0 -translate-y-2' : 'translate-x-8 rotate-6'}`}>
               <img src={`https://images.unsplash.com/photo-${i === 1 ? '1573496359142-b8d87734a5a2' : i === 2 ? '1560250097-0b93528c311a' : '1519085360753-af0119f7cbe7'}?w=100&q=60`} className="w-full h-full object-cover" alt="Portrait" />
             </div>
           ))}
           <div className="absolute bottom-0 right-10 bg-purple-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-md shadow-sm transform rotate-12">
             25 FOTOS
           </div>
        </div>
        <div className="flex gap-2 text-gray-400">
           <div className="w-4 h-4 bg-gray-200 rounded-sm flex items-center justify-center text-[8px]">in</div>
           <div className="w-4 h-4 bg-gray-200 rounded-sm flex items-center justify-center text-[8px]">IG</div>
           <Mail size={12} />
        </div>
      </div>
    ),
    // Slide 4: Oferta Exclusiva
    (
      <div className="w-full h-full bg-white border-4 border-purple-500 rounded-3xl flex flex-col items-center justify-center p-4 relative overflow-hidden text-center">
        <h3 className="text-xl font-bold text-[#6A00F4] mb-1 leading-tight">Oferta Especial</h3>
        <p className="text-xs text-gray-600 mb-4 px-4 leading-tight">
           Seu Book Profissional com Desconto! Por tempo limitado.
        </p>
        
        <div className="relative mb-4">
           <div className="absolute -top-3 -right-3 bg-red-500 text-white text-[8px] font-bold px-2 py-1 rounded-full animate-bounce">
              OFERTA LIMITADA
           </div>
           <div className="flex flex-col items-center">
              <span className="text-sm text-gray-400 line-through decoration-red-500 decoration-2">R$ 149,99</span>
              <span className="text-4xl font-black text-[#6A00F4] drop-shadow-sm">R$ 69,99</span>
           </div>
        </div>

        <button 
          onClick={() => window.open('https://wa.me/5583991420009?text=Ol%C3%A1%2C%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es!%20', '_blank')} 
          className="bg-[#6A00F4] text-white px-4 py-2 rounded-full text-xs font-bold shadow-md hover:bg-purple-700 transition-colors w-3/4"
        >
           Quero Meu Book Agora!
        </button>
      </div>
    ),
  ];

  useEffect(() => {
    if (isPremium) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000); // Increased duration for reading
    return () => clearInterval(timer);
  }, [slides.length, isPremium]);

  if (isPremium) return null;

  return (
    <div className="w-full h-56 relative">
      <div className="w-full h-full relative overflow-hidden rounded-3xl shadow-lg bg-white">
         {slides.map((slide, index) => (
           <div 
             key={index}
             className={`absolute inset-0 w-full h-full transition-all duration-700 ease-in-out transform flex items-center justify-center ${
               index === currentSlide ? 'opacity-100 translate-x-0' : 
               index < currentSlide ? 'opacity-0 -translate-x-full' : 'opacity-0 translate-x-full'
             }`}
           >
             {slide}
           </div>
         ))}
      </div>
      
      {/* Indicators */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-10">
        {slides.map((_, idx) => (
          <button 
            key={idx} 
            onClick={() => setCurrentSlide(idx)}
            className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentSlide ? 'w-6 bg-[#6A00F4]' : 'w-1.5 bg-gray-300'}`}
          />
        ))}
      </div>
    </div>
  );
};

// --- Helper Functions ---
async function urlToBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
          const base64String = reader.result as string;
          // Remove data:image/jpeg;base64, prefix or similar
          resolve(base64String.split(',')[1]); 
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Error converting to base64", e);
    return "";
  }
}

const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str) {
      resolve(base64Str);
      return;
    }

    // Se for uma URL curta (não base64 e não blob), não precisa comprimir
    if ((base64Str.length < 1000 || base64Str.startsWith('http')) && !base64Str.startsWith('data:image') && !base64Str.startsWith('blob:')) {
      resolve(base64Str);
      return;
    }

    let src = base64Str;
    if (src.startsWith('http://') || src.startsWith('https://')) {
      // É uma URL remota, não adicionamos prefixo base64
    } else if (!src.startsWith('data:image') && !src.startsWith('blob:')) {
      // Assume que é uma string base64 sem prefixo
      src = `data:image/jpeg;base64,${base64Str}`;
    }

    const img = new Image();
    img.src = src;
    img.onerror = () => {
      console.error("Error loading image for compression");
      resolve(base64Str);
    };
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64Str);
  });
};

// --- Helper Components for Home Screen ---

const HomeCarousel: React.FC<{ 
  images: string[], 
  borderRadiusClass: string, 
  interval?: number,
  indicatorPosition?: 'top-right' | 'bottom-center',
  borderColorClass?: string
}> = ({ 
  images, 
  borderRadiusClass,
  interval = 3000,
  indicatorPosition = 'bottom-center',
  borderColorClass = 'border-[#00E676]/40'
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, interval);
    return () => clearInterval(timer);
  }, [images.length, interval]);

  const renderIndicators = () => {
    if (indicatorPosition === 'top-right') {
      return (
        <div className="absolute top-4 right-5 flex gap-1.5 z-10">
          {images.map((_, index) => (
             <div 
               key={index} 
               className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${index === currentIndex ? 'bg-white scale-125' : 'bg-white/40'}`} 
             />
          ))}
        </div>
      );
    }

    // Default: Bottom Center
    return (
      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
        {images.slice(0, 4).map((_, index) => (
            <div 
              key={index} 
              className={`h-1.5 rounded-full transition-all duration-300 border border-white/50 ${index === (currentIndex % 4) ? 'w-5 bg-white' : 'w-1.5 bg-transparent'}`} 
            />
        ))}
      </div>
    );
  };

  return (
    <div className={`relative w-full ${borderRadiusClass} border ${borderColorClass} overflow-hidden shadow-sm mx-auto bg-white`}>
      <div className="w-full relative">
        {images.map((img, index) => (
          <img 
            key={index}
            src={img} 
            alt={`Slide ${index}`} 
            className={`w-full h-auto transition-opacity duration-1000 ease-in-out ${index === currentIndex ? 'relative opacity-100' : 'absolute inset-0 opacity-0'}`} 
          />
        ))}
      </div>
      {renderIndicators()}
    </div>
  );
};

// --- Screen Components ---

const SplashScreen: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 3000;
    const interval = 30;
    const steps = duration / interval;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      setProgress(Math.min((currentStep / steps) * 100, 100));
      
      if (currentStep >= steps) {
        clearInterval(timer);
        onFinish();
      }
    }, interval);

    return () => clearInterval(timer);
  }, [onFinish]);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center animate-fade-in">
       <div className="flex flex-col items-center w-full px-8">
          <AppLogo size="lg" />
          
          {/* Loading Bar Container */}
          <div className="w-64 h-1.5 bg-gray-100 rounded-full mt-6 overflow-hidden relative">
            {/* Neon Purple Bar */}
            <div 
              className="h-full bg-purple-600 shadow-[0_0_10px_#9333ea] rounded-full transition-all duration-75 ease-linear relative z-10"
              style={{ width: `${progress}%` }}
            />
            {/* Glow effect background */}
            <div 
              className="absolute top-0 left-0 h-full bg-purple-400 blur-[4px] opacity-50 transition-all duration-75 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
       </div>
    </div>
  );
};

const LoadingScreen: React.FC<{ 
  message?: string; 
  userImage?: string | null; 
  clothingImage?: string | null;
  is360?: boolean;
}> = ({ message, userImage, clothingImage, is360 }) => {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [animationPhase, setAnimationPhase] = useState(0); // 0: User 3D, 1: Clothing 3D, 2: Positioning, 3: Collision, 4: Finished
  const [showFlash, setShowFlash] = useState(false);
  
  const messages = is360 ? [
    "🔄 Mapeando ângulos laterais...",
    "📸 Reconstruindo verso da peça...",
    "📐 Ajustando caimento 360°...",
    "✨ Renderizando visualização...",
    "🚀 Finalizando sua experiência 360°..."
  ] : [
    "✨ Analisando silhueta...",
    "🎨 Mapeando tecidos...",
    "💫 Ajustando iluminação...",
    "💎 Preservando traços faciais...",
    "🚀 Finalizando seu look..."
  ];

  const fashionTips = is360 ? [
    "💡 Dica: Arraste para girar seu look após a geração!",
    "👗 Sabia? O 360° mostra detalhes que a frente não revela.",
    "🌟 Pandora AI garante perfeição em todos os ângulos.",
    "📸 Dica: Use o zoom para ver as texturas de perto.",
    "✨ O modo 360° é ideal para ver o caimento das costas."
  ] : [
    "💡 Dica: Você pode ver este look em 360° após a geração!",
    "👗 Sabia? O caimento da peça é ajustado ao seu corpo real.",
    "🌟 Pandora AI preserva 100% da sua identidade e rosto.",
    "📸 Dica: Experimente diferentes poses para resultados variados.",
    "✨ Compartilhe seu look no Instagram e marque a @PandoraAI!"
  ];

  useEffect(() => {
    // Progress logic
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev < 95) { // Slow down near the end until collision
          const increment = Math.random() * 1.5 + 0.8;
          return Math.min(95, prev + increment);
        }
        return prev;
      });
    }, 500);

    const messageInterval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % messages.length);
    }, 3000);

    const tipInterval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % fashionTips.length);
    }, 5000);

    // Animation Sequence Logic
    const sequence = async () => {
      // Phase 0: User Image 3D Loop (4s) - Faster
      setAnimationPhase(0);
      await new Promise(r => setTimeout(r, 4000));
      
      // Phase 1: Clothing Image 3D Loop (4s) - Faster
      setAnimationPhase(1);
      await new Promise(r => setTimeout(r, 4000));
      
      // Phase 2: Positioning (1.5s)
      setAnimationPhase(2);
      await new Promise(r => setTimeout(r, 1500));
      
      // Phase 3: Collision (1s)
      setAnimationPhase(3);
      await new Promise(r => setTimeout(r, 1000));
      
      // Phase 4: Impact / Flash / 100%
      setShowFlash(true);
      setProgress(100); // Force 100% at impact
      setAnimationPhase(4);
      setTimeout(() => setShowFlash(false), 600);
    };

    sequence();

    return () => {
      clearInterval(progressInterval);
      clearInterval(messageInterval);
      clearInterval(tipInterval);
    };
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #9333ea 0%, #ec4899 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
      zIndex: 50
    }}>
      {/* Decorative Elements */}
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.15, 0.3, 0.15]
        }}
        transition={{ duration: 8, repeat: Infinity }}
        style={{
          position: 'absolute',
          top: '-10%',
          left: '-10%',
          width: '60%',
          height: '60%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(80px)'
        }} 
      />

      {/* Impact Flash - Enhanced for more power */}
      <AnimatePresence>
        {showFlash && (
          <>
            {/* Main Screen Flash */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.7, times: [0, 0.1, 1] }}
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'white',
                zIndex: 100,
                mixBlendMode: 'overlay'
              }}
            />
            {/* Radial Shockwave from Center */}
            <motion.div
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: 5, opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              style={{
                position: 'absolute',
                width: '400px',
                height: '400px',
                background: 'radial-gradient(circle, #ffffff 0%, #f472b6 30%, #9333ea 60%, transparent 80%)',
                borderRadius: '50%',
                zIndex: 90,
                top: '50%',
                left: '50%',
                x: '-50%',
                y: '-50%',
                boxShadow: '0 0 100px #fff'
              }}
            />
          </>
        )}
      </AnimatePresence>

      <div style={{
        width: '100%',
        maxWidth: '500px',
        textAlign: 'center',
        color: 'white',
        zIndex: 10,
        perspective: '1200px'
      }}>
        
        {/* Main Animation Stage */}
        <div style={{
          position: 'relative',
          width: '300px',
          height: '400px',
          margin: '0 auto 40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          perspective: '1200px'
        }}>
          
          {/* 360 Badge in Core (Above Portal) */}
          {is360 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                position: 'absolute',
                padding: '4px 12px',
                background: 'rgba(255,255,255,0.2)',
                backdropFilter: 'blur(10px)',
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.4)',
                color: 'white',
                fontSize: '14px',
                fontWeight: '900',
                letterSpacing: '2px',
                zIndex: 30,
                boxShadow: '0 0 20px rgba(255,255,255,0.3)'
              }}
            >
              360°
            </motion.div>
          )}

          {/* Neural Core / Portal */}
          <motion.div
            animate={{
              scale: animationPhase === 3 ? [1, 2.8, 2.2] : [1, 1.1, 1],
              rotate: 360,
              opacity: animationPhase >= 3 ? 0.9 : 0.4
            }}
            transition={{
              rotate: { duration: 10, repeat: Infinity, ease: "linear" },
              scale: { duration: 2, repeat: Infinity }
            }}
            style={{
              position: 'absolute',
              width: '160px',
              height: '160px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.4) 0%, rgba(147,51,234,0.6) 50%, transparent 70%)',
              borderRadius: '50%',
              filter: 'blur(15px)',
              zIndex: 5,
              border: '2px solid rgba(255,255,255,0.2)'
            }}
          >
            {/* Spinning Rings inside core */}
            <div style={{
              position: 'absolute',
              inset: '10%',
              border: '2px dashed rgba(255,255,255,0.2)',
              borderRadius: '50%',
              animation: 'spin 4s linear infinite'
            }} />
          </motion.div>

          {/* 360 Mode Distinctive Element */}
          {is360 && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              style={{
                position: 'absolute',
                width: '450px',
                height: '450px',
                borderRadius: '50%',
                border: '2px dashed rgba(255,255,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5
              }}
            >
              {[0, 90, 180, 270].map((angle) => (
                <div
                  key={angle}
                  style={{
                    position: 'absolute',
                    transform: `rotate(${angle}deg) translateY(-225px)`,
                    color: 'white',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    textShadow: '0 0 10px rgba(0,0,0,0.5)',
                    opacity: 0.6
                  }}
                >
                  360°
                </div>
              ))}
              
              {/* Secondary Glowing Ring */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                style={{
                  position: 'absolute',
                  width: '380px',
                  height: '380px',
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: 'inset 0 0 20px rgba(255,255,255,0.05)',
                  zIndex: 4
                }}
              />
            </motion.div>
          )}

          {/* User Image Animation */}
          <AnimatePresence>
            {userImage && (
              <motion.div
                key="user-anim"
                initial={{ x: 300, z: -400, opacity: 0, rotateY: 0 }}
                animate={
                  animationPhase === 0 ? {
                    x: [250, 0, -250, 0, 250],
                    y: [0, -40, 0, 40, 0],
                    z: [0, 200, 0, -400, 0],
                    rotateY: [0, 180, 360, 540, 720],
                    opacity: 1,
                    scale: [0.8, 1.2, 0.8, 0.6, 0.8],
                    filter: [
                      'brightness(1) blur(0px)',
                      'brightness(1.6) blur(0px)',
                      'brightness(1) blur(0px)',
                      'brightness(0.3) blur(8px)',
                      'brightness(1) blur(0px)'
                    ]
                  } : animationPhase === 1 ? {
                    x: 0,
                    y: 0,
                    z: -200,
                    rotateY: 0,
                    opacity: 0.6,
                    scale: 0.7,
                    filter: 'brightness(0.5) blur(2px)'
                  } : animationPhase === 2 ? {
                    x: -85,
                    y: 0,
                    z: 0,
                    rotateY: 0,
                    opacity: 1,
                    scale: 1,
                    filter: 'brightness(1) blur(0px)'
                  } : animationPhase === 3 ? {
                    x: 0,
                    scale: 1.15,
                    filter: 'brightness(4) contrast(1.5) drop-shadow(0 0 40px #fff)'
                  } : {
                    x: 0,
                    scale: 1,
                    opacity: 1,
                    filter: 'brightness(1.2) blur(0px)'
                  }
                }
                transition={animationPhase === 0 ? {
                  duration: 4,
                  ease: "linear",
                  repeat: Infinity,
                  times: [0, 0.25, 0.5, 0.75, 1]
                } : {
                  duration: 1,
                  type: "spring",
                  stiffness: 70
                }}
                style={{
                  position: 'absolute',
                  width: '180px',
                  height: '240px',
                  borderRadius: '24px',
                  overflow: 'hidden',
                  border: '4px solid rgba(255,255,255,0.6)',
                  boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
                  zIndex: 20,
                  backfaceVisibility: 'hidden'
                }}
              >
                <img src={userImage} alt="User" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {/* Scanning line effect during orbit */}
                {animationPhase === 0 && (
                  <motion.div 
                    animate={{ top: ['-100%', '200%'] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      height: '20%',
                      background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.8), transparent)',
                      zIndex: 21
                    }}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Clothing Image Animation */}
          <AnimatePresence>
            {clothingImage && (
              <motion.div
                key="clothing-anim"
                initial={{ x: 300, z: -400, opacity: 0, rotateY: 0 }}
                animate={
                  animationPhase === 1 ? {
                    x: [250, 0, 0, -250, 0, 250],
                    y: [0, 40, 40, 0, -40, 0],
                    z: [0, 200, 200, 0, -400, 0],
                    rotateY: [0, 180, 180, 360, 540, 720],
                    opacity: 1,
                    scale: [0.8, 1.2, 1.2, 0.8, 0.6, 0.8],
                    filter: [
                      'brightness(1) blur(0px)',
                      'brightness(1.8) blur(0px)',
                      'brightness(1.8) blur(0px)',
                      'brightness(1) blur(0px)',
                      'brightness(0.4) blur(6px)',
                      'brightness(1) blur(0px)'
                    ]
                  } : animationPhase === 0 ? {
                    x: 0,
                    y: 0,
                    z: -200,
                    rotateY: 0,
                    opacity: 0.6,
                    scale: 0.7,
                    filter: 'brightness(0.5) blur(2px)'
                  } : animationPhase === 2 ? {
                    x: 85,
                    y: 0,
                    z: 0,
                    rotateY: 0,
                    opacity: 1,
                    scale: 1,
                    filter: 'brightness(1) blur(0px)'
                  } : animationPhase === 3 ? {
                    x: 0,
                    scale: 1.15,
                    filter: 'brightness(4) contrast(1.5) drop-shadow(0 0 40px #fff)'
                  } : {
                    x: 0,
                    scale: 1,
                    opacity: 1,
                    filter: 'brightness(1.2) blur(0px)'
                  }
                }
                transition={animationPhase === 1 ? {
                  duration: 4,
                  ease: "linear",
                  repeat: Infinity,
                  times: [0, 0.2, 0.4, 0.6, 0.8, 1]
                } : {
                  duration: 1,
                  type: "spring",
                  stiffness: 70
                }}
                style={{
                  position: 'absolute',
                  width: '180px',
                  height: '240px',
                  borderRadius: '24px',
                  overflow: 'hidden',
                  border: '4px solid rgba(255,255,255,0.6)',
                  boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
                  zIndex: 25,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px'
                }}
              >
                <img src={clothingImage} alt="Clothing" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                {/* Digital scan effect */}
                {animationPhase === 1 && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: 'radial-gradient(circle, rgba(147,51,234,0.2) 1px, transparent 1px)',
                    backgroundSize: '10px 10px',
                    opacity: 0.5
                  }} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.h2 
          key={messageIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ 
            fontSize: '24px', 
            fontWeight: 'bold', 
            marginBottom: '10px',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)'
          }}
        >
          {message || messages[messageIndex]}
        </motion.h2>
        
        <div style={{
          width: '100%',
          height: '10px',
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: '5px',
          marginBottom: '30px',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <motion.div 
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", stiffness: 50 }}
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, #9333ea, #ec4899)',
              borderRadius: '5px',
              boxShadow: '0 0 20px rgba(236,72,153,0.5)'
            }} 
          />
        </div>

        {/* Fashion Tip Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            backgroundColor: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(10px)',
            padding: '20px',
            borderRadius: '24px',
            border: '1px solid rgba(255,255,255,0.1)',
            minHeight: '120px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
          }}
        >
          <Sparkles style={{ width: '24px', height: '24px', marginBottom: '12px', color: '#fbbf24' }} />
          <AnimatePresence mode="wait">
            <motion.p 
              key={tipIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              style={{ 
                fontSize: '15px', 
                lineHeight: '1.6',
                fontStyle: 'italic',
                color: 'rgba(255,255,255,0.9)'
              }}
            >
              {fashionTips[tipIndex]}
            </motion.p>
          </AnimatePresence>
        </motion.div>

        <p style={{ 
          marginTop: '40px', 
          fontSize: '11px', 
          opacity: 0.4,
          letterSpacing: '4px',
          textTransform: 'uppercase',
          fontWeight: 'bold'
        }}>
          Pandora AI • Neural Fashion Engine
        </p>
      </div>
    </div>
  );
};

// --- Checkout Screen ---
const CheckoutScreen: React.FC<{ url: string; onBack: () => void }> = ({ url, onBack }) => {
  return (
    <div className="flex flex-col h-full bg-white animate-fade-in">
      <div className="p-4 border-b flex items-center gap-4 bg-white sticky top-0 z-10 shadow-sm">
        <button 
          onClick={onBack} 
          className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600"
          aria-label="Voltar"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h2 className="text-lg font-bold text-[#2E0249]">Pagamento Seguro</h2>
          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Finalize sua assinatura</p>
        </div>
      </div>
      <div className="flex-1 relative bg-gray-50">
        <iframe 
          src={url} 
          className="w-full h-full border-0"
          title="Checkout"
          allow="payment"
        />
      </div>
    </div>
  );
};

const LoginScreen: React.FC<{ 
  onLogin: (email: string, uid: string) => void; 
  onNoRegistration: () => void;
  setUserId: (uid: string) => void;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  setScreen: (screen: Screen) => void;
  setShowSuccessModal: (show: boolean) => void;
  setIsFirstLogin: (val: boolean) => void;
}> = ({ onLogin, onNoRegistration, setUserId, setUserState, setScreen, setShowSuccessModal, setIsFirstLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleEsqueciSenha = async () => {
    const emailInput = email || '';
    
    if (!emailInput || !emailInput.includes('@')) {
      alert('⚠️ Digite seu email no campo acima primeiro');
      return;
    }
    
    try {
      const emailLower = emailInput.toLowerCase().trim();
      
      // Configurações para o link de recuperação apontar de volta para o app
      const actionCodeSettings = {
        url: 'https://pandoravesteai.com',
        handleCodeInApp: true,
      };
      
      await sendPasswordResetEmail(auth, emailLower, actionCodeSettings);
      
      setShowSuccessModal(true);
    } catch (error: any) {
      console.error('Erro ao enviar email:', error);
      
      if (error.code === 'auth/user-not-found') {
        alert('❌ Email não encontrado.\n\nEste email não está cadastrado.');
      } else {
        alert('❌ Erro ao enviar email.\n\nTente novamente.');
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      if (!user.email) {
        alert('Não foi possível obter seu email. Tente novamente.');
        return;
      }
      
      const userEmail = user.email.toLowerCase().trim();
      const name = user.displayName || 'Usuário';

      // Vai para o app IMEDIATAMENTE
      setUserId(user.uid);
      setUserState(prev => ({ 
        ...prev, 
        email: userEmail,
        name: name,
        credits: 10
      }));
      
      // Marca guia como visto para ir direto
      localStorage.setItem(`guia_visto_${user.uid}`, 'true');
      setIsFirstLogin(false);
      setScreen(Screen.MAIN);

      // Busca/cria dados no Firestore em segundo plano
      const userRef = doc(db, 'users', user.uid);
      getDoc(userRef).then(async (userSnap) => {
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            email: userEmail,
            nome: name,
            credits: 10,
            created_at: serverTimestamp()
          });
        }
      }).catch(console.error);
      
    } catch (error) {
      console.error('Erro no login Google:', error);
      alert('Erro ao fazer login com Google. Tente novamente.');
    }
  };

  const handleEmailLogin = async (emailInput: string, passwordInput: string) => {
    try {
      const emailLower = emailInput.toLowerCase().trim();
      setIsLoading(true);
      setError(null);
      
      // Faz login
      const result = await signInWithEmailAndPassword(auth, emailLower, passwordInput);
      const user = result.user;
      
      // Login bem-sucedido
      setUserId(user.uid);
      await saveUserEmail(user.uid, emailLower);
      
      // Marca guia como visto para ir direto
      localStorage.setItem(`guia_visto_${user.uid}`, 'true');
      setIsFirstLogin(false);
      setScreen(Screen.MAIN);
      
    } catch (error: any) {
      console.error('Erro no login:', error);
      
      if (error.code === 'auth/user-not-found') {
        setError('Usuário não encontrado. Clique em "Cadastre-se" para criar uma conta.');
      } else if (error.code === 'auth/wrong-password') {
        setError('Senha incorreta. Clique em "Esqueceu a senha?" para resetar.');
      } else if (error.code === 'auth/invalid-credential') {
        setError('Email ou senha incorretos.');
      } else {
        setError('Erro ao fazer login. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      alert('⚠️ Preencha email e senha');
      return;
    }
    
    if (password.length < 6) {
      alert('⚠️ A senha deve ter pelo menos 6 caracteres');
      return;
    }
    
    try {
      const emailLower = email.toLowerCase().trim();
      
      let user;
      try {
        // Tenta criar nova conta
        const result = await createUserWithEmailAndPassword(auth, emailLower, password);
        user = result.user;
        
        // Cria documento no Firestore
        if (user) {
          setUserId(user.uid);
          await saveUserEmail(user.uid, emailLower);
          await getOrCreateUserCredits(user.uid);
        }
      } catch (error: any) {
        // Se o email já estiver em uso, tenta fazer login automaticamente com a mesma senha
        if (error.code === 'auth/email-already-in-use') {
          console.log('Email já em uso no handleSignUp, tentando login automático...');
          const loginResult = await signInWithEmailAndPassword(auth, emailLower, password);
          user = loginResult.user;
          if (user) {
            setUserId(user.uid);
            await saveUserEmail(user.uid, emailLower);
          }
        } else {
          throw error;
        }
      }
      
      if (user) {
        // Marca guia como visto para ir direto
        localStorage.setItem(`guia_visto_${user.uid}`, 'true');
        setIsFirstLogin(false);
        setScreen(Screen.MAIN);
      }
      
    } catch (error: any) {
      console.error('Erro ao cadastrar:', error);
      
      if (error.code === 'auth/email-already-in-use') {
        alert('❌ Este email já está cadastrado com outra senha.\n\nUse a tela de login para entrar ou recuperar sua senha.');
      } else if (error.code === 'auth/invalid-email') {
        alert('❌ Email inválido.\n\nDigite um email válido.');
      } else if (error.code === 'auth/weak-password') {
        alert('❌ Senha muito fraca.\n\nUse pelo menos 6 caracteres.');
      } else {
        alert('❌ Erro ao criar conta.\n\nTente novamente em alguns instantes.');
      }
    }
  };

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col items-center justify-center overflow-y-auto bg-white">
      <div className="relative z-10 w-full max-w-md px-8 animate-fade-in flex flex-col items-center">
        <div className="mb-4 w-full flex justify-center">
          <AppLogo size="md" />
        </div>

        <div className="w-full space-y-4">
          <Input 
            icon={<Mail size={20} />} 
            type="email" 
            placeholder="seu@email.com" 
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            label="Email"
          />
          <Input 
            icon={<Lock size={20} />} 
            type="password" 
            placeholder="••••••••" 
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            label="Senha"
          />
          {error && <p className="text-red-500 text-xs font-medium ml-1">{error}</p>}
        </div>

        <div className="w-full mt-8 space-y-4">
          <Button 
            onClick={() => handleEmailLogin(email, password)} 
            isLoading={isLoading}
            className="w-full py-4 transition-all transform active:scale-95"
          >
            Entrar na Plataforma
          </Button>

          <div className="flex flex-col items-center gap-4 mt-4">
            <button 
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-4 px-6 rounded-2xl font-semibold transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-3 text-base shadow-sm border border-gray-200 bg-white text-[#2E0249] hover:bg-gray-50 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Entrar com Google
            </button>

            <div className="flex flex-col items-center gap-2">
              <a 
                onClick={() => setScreen(Screen.RECUPERAR_SENHA)}
                style={{
                  cursor: 'pointer',
                  color: '#8B2CF5',
                  textDecoration: 'none',
                  fontSize: '15px'
                }}
              >
                Esqueceu a senha?
              </a>
              
              <p className="text-sm text-gray-500">
                Não tem uma conta?{' '}
                <a 
                  onClick={() => setScreen(Screen.CADASTRO)}
                  style={{
                    cursor: 'pointer', 
                    color: '#8B2CF5', 
                    textDecoration: 'none',
                    fontWeight: '500'
                  }}
                >
                  Cadastre-se
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Profile Screen (formerly CreditsScreen) ---
const ProfileScreen: React.FC<{ 
    userId: string;
    userState: UserState;
    setUserState: React.Dispatch<React.SetStateAction<UserState>>;
    history: HistoryItem[];
    onAddCredits: () => void;
    onBuyCredits: (plan: '20' | '30') => void;
    onBack: () => void;
    onUpdateProfile: (name: string, image: string | null, cellphone?: string, taxId?: string) => void;
    onReuse: (item: HistoryItem) => void;
    onOpenFAQ: () => void;
    onOpenCheckout?: (url: string) => void;
    setUserId: (uid: string) => void;
    setScreen: (screen: Screen) => void;
    isAdmin?: boolean;
    onOpenAdmin?: () => void;
    onSyncCredits?: () => void;
    showChestNotification?: boolean;
    setShowChestNotification?: (show: boolean) => void;
}> = ({ userId, userState, setUserState, history, onAddCredits, onBuyCredits, onBack, onUpdateProfile, onReuse, onOpenFAQ, onOpenCheckout, setUserId, setScreen, isAdmin, onOpenAdmin, onSyncCredits, showChestNotification, setShowChestNotification }) => {
    const [editingName, setEditingName] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [newName, setNewName] = useState(userState.name || '');
    const [image, setImage] = useState<string | null>(userState.profileImage || null);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const handleDeleteSelected = async () => {
      if (selectedItems.length === 0) return;
      setShowDeleteModal(true);
    };

    const confirmarExclusao = async () => {
      setShowDeleteModal(false);
      try {
        const { deleteDoc, doc: firestoreDoc } = await import('firebase/firestore');
        
        for (const id of selectedItems) {
          try {
            await deleteDoc(firestoreDoc(db, 'users', userId, 'history', id));
            console.log('✅ Deletado:', id);
          } catch (err) {
            console.error('Erro ao deletar item:', id, err);
          }
        }
        
        setUserState(prev => ({
          ...prev,
          history: prev.history.filter(item => !selectedItems.includes(item.id))
        }));
        
        setSelectedItems([]);
        setSelectionMode(false);
      } catch (error) {
        console.error('Erro ao excluir:', error);
      }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const url = URL.createObjectURL(e.target.files[0]);
            setImage(url);
        }
    };

    // Função para salvar o nome no Firestore
    const handleSaveName = async () => {
      if (!newName.trim()) {
        alert('Digite um nome válido');
        return;
      }
      
      try {
        await updateDoc(doc(db, 'users', userId), { name: newName.trim() });
        setUserState(prev => ({ ...prev, name: newName.trim() }));
        setEditingName(false);
        alert('✅ Nome atualizado!');
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
      }
    };

    const handleDownloadHistory = async (item: HistoryItem) => {
        if (!item.generatedImage) return;

        try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = item.generatedImage;
            
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0);

            const link = document.createElement('a');
            link.download = `pandora-look-${new Date().getTime()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Erro ao baixar imagem:', err);
            // Fallback: tenta abrir em nova aba se o canvas falhar
            window.open(item.generatedImage, '_blank');
        }
    };

    const handleDeleteSingle = async (item: HistoryItem) => {
        try {
            const { deleteDoc, doc: firestoreDoc } = await import('firebase/firestore');
            await deleteDoc(firestoreDoc(db, 'users', userId, 'history', item.id));
            
            setUserState(prev => ({
              ...prev,
              history: prev.history.filter(h => h.id !== item.id)
            }));
            
            setSelectedHistoryItem(null);
        } catch (err) {
            console.error('Erro ao deletar item:', err);
        }
    };

    const handleSaveProfile = () => {
        onUpdateProfile(newName, image);
    };

    const isPremium = userState.subscriptionTier === 'premium' || 
                      (userState.lastPurchaseAmount === 29.9 || userState.lastPurchaseAmount === 29.90 || userState.lastPurchaseAmount === 30) ||
                      (userState.lastPlan && (userState.lastPlan.toLowerCase().includes('premium') || userState.lastPlan.includes('29,90') || userState.lastPlan.includes('29.90') || userState.lastPlan.includes('30')));

    return (
        <div className="w-full min-h-screen bg-white flex flex-col animate-slide-up relative overflow-y-auto">
            {/* Header removido - agora no MainLayout */}

            {/* Feed de Achados removido daqui - agora apenas no modal do header */}

            {selectedHistoryItem && (
                <div className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-fade-in p-6 overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-white font-bold text-lg">Detalhes da Criação</h3>
                        <button onClick={() => setSelectedHistoryItem(null)} className="p-2 bg-white/10 rounded-full text-white">
                            <X size={24} />
                        </button>
                    </div>
                    
                    <div className="flex-1 flex flex-col gap-6">
                        <div className="w-full aspect-[9/16] rounded-2xl overflow-hidden border-2 border-purple-500 shadow-2xl bg-gray-900 relative">
                            <img src={selectedHistoryItem.generatedImage} className="w-full h-full object-cover" alt="Generated" />
                            <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white border border-white/10">
                                {new Date(selectedHistoryItem.date).toLocaleDateString()}
                            </div>
                        </div>

                        {/* Elogio da Estilista */}
                        {selectedHistoryItem.compliment && (
                            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 relative">
                                <div className="absolute -top-3 left-4 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Sparkles size={10} /> Elogio da Estilista
                                </div>
                                <p className="text-purple-900 text-sm italic font-medium leading-relaxed">
                                    "{selectedHistoryItem.compliment}"
                                </p>
                            </div>
                        )}

                        <div className="flex gap-4">
                            <div className="flex-1 bg-white/10 rounded-xl p-3 border border-white/10">
                                <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Imagem Base</p>
                                <div className="w-full aspect-square rounded-lg overflow-hidden bg-black">
                                    <img src={selectedHistoryItem.userImage} className="w-full h-full object-cover" alt="Base" />
                                </div>
                            </div>
                            <div className="flex-1 bg-white/10 rounded-xl p-3 border border-white/10">
                                <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">
                                    {selectedHistoryItem.type === 'TEXT' ? 'Prompt' : 'Peça'}
                                </p>
                                {selectedHistoryItem.type === 'TEXT' ? (
                                    <div className="w-full aspect-square rounded-lg bg-black p-2 overflow-y-auto">
                                        <p className="text-[10px] text-gray-300">{selectedHistoryItem.prompt}</p>
                                    </div>
                                ) : (
                                    <div className="w-full aspect-square rounded-lg overflow-hidden bg-black">
                                        <img src={selectedHistoryItem.clothingImage || ''} className="w-full h-full object-cover" alt="Clothing" />
                                    </div>
                                )}
                            </div>
                        </div>

                        <Button onClick={() => onReuse(selectedHistoryItem)} className="w-full mt-auto">
                            <RefreshCcw size={18} /> Reutilizar Imagem Base
                        </Button>
                        
                        <div className="grid grid-cols-2 gap-3">
                             <button 
                                onClick={() => selectedHistoryItem && handleDownloadHistory(selectedHistoryItem)}
                                className="flex items-center justify-center gap-2 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-colors"
                             >
                                <Download size={18} /> Baixar
                             </button>
                             <button 
                                onClick={() => selectedHistoryItem && handleDeleteSingle(selectedHistoryItem)}
                                className="flex items-center justify-center gap-2 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-colors"
                             >
                                <Trash2 size={18} /> Excluir
                             </button>
                        </div>
                    </div>
                </div>
            )}


            <div className="flex-1 flex flex-col items-center px-6 pt-4 pb-12">
                {/* Profile Header */}
                <div className="relative mb-6 group">
                    <div className="w-24 h-24 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full flex items-center justify-center text-3xl font-bold text-purple-700 shadow-sm border border-purple-100 overflow-hidden">
                        {image ? (
                            <img src={image} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            (userState.name || 'U').charAt(0).toUpperCase()
                        )}
                    </div>
                    
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute bottom-0 right-0 bg-white p-2 rounded-full shadow-md border border-gray-100 text-purple-600 hover:bg-purple-50 transition-colors z-10"
                    >
                        <Upload size={14} />
                    </button>

                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*"
                        onChange={async (e) => {
                            if (e.target.files && e.target.files[0]) {
                                const url = URL.createObjectURL(e.target.files[0]);
                                setImage(url);
                                onUpdateProfile(userState.name || '', url);
                            }
                        }}
                    />
                </div>
                
                <div style={{ marginBottom: '20px', width: '100%', maxWidth: '400px' }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '11px', 
                    color: '#999', 
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    NOME
                  </label>
                  
                  {editingName ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Digite seu nome"
                        style={{
                          flex: 1,
                          padding: '12px',
                          borderRadius: '8px',
                          border: '1px solid #ddd',
                          fontSize: '15px',
                        }}
                      />
                      <button
                        onClick={handleSaveName}
                        style={{
                          padding: '12px 20px',
                          background: '#9333ea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                        }}>
                        Salvar
                      </button>
                      <button
                        onClick={() => {
                          setEditingName(false);
                          setNewName(userState.name || '');
                        }}
                        style={{
                          padding: '12px 20px',
                          background: '#ddd',
                          color: '#333',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                        }}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px',
                      background: '#f5f5f5',
                      borderRadius: '8px',
                    }}>
                      <span style={{ fontSize: '15px', fontWeight: '500' }}>
                        {userState.name || 'Sem nome'}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingName(true)}
                          style={{
                            padding: '6px 12px',
                            background: '#9333ea',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                          }}>
                          Editar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Gamification Section */}
                <div className="w-full max-w-md space-y-4 mb-8">
                  {/* Badges and Stats */}
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-[#2E0249] flex items-center gap-2">
                        <Trophy size={16} className="text-yellow-500" /> Sua Jornada
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-1 bg-purple-100 text-purple-700 rounded-full uppercase">
                        {userState.badge || 'Iniciante'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-end gap-2 px-2">
                      {[
                        { label: 'Bronze', min: 20, color: 'text-orange-600', bg: 'bg-orange-100' },
                        { label: 'Prata', min: 40, color: 'text-gray-400', bg: 'bg-gray-100' },
                        { label: 'Ouro', min: 60, color: 'text-yellow-600', bg: 'bg-yellow-100', reward: '+50 ⚡' },
                        { label: 'Diamante', min: 100, color: 'text-blue-500', bg: 'bg-blue-50', reward: '+200 ⚡' }
                      ].map((b, i) => (
                        <div key={i} className="flex flex-col items-center gap-1 relative">
                          {b.reward && (
                            <div className="absolute -top-3 -right-2 bg-purple-600 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-full shadow-md z-10 animate-pulse whitespace-nowrap">
                              {b.reward}
                            </div>
                          )}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${userState.totalPhotosGenerated! >= b.min ? b.bg : 'bg-gray-50 opacity-40'}`}>
                            <Star size={18} className={userState.totalPhotosGenerated! >= b.min ? b.color : 'text-gray-300'} fill={userState.totalPhotosGenerated! >= b.min ? 'currentColor' : 'none'} />
                          </div>
                          <span className="text-[9px] font-bold text-gray-500">{b.label}</span>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-50">
                      <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-1 uppercase">
                        <span>Progresso de Fotos</span>
                        <span>{userState.totalPhotosGenerated || 0} fotos</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-600 transition-all duration-1000" 
                          style={{ width: `${Math.min(100, ((userState.totalPhotosGenerated || 0) / 100) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Credit Release Message */}
                  {userState.subscriptionStartDate && userState.creditsReleased! < (userState.lastPurchaseAmount === 29.9 || userState.lastPurchaseAmount === 30 ? 300 : 120) && (
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 mb-4 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 text-purple-600">
                        <Sparkles size={16} />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-purple-900">Novos créditos em breve! ✨</p>
                        <p className="text-[10px] text-purple-700/80 leading-tight">
                          Fique de olho! Mais créditos serão liberados automaticamente durante sua jornada nos próximos dias.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Credit Release Timeline */}
                  {userState.subscriptionStartDate && (
                    <div className="bg-gray-900 rounded-2xl p-4 text-white shadow-lg">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-4">Cronograma de Créditos</h4>
                      <div className="space-y-4">
                        {(userState.lastPurchaseAmount === 19.9 || userState.lastPurchaseAmount === 20) ? (
                          // Basic Timeline
                          <>
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                              <div className="flex-1">
                                <p className="text-[11px] font-bold">Imediato: 60 Créditos</p>
                                <p className="text-[9px] text-gray-400">Recebido no ato da compra</p>
                              </div>
                              <Check size={14} className="text-green-500" />
                            </div>
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${userState.creditsReleased! >= 80 ? 'bg-green-500' : 'bg-gray-600'}`} />
                              <div className="flex-1">
                                <p className="text-[11px] font-bold">Dia 2: +20 Créditos</p>
                                <p className="text-[9px] text-gray-400">Liberação automática</p>
                              </div>
                              {userState.creditsReleased! >= 80 && <Check size={14} className="text-green-500" />}
                            </div>
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${userState.creditsReleased! >= 100 ? 'bg-green-500' : 'bg-gray-600'}`} />
                              <div className="flex-1">
                                <p className="text-[11px] font-bold">Dia 4: +20 Créditos</p>
                                <p className="text-[9px] text-gray-400">Finalização do pacote</p>
                              </div>
                              {userState.creditsReleased! >= 100 && <Check size={14} className="text-green-500" />}
                            </div>
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${userState.creditsReleased! >= 120 ? 'bg-green-500' : 'bg-gray-600'}`} />
                              <div className="flex-1 text-purple-300">
                                <p className="text-[11px] font-bold">Dia 6: +20 BÔNUS</p>
                                <p className="text-[9px] text-purple-400/60">Presente Pandora AI</p>
                              </div>
                              {userState.creditsReleased! >= 120 && <Check size={14} className="text-green-500" />}
                            </div>
                          </>
                        ) : (
                          // Premium Timeline
                          <>
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                              <div className="flex-1">
                                <p className="text-[11px] font-bold">Imediato: 150 Créditos</p>
                                <p className="text-[9px] text-gray-400">Recebido no ato da compra</p>
                              </div>
                              <Check size={14} className="text-green-500" />
                            </div>
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${userState.creditsReleased! >= 250 ? 'bg-green-500' : 'bg-gray-600'}`} />
                              <div className="flex-1">
                                <p className="text-[11px] font-bold">Dia 4: +100 Créditos</p>
                                <p className="text-[9px] text-gray-400">Liberação automática</p>
                              </div>
                              {userState.creditsReleased! >= 250 && <Check size={14} className="text-green-500" />}
                            </div>
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${userState.creditsReleased! >= 300 ? 'bg-green-500' : 'bg-gray-600'}`} />
                              <div className="flex-1">
                                <p className="text-[11px] font-bold">Dia 6: +50 Créditos</p>
                                <p className="text-[9px] text-gray-400">Finalização do pacote</p>
                              </div>
                              {userState.creditsReleased! >= 300 && <Check size={14} className="text-green-500" />}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                <div style={{ marginBottom: '20px', width: '100%', maxWidth: '400px' }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '11px', 
                    color: '#999', 
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    ÚLTIMO PLANO
                  </label>
                  
                  {userState.lastPlan ? (
                    <div style={{
                      background: 'linear-gradient(135deg, #f3e8ff, #fce7f3)',
                      border: '1px solid #e9d5ff',
                      borderRadius: '16px',
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                    }}>
                      {/* Ícone do plano */}
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: isPremium 
                          ? 'linear-gradient(135deg, #9333ea, #ec4899)' 
                          : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '22px',
                        flexShrink: 0,
                      }}>
                        {isPremium ? '👑' : '⚡'}
                      </div>

                      {/* Infos do plano */}
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: 'bold',
                          color: '#6b21a8',
                          marginBottom: '2px',
                        }}>
                          {isPremium ? 'Plano Premium' : (userState.lastPlan || 'Plano Básico')}
                        </div>
                        <div style={{
                          fontSize: '13px',
                          color: '#9333ea',
                          fontWeight: '500',
                        }}>
                          {userState.lastPurchaseCredits 
                            ? `${userState.lastPurchaseCredits} créditos` 
                            : isPremium ? '300 créditos' : '100 créditos'}
                          {userState.lastPurchaseAmount 
                            ? ` · R$ ${Number(userState.lastPurchaseAmount).toFixed(2).replace('.', ',')}` 
                            : ''}
                        </div>
                        {userState.subscriptionExpiresAt && userState.subscriptionTier === 'premium' ? (
                          <div style={{
                            fontSize: '11px',
                            color: '#db2777',
                            marginTop: '2px',
                            fontWeight: 'bold'
                          }}>
                            Expira em: {new Date(userState.subscriptionExpiresAt).toLocaleDateString('pt-BR')}
                          </div>
                        ) : userState.lastPurchaseDate && (
                          <div style={{
                            fontSize: '11px',
                            color: '#a855f7',
                            marginTop: '2px',
                          }}>
                            {new Date(userState.lastPurchaseDate?.toDate?.() || userState.lastPurchaseDate).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </div>
                        )}
                      </div>

                      {/* Badge status */}
                      <div style={{
                        background: '#dcfce7',
                        color: '#16a34a',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        padding: '4px 8px',
                        borderRadius: '20px',
                        flexShrink: 0,
                      }}>
                        ✓ ATIVO
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: '16px',
                      background: '#f9fafb',
                      borderRadius: '12px',
                      border: '1px dashed #e5e7eb',
                      textAlign: 'center',
                      color: '#9ca3af',
                      fontSize: '14px',
                    }}>
                      Nenhum plano comprado ainda
                    </div>
                  )}
                </div>

                {/* Card de Saldo Simplificado */}
                <div style={{
                  background: 'linear-gradient(135deg, #9333ea 0%, #ec4899 100%)',
                  borderRadius: '20px',
                  padding: '30px 24px',
                  marginBottom: '30px',
                  boxShadow: '0 10px 30px rgba(147, 51, 234, 0.3)',
                  position: 'relative',
                  overflow: 'hidden',
                  width: '100%'
                }}>
                  {/* Efeito de fundo */}
                  <div style={{
                    position: 'absolute',
                    top: '-50%',
                    right: '-20%',
                    width: '200px',
                    height: '200px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '50%',
                    filter: 'blur(40px)'
                  }} />
                  
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <p style={{
                      color: 'rgba(255, 255, 255, 0.9)',
                      fontSize: '14px',
                      marginBottom: '8px',
                      fontWeight: '500'
                    }}>
                      Saldo disponível
                    </p>
                    
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '20px'
                    }}>
                      <h2 style={{
                        color: 'white',
                        fontSize: '48px',
                        fontWeight: 'bold',
                        margin: 0,
                        textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)'
                      }}>
                        {userState.credits}
                      </h2>
                      
                      <span style={{
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: '16px',
                        fontWeight: '600'
                      }}>
                        créditos
                      </span>
                    </div>
                    
                    {/* Botão Recarregar */}
                    <button
                      onClick={() => {
                        // Abre o link direto do checkout dentro do app
                        if (onOpenCheckout) {
                          onOpenCheckout('https://checkout.pandoravesteai.com/');
                        } else {
                          window.open('https://checkout.pandoravesteai.com/', '_blank');
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '16px',
                        background: 'white',
                        color: '#9333ea',
                        border: 'none',
                        borderRadius: '14px',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        const target = e.target as HTMLButtonElement;
                        target.style.transform = 'translateY(-2px)';
                        target.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.15)';
                      }}
                      onMouseLeave={(e) => {
                        const target = e.target as HTMLButtonElement;
                        target.style.transform = 'translateY(0)';
                        target.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.1)';
                      }}>
                      <span style={{ fontSize: '20px' }}>+</span>
                      Recarregar Créditos
                    </button>
                  </div>
                </div>

                {/* History Section */}
                <div className="w-full">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-[#2E0249] flex items-center gap-2">
                            <Box size={18} className="text-purple-600" /> Meu Closet Virtual
                        </h3>
                        <div className="flex items-center gap-2">
                          {selectionMode ? (
                            <>
                              <span className="text-xs text-purple-600 font-bold">
                                {selectedItems.length} selecionado(s)
                              </span>
                              {selectedItems.length > 0 && (
                                <button
                                  onClick={handleDeleteSelected}
                                  className="flex items-center gap-1 bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full"
                                >
                                  <Trash2 size={12} /> Excluir
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  if (selectedItems.length === history.length) {
                                    setSelectedItems([]);
                                  } else {
                                    setSelectedItems(history.map(item => item.id));
                                  }
                                }}
                                className="text-xs text-purple-600 font-bold px-3 py-1.5 rounded-full border border-purple-200"
                              >
                                {selectedItems.length === history.length ? 'Desmarcar Tudo' : 'Selecionar Tudo'}
                              </button>
                              <button
                                onClick={() => { setSelectionMode(false); setSelectedItems([]); }}
                                className="text-xs text-gray-500 font-bold px-3 py-1.5 rounded-full border border-gray-200"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-gray-400">{history.length} criações</span>
                              {history.length > 0 && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setSelectionMode(true)}
                                    className="text-xs text-purple-600 font-bold px-3 py-1.5 rounded-full border border-purple-200"
                                  >
                                    Selecionar
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectionMode(true);
                                      setSelectedItems(history.map(item => item.id));
                                    }}
                                    className="text-xs text-purple-600 font-bold px-3 py-1.5 rounded-full border border-purple-200"
                                  >
                                    Tudo
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                    </div>

                    {history.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                                <ImageIcon size={24} />
                            </div>
                            <p className="text-gray-500 font-medium text-sm">Nenhuma criação ainda.</p>
                            <p className="text-gray-400 text-xs mt-1">Seus looks aparecerão aqui.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {history.map((item) => (
                                <button 
                                    key={item.id}
                                    onClick={() => {
                                      if (selectionMode) {
                                        setSelectedItems(prev => 
                                          prev.includes(item.id) 
                                            ? prev.filter(id => id !== item.id)
                                            : [...prev, item.id]
                                        );
                                      } else {
                                        setSelectedHistoryItem(item);
                                      }
                                    }}
                                    className={`relative aspect-[9/16] rounded-2xl overflow-hidden shadow-sm border-2 group transition-all
                                      ${selectionMode && selectedItems.includes(item.id) 
                                        ? 'border-purple-500 scale-95' 
                                        : 'border-gray-100'
                                      }`}
                                >
                                    <img 
                                      src={item.generatedImage} 
                                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                                      alt="History" 
                                    />
                                    
                                    {/* Overlay seleção */}
                                    {selectionMode && (
                                      <div className={`absolute inset-0 flex items-center justify-center transition-all
                                        ${selectedItems.includes(item.id) 
                                          ? 'bg-purple-500/40' 
                                          : 'bg-black/10'
                                        }`}
                                      >
                                        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center
                                          ${selectedItems.includes(item.id) 
                                            ? 'bg-purple-600 border-purple-600' 
                                            : 'bg-white/80 border-gray-300'
                                          }`}
                                        >
                                          {selectedItems.includes(item.id) && (
                                            <Check size={14} className="text-white" />
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Overlay hover normal */}
                                    {!selectionMode && (
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                          <p className="text-white text-[10px] font-bold">
                                              {new Date(item.date).toLocaleDateString()}
                                          </p>
                                          <p className="text-white/80 text-[10px]">
                                              {item.type === 'TEXT' ? 'Via Texto' : 'Via Upload'}
                                          </p>
                                      </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Links */}
                <div className="mt-12 w-full border-t border-gray-100 pt-6 space-y-3">
                    <button onClick={onOpenFAQ} className="w-full flex justify-between items-center text-sm text-purple-600 font-medium hover:text-purple-800 py-2">
                        Perguntas Frequentes (FAQ) <ArrowRight size={14} />
                    </button>
                </div>

                {/* Footer */}
                <div className="bg-gray-900 text-gray-400 py-8 px-6 text-center text-xs space-y-2 w-full mt-6 -mx-6 rounded-t-3xl">
                  <p>© 2026 Pandora AI. Todos os direitos reservados.</p>
                  <p className="opacity-50">Versão do Aplicativo: Versão 1.0.0 (Build 20260226)</p>
                </div>

                {/* Botão Admin */}
                {isAdmin && (
                  <button
                    onClick={onOpenAdmin}
                    style={{
                      width: '100%',
                      padding: '14px',
                      marginTop: '20px',
                      background: '#f97316',
                      color: '#000',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(249, 115, 22, 0.3)',
                      transition: 'all 0.3s ease'
                    }}>
                    Painel Administrativo 🛠️
                  </button>
                )}

                {/* Botão Sair */}
                <button
                  onClick={() => setShowLogoutModal(true)}
                  style={{
                    width: '100%',
                    padding: '14px',
                    marginTop: '40px',
                    background: 'transparent',
                    color: '#999',
                    border: '1px solid #ddd',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}>
                  Sair da Conta
                </button>

                {/* Modal de Confirmação de Logout */}
                {showLogoutModal && (
                  <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                  }}>
                    <div style={{
                      background: 'white',
                      borderRadius: '20px',
                      padding: '30px',
                      maxWidth: '340px',
                      width: '100%',
                      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                      animation: 'modal-appear 0.3s ease-out'
                    }}>
                      <h3 style={{
                        fontSize: '20px',
                        fontWeight: 'bold',
                        color: '#333',
                        marginBottom: '12px',
                        textAlign: 'center'
                      }}>
                        Tem certeza?
                      </h3>
                      
                      <p style={{
                        fontSize: '14px',
                        color: '#666',
                        marginBottom: '25px',
                        textAlign: 'center',
                        lineHeight: '1.5'
                      }}>
                        Você será desconectado e precisará fazer login novamente para continuar criando seus looks.
                      </p>
                      
                      <div style={{
                        display: 'flex',
                        gap: '12px'
                      }}>
                        <button
                          onClick={() => setShowLogoutModal(false)}
                          style={{
                            flex: 1,
                            padding: '14px',
                            background: '#f5f5f5',
                            color: '#666',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '15px',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}>
                          Cancelar
                        </button>
                        
                        <button
                          onClick={async () => {
                            try {
                              await signOut(auth);
                              setUserId('');
                              setUserState({ 
                                email: '', 
                                name: '', 
                                cellphone: '',
                                taxId: '',
                                profileImage: null,
                                uploadedImage: null,
                                sideImage: null,
                                backImage: null,
                                selectedCategory: null,
                                clothingImage: null,
                                generatedImage: null,
                                generated360Images: null,
                                credits: 0, 
                                history: [],
                                lastPlan: null 
                              });
                              setShowLogoutModal(false);
                              setScreen(Screen.LOGIN);
                            } catch (error) {
                              console.error('Erro ao sair:', error);
                              alert('Erro ao sair. Tente novamente.');
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '14px',
                            background: 'linear-gradient(135deg, #9333ea 0%, #ec4899 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '15px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(147, 51, 234, 0.4)'
                          }}>
                          Sim, sair
                        </button>
                      </div>
                    </div>
                    
                    <style>
                      {`
                        @keyframes modal-appear {
                          from {
                            opacity: 0;
                            transform: scale(0.9) translateY(-20px);
                          }
                          to {
                            opacity: 1;
                            transform: scale(1) translateY(0);
                          }
                        }
                      `}
                    </style>
                  </div>
                )}

                {/* Modal de Confirmação de Exclusão */}
                {showDeleteModal && (
                  <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                  }}>
                    <div style={{
                      background: 'white',
                      borderRadius: '20px',
                      padding: '28px',
                      maxWidth: '320px',
                      width: '100%',
                      textAlign: 'center',
                    }}>
                      <div style={{
                        width: '56px',
                        height: '56px',
                        background: '#fee2e2',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                        fontSize: '24px'
                      }}>
                        🗑️
                      </div>
                      <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
                        Excluir {selectedItems.length} imagem(ns)?
                      </h3>
                      <p style={{ fontSize: '13px', color: '#666', marginBottom: '24px' }}>
                        Esta ação não pode ser desfeita.
                      </p>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          onClick={() => setShowDeleteModal(false)}
                          style={{
                            flex: 1, padding: '12px',
                            background: '#f5f5f5', color: '#666',
                            border: 'none', borderRadius: '12px',
                            fontSize: '14px', fontWeight: '600',
                            cursor: 'pointer'
                          }}>
                          Cancelar
                        </button>
                        <button
                          onClick={confirmarExclusao}
                          style={{
                            flex: 1, padding: '12px',
                            background: '#ef4444', color: 'white',
                            border: 'none', borderRadius: '12px',
                            fontSize: '14px', fontWeight: '600',
                            cursor: 'pointer'
                          }}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                )}
            </div>
        </div>
    );
};

// --- FAQ Screen ---
const FAQScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="w-full min-h-screen bg-white flex flex-col animate-slide-up relative">
      {/* Header removido - agora no MainLayout */}
      <div className="flex-1 flex flex-col px-6 pt-6 pb-8">
        <h2 className="text-2xl font-bold text-[#2E0249] mb-6">Perguntas Frequentes</h2>
        
        <div className="space-y-3">
            {[
              {
                q: "Como faço para usar o Pandora AI?",
                a: "É muito simples! Na tela inicial, anexe uma foto sua com roupas normais. Em seguida, escolha a categoria da peça que deseja experimentar (camisas, calças, vestidos, etc.) e anexe a imagem da peça de roupa isolada. Nossa IA fará o processamento em segundos, aplicando a nova roupa ao seu corpo de forma realista."
              },
              {
                q: "Quais formatos de imagem são suportados?",
                a: "O Pandora AI suporta os formatos de imagem mais comuns: JPG, PNG e WEBP. Para melhores resultados, recomendamos fotos com boa iluminação e alta resolução."
              },
              {
                q: "Como funcionam os créditos?",
                a: "Cada geração de imagem ou \"Virtual Try-On\" consome uma quantidade específica de créditos. Você pode acompanhar seu saldo em tempo real no topo da tela inicial ou no seu perfil. Novos usuários ganham um teste grátis único para experimentar a ferramenta."
              },
              {
                q: "Como recarregar créditos?",
                a: "Basta clicar no botão \"+\" ao lado do seu saldo de créditos ou acessar a seção \"Planos\" no seu perfil. Você será direcionado ao nosso checkout seguro via Abacate Pay, onde poderá escolher o pacote que melhor lhe atende e pagar via Pix, Cartão ou Boleto."
              },
              {
                q: "Quais são os planos de assinatura?",
                a: "Oferecemos pacotes de créditos avulsos para usos pontuais e planos de assinatura mensal ou anual para usuários frequentes. Os planos de assinatura oferecem créditos renováveis todo mês com um desconto exclusivo."
              },
              {
                q: "O que acontece se meus créditos acabarem?",
                a: "Se o seu saldo chegar a zero, você ainda poderá navegar pelo app e ver seu histórico, mas não conseguirá realizar novas gerações. Uma tela de recarga aparecerá automaticamente para que você possa adquirir novos créditos e continuar criando."
              },
              {
                q: "Privacidade e Segurança. - Minhas fotos são seguras?",
                a: "Sim, a sua privacidade é nossa prioridade. Suas fotos são processadas de forma criptografada e utilizadas exclusivamente para a geração da imagem solicitada. Não armazenamos suas fotos originais permanentemente em nossos servidores públicos."
              },
              {
                q: "Como a IA garante que meu rosto não será alterado?",
                a: "Nossa tecnologia de IA foi treinada especificamente para identificar e preservar as características físicas do usuário. O algoritmo \"trava\" os pontos faciais, tom de pele, cabelo e olhos, aplicando as mudanças apenas na vestimenta. O resultado é você, apenas com um novo visual!"
              },
              {
                q: "Meus dados são compartilhados?",
                a: "Não vendemos nem compartilhamos seus dados pessoais ou fotos com terceiros para fins publicitários. Seus dados são usados apenas para gerenciar sua conta e melhorar a sua experiência dentro do Pandora AI."
              },
              {
                q: "Solução de Problemas - Minha imagem não foi processada, o que fazer?",
                a: "Isso pode acontecer devido a uma conexão instável de internet ou se a imagem enviada não for clara o suficiente. Verifique sua conexão e tente enviar uma foto com o corpo bem visível e boa iluminação. Se o problema persistir e os créditos forem consumidos, entre em contato com nosso suporte."
              },
              {
                q: "O resultado não ficou como esperado.",
                a: "Para um resultado perfeito, certifique-se de que a foto da peça de roupa esteja bem nítida e, preferencialmente, em um fundo neutro. Evite fotos de roupas em modelos ou com muitas dobras. Você também pode usar o \"Controle de Intensidade\" na tela de resultado para ajustar o caimento."
              }
            ].map((item, idx) => (
              <details key={idx} className="group bg-gray-50 rounded-xl overflow-hidden border border-purple-200">
                <summary className="flex items-center justify-between p-4 cursor-pointer list-none font-bold text-purple-700 text-sm hover:bg-purple-50 transition-colors">
                  {item.q}
                  <span className="transition-transform group-open:rotate-180 text-purple-400">
                    <ChevronDown size={16} />
                  </span>
                </summary>
                <div className="px-4 pb-4 text-xs text-gray-600 leading-relaxed border-t border-purple-100 pt-2">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
      </div>
    </div>
  );
};


// --- Credit Alert System ---
const getBannerConfig = (credits: number) => {
  if (credits === 0) {
    return {
      level: 6,
      backgroundImage: 'linear-gradient(135deg, #2E0249, #4B0082, #2E0249, #4B0082)',
      backgroundSize: '400% 400%',
      icon: '🚫',
      title: 'Seus créditos acabaram',
      text: 'Você está perdendo looks incríveis agora. Recarregue para continuar!',
      buttonText: '✨ Recarregar agora',
      buttonPulse: 'animate-pulse-strong',
      shadow: 'shadow-[0_10px_30px_rgba(46,2,73,0.5)]',
      buttonBorder: 'border-[#FFD700]',
      // Animations
      bgAnimation: 'level6Gradient 1.5s ease infinite',
      iconAnimation: 'iconSpinDramatic 2s ease-in-out infinite',
      titleAnimation: 'pulse 1s ease-in-out infinite',
      shadowAnimation: 'level6Pulse 1s ease-in-out infinite, level6Shake 1.5s ease-in-out infinite, level6NeonBorder 1s ease-in-out infinite',
      shimmerDuration: 1.5,
      buttonAnimation: 'buttonGlow 0.8s ease-in-out infinite',
      buttonBg: 'linear-gradient(135deg, #FFD700, #FFA500)',
      containerBorder: '2px solid rgba(138, 43, 226, 0.5)'
    };
  }
  if (credits <= 10) {
    return {
      level: 5,
      backgroundImage: 'linear-gradient(135deg, #6A00F4, #C90076, #6A00F4)',
      backgroundSize: '200% 200%',
      icon: '🔥',
      title: 'Só 10 créditos restantes!',
      text: 'Não deixe a inspiração parar. Recarregue antes que acabe!',
      buttonText: '🔥 Recarregar agora',
      buttonPulse: 'animate-pulse-soft',
      shadow: 'shadow-[0_8px_25px_rgba(106,0,244,0.4)]',
      buttonBorder: 'border-white',
      // Animations
      bgAnimation: 'level5Gradient 2s ease infinite',
      iconAnimation: 'pulse 1s ease-in-out infinite, iconSpin 2s ease-in-out infinite',
      titleAnimation: 'pulse 1.2s ease-in-out infinite',
      shadowAnimation: 'level5Pulse 1.2s ease-in-out infinite, level5Shake 2s ease-in-out infinite, level5NeonBorder 1.2s ease-in-out infinite',
      shimmerDuration: 1.5,
      buttonAnimation: 'buttonGlow 1s ease-in-out infinite',
      buttonBg: 'linear-gradient(135deg, #FF4500, #DC143C)',
      containerBorder: '2px solid rgba(106, 0, 244, 0.5)'
    };
  }
  if (credits <= 20) {
    return {
      level: 4,
      backgroundImage: 'linear-gradient(135deg, #7B2CBF, #9D4EDD, #7B2CBF)',
      backgroundSize: '200% 200%',
      icon: '🔥',
      title: 'Apenas 20 créditos!',
      text: 'Está acabando! Garanta mais créditos e continue criando.',
      buttonText: '🔥 Recarregar',
      shadow: 'shadow-[0_6px_20px_rgba(123,44,191,0.3)]',
      buttonBorder: 'border-white',
      // Animations
      bgAnimation: 'level4Gradient 2.5s ease infinite',
      iconAnimation: 'pulse 1.5s ease-in-out infinite, iconSpin 3s ease-in-out infinite',
      titleAnimation: 'pulse 1.5s ease-in-out infinite',
      shadowAnimation: 'level4Pulse 1.5s ease-in-out infinite, level4Shake 3s ease-in-out infinite',
      shimmerDuration: 2,
      buttonAnimation: 'buttonGlow 1.5s ease-in-out infinite',
      containerBorder: '2px solid rgba(123, 44, 191, 0.5)'
    };
  }
  if (credits <= 30) {
    return {
      level: 3,
      backgroundImage: 'linear-gradient(135deg, #9D4EDD, #C77DFF, #9D4EDD)',
      backgroundSize: '200% 200%',
      icon: '⚡',
      title: '30 créditos restantes',
      text: 'Está na metade! Recarregue agora e continue se reinventando.',
      buttonText: '+ Recarregar',
      shadow: 'shadow-[0_4px_15px_rgba(157,78,221,0.2)]',
      buttonBorder: 'border-white',
      // Animations
      bgAnimation: 'level3Gradient 3s ease infinite',
      iconAnimation: 'pulse 2s ease-in-out infinite, iconBounce 2s ease-in-out infinite',
      titleAnimation: 'pulse 2s ease-in-out infinite',
      shadowAnimation: 'level3Pulse 2s ease-in-out infinite',
      shimmerDuration: 3,
      buttonAnimation: 'buttonGlow 2s ease-in-out infinite',
      containerBorder: '2px solid rgba(157, 78, 221, 0.3)'
    };
  }
  if (credits <= 40) {
    return {
      level: 2,
      backgroundImage: 'linear-gradient(135deg, #C77DFF, #E0AAFF, #C77DFF)',
      backgroundSize: '200% 200%',
      icon: '⚡',
      title: '40 créditos restantes',
      text: 'Garanta mais créditos e continue explorando novos looks.',
      buttonText: '+ Recarregar',
      shadow: 'shadow-[0_4px_12px_rgba(199,125,255,0.15)]',
      buttonBorder: 'border-purple-500',
      // Animations
      bgAnimation: 'level2Gradient 4s ease infinite',
      iconAnimation: 'pulse 2.5s ease-in-out infinite',
      titleAnimation: 'pulse 2.5s ease-in-out infinite',
      shadowAnimation: 'level2Shadow 2.5s ease-in-out infinite',
      shimmerDuration: 3.5,
      buttonAnimation: 'buttonGlow 2.5s ease-in-out infinite'
    };
  }
  if (credits <= 50) {
    return {
      level: 1,
      backgroundImage: 'linear-gradient(135deg, #E0AAFF, #F7EFFF, #E0AAFF)',
      backgroundSize: '200% 200%',
      icon: '✨',
      title: '50 créditos restantes',
      text: 'Considere recarregar para não perder o ritmo!',
      buttonText: '+ Recarregar',
      shadow: 'shadow-[0_4px_10px_rgba(224,170,255,0.1)]',
      buttonBorder: 'border-purple-500',
      // Animations
      bgAnimation: 'level1Gradient 5s ease infinite',
      iconAnimation: 'pulse 3s ease-in-out infinite',
      titleAnimation: 'pulse 3s ease-in-out infinite',
      shadowAnimation: 'level1Shadow 3s ease-in-out infinite',
      shimmerDuration: 4,
      buttonAnimation: 'buttonGlow 3s ease-in-out infinite'
    };
  }
  return null;
};

const CreditAlertBanner: React.FC<{ credits: number; onOpenCredits: () => void }> = ({ credits, onOpenCredits }) => {
  const config = getBannerConfig(credits);
  if (!config) return null;

  return (
    <div 
      className={`w-full my-1 px-4 py-2 flex items-center gap-3 rounded-xl transition-all duration-500 relative overflow-hidden ${config.shadow}`}
      style={{ 
        backgroundImage: config.backgroundImage,
        backgroundSize: config.backgroundSize,
        animation: `${config.bgAnimation}, slideInDownDrammatic 0.5s ease-out, ${config.shadowAnimation}`,
        willChange: 'transform, background-position, box-shadow'
      }}
    >
      {/* Shimmer effect */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
          animation: `shimmer ${config.shimmerDuration} infinite`,
        }}
      />

      <div 
        className="text-lg flex-shrink-0 z-10"
        style={{ animation: config.iconAnimation }}
      >
        {config.icon}
      </div>
      
      <div className="flex-1 text-left z-10">
        <h4 
          className="text-white font-bold text-sm leading-tight"
          style={{ animation: config.titleAnimation }}
        >
          {config.title}
        </h4>
        <p className="text-white/80 text-[10px] leading-tight">
          {config.text}
        </p>
      </div>

      <button 
        onClick={onOpenCredits}
        className={`
          px-4 py-1.5 bg-white text-purple-700 font-bold text-[11px] rounded-full border-2 
          transition-all hover:scale-105 active:scale-95 whitespace-nowrap z-10
          ${config.buttonBorder}
        `}
        style={{
          animation: 'buttonPulseGlow 1.5s infinite'
        }}
      >
        {config.buttonText}
      </button>
    </div>
  );
};

const PremiumBanner: React.FC<{ onUpgrade: () => void }> = ({ onUpgrade }) => {
  return (
    <div className="w-full my-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-500 flex items-center gap-3 shadow-lg rounded-xl relative overflow-hidden animate-pulse-soft">
      <div className="absolute top-0 right-0 p-1 opacity-10">
        <Sparkles size={30} className="text-white" />
      </div>
      <div className="flex-1 text-left z-10">
        <h4 className="text-white font-bold text-sm leading-tight flex items-center gap-1.5 justify-start">
          <Zap size={16} className="text-yellow-300" /> Plano Premium 🚀
        </h4>
        <p className="text-white/80 text-[10px] leading-tight">
          Libere 360°, formatos Instagram e ganhe 300 créditos!
        </p>
      </div>
      <button 
        onClick={onUpgrade}
        className="px-4 py-1.5 bg-white text-purple-700 font-bold text-[11px] rounded-full shadow-md hover:scale-105 active:scale-95 transition-all z-10"
      >
        Assinar
      </button>
    </div>
  );
};

const VipGroupModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl relative border border-purple-100"
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-10 h-10 bg-white/80 hover:bg-white text-[#2E0249] rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-all active:scale-90"
        >
          <X size={20} />
        </button>

        <div className="p-8 flex flex-col items-center text-center">
          {/* Main Image */}
          <div className="w-full mb-6 mt-4">
            <img 
              src="https://i.postimg.cc/GhLVXkhh/Untitled-design-(5).jpg" 
              alt="Promo" 
              className="w-full h-64 object-cover rounded-2xl border-2 border-purple-500 shadow-md"
              referrerPolicy="no-referrer"
            />
          </div>

          <h3 className="text-xl font-extrabold text-[#2E0249] mb-4 leading-tight">
            Entre agora no grupo exclusivo de promos e cupons feito para você!
          </h3>
          
          <p className="text-sm text-gray-600 mb-8 font-medium leading-relaxed">
            Roupas exclusivas que estão em alta com <span className="text-purple-600 font-bold bg-purple-50 px-2 py-0.5 rounded-md">60% de desconto</span>.
          </p>

          <button
            onClick={() => window.open('https://chat.whatsapp.com/JLFXFOrgpjx1TKCeWkXcnb?mode=gi_t', '_blank')}
            className="w-full bg-gradient-to-r from-[#6A00F4] to-[#EC4899] text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-purple-200 hover:opacity-90 active:scale-[0.97] transition-all flex items-center justify-center gap-3 group"
          >
            <MessageCircle size={22} className="group-hover:rotate-12 transition-transform" />
            Entrar no Grupo VIP
          </button>
          
        </div>
      </motion.div>
    </div>
  );
};

const MainLayout: React.FC<{
  children: React.ReactNode;
  credits: number;
  onOpenCredits: () => void;
  onOpenFAQ: () => void;
  onOpenPremiumModal?: () => void;
  showBanner?: boolean;
  isPremium?: boolean;
  onBack?: () => void;
  backIcon?: 'arrow' | 'x';
  styleTags?: string[];
  chestReady?: boolean;
  onOpenChest?: () => void;
}> = ({ 
  children, 
  credits, 
  onOpenCredits, 
  onOpenFAQ, 
  onOpenPremiumModal, 
  showBanner = true, 
  isPremium = false, 
  onBack, 
  backIcon = 'arrow', 
  styleTags = [],
  chestReady = false,
  onOpenChest
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(0, 0);
    }
  }, [children]);

  const [showCreditsInfo, setShowCreditsInfo] = useState(false);
  const [showFeedModal, setShowFeedModal] = useState(false);
  const [showVipGroupModal, setShowVipGroupModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [hackedDeals, setHackedDeals] = useState<{title: string, price: string, platform: string, url: string}[]>([]);

  const scanForDeals = async () => {
    setIsScanning(true);
    setHackedDeals([]);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Encontre 5 promoções reais e atuais de roupas (moda feminina ou masculina) nos sites Mercado Livre Brasil, Shopee Brasil e Shein Brasil. 
      Retorne apenas um JSON válido com um array de objetos contendo: title (nome do produto), price (preço em R$), platform (nome da loja), url (link direto da oferta).
      Foque em itens com mais de 30% de desconto.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        }
      });

      const text = response.text;
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        setHackedDeals(data);
      } else if (data.deals && Array.isArray(data.deals)) {
        setHackedDeals(data.deals);
      }
    } catch (error) {
      console.error("Erro no scanner:", error);
    } finally {
      setIsScanning(false);
    }
  };

  const personalizedOffers = useMemo(() => {
    const today = new Date();
    const dateSeed = today.getDate() + today.getMonth() + today.getFullYear();
    
    if (styleTags.length === 0) {
      return [];
    }
    
    // Pega as tags únicas e mais recentes
    const uniqueTags = [...new Set(styleTags)].reverse().slice(0, 6);
    return uniqueTags.map((tag, i) => {
      // Gera um desconto "aleatório" mas consistente para o dia
      const tagSeed = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const discount = ((dateSeed + tagSeed + i) % 30) + 10;
      
      return {
        tag,
        type: i === 0 ? 'Super Desconto' : (i % 2 === 0 ? 'Oferta do Dia' : 'Promoção'),
        discount: `${discount}%`
      };
    });
  }, [styleTags]);

  const lastUpdate = useMemo(() => {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }, []);

  const badgeConfig = (() => {
    if (credits <= 10) {
      return {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-600',
        icon: <AlertTriangle size={12} />
      };
    }
    if (credits <= 20) {
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-600',
        icon: <Zap size={12} />
      };
    }
    return {
      bg: 'bg-purple-50',
      border: 'border-purple-100',
      text: 'text-purple-700',
      icon: null
    };
  })();

  return (
    <div className="w-full h-screen bg-white flex flex-col overflow-hidden animate-fade-in font-sans relative">
      {showCreditsInfo && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative text-center">
            <button onClick={() => setShowCreditsInfo(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 text-purple-600">
              <Zap size={32} />
            </div>
            <h3 className="text-xl font-bold text-[#2E0249] mb-2">Sistema de Créditos</h3>
            <p className="text-gray-600 text-sm mb-6">
              Cada geração de look consome 10 créditos. Você pode recarregar seus créditos a qualquer momento para continuar transformando seu estilo!
            </p>
            <Button onClick={() => { setShowCreditsInfo(false); onOpenCredits(); }}>
              Gerenciar Créditos
            </Button>
          </div>
        </div>
      )}

      {showFeedModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-purple-50">
              <div className="flex flex-col">
                <h3 className="text-sm font-bold text-purple-900 flex items-center gap-2">
                  <Sparkles size={16} /> Feed de Achados
                </h3>
                <span className="text-[8px] font-bold text-purple-400 uppercase tracking-widest">Atualizado hoje: {lastUpdate}</span>
              </div>
              <button onClick={() => setShowFeedModal(false)} className="text-purple-400 hover:text-purple-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
              <div className="bg-purple-50 rounded-2xl p-4 mb-4 border border-purple-100 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-purple-600"></div>
                <p className="text-[10px] text-purple-800 leading-relaxed italic">
                  "Sincronizamos seu closet virtual com as melhores ofertas do dia. Aproveite os descontos exclusivos para você!"
                </p>
              </div>

              {/* Hacker Scanner Button */}
              <button 
                onClick={scanForDeals}
                disabled={isScanning}
                className="w-full mb-6 p-4 bg-black rounded-2xl border border-green-500/30 flex flex-col items-center gap-2 group relative overflow-hidden active:scale-95 transition-all"
              >
                {isScanning && (
                  <div className="absolute inset-0 bg-green-500/10 animate-pulse"></div>
                )}
                <div className="flex items-center gap-2 text-green-500">
                  <Terminal size={16} className={isScanning ? "animate-bounce" : ""} />
                  <span className="text-[10px] font-mono font-bold tracking-widest uppercase">
                    {isScanning ? "Rastreando Promoções..." : "Ativar Scanner Hacker"}
                  </span>
                </div>
                <p className="text-[8px] font-mono text-green-500/60 text-center">
                  {isScanning ? "Interceptando pacotes de dados..." : "Busca profunda em tempo real (ML, Shopee, Shein)"}
                </p>
              </button>

              {isScanning ? (
                <div className="py-12 flex flex-col items-center justify-center gap-4">
                  <div className="relative w-20 h-20">
                    <div className="absolute inset-0 border-2 border-green-500/20 rounded-full"></div>
                    <div className="absolute inset-0 border-t-2 border-green-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-4 border border-green-500/40 rounded-full animate-pulse"></div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-[10px] font-mono text-green-500 animate-pulse">SCANNING_NETWORK...</p>
                    <div className="flex gap-1">
                      <div className="w-1 h-1 bg-green-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-1 h-1 bg-green-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-1 h-1 bg-green-500 rounded-full animate-bounce"></div>
                    </div>
                  </div>
                </div>
              ) : hackedDeals.length > 0 ? (
                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-mono font-bold text-green-600 uppercase tracking-widest">Resultados Encontrados</h4>
                    <span className="text-[8px] font-mono text-green-500/50">MATCH_COUNT: {hackedDeals.length}</span>
                  </div>
                  {hackedDeals.map((deal, i) => (
                    <a 
                      key={i}
                      href={deal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 bg-black border border-green-500/20 rounded-xl hover:border-green-500/50 transition-all group"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[8px] font-mono text-green-500/60 uppercase">{deal.platform}</span>
                        <span className="text-[10px] font-mono font-bold text-green-400">{deal.price}</span>
                      </div>
                      <p className="text-[11px] font-mono text-white leading-tight mb-2 group-hover:text-green-400 transition-colors">{deal.title}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          <div className="w-1 h-1 bg-green-500 rounded-full"></div>
                          <div className="w-1 h-1 bg-green-500 rounded-full opacity-50"></div>
                          <div className="w-1 h-1 bg-green-500 rounded-full opacity-20"></div>
                        </div>
                        <span className="text-[8px] font-mono text-green-500 font-bold uppercase group-hover:translate-x-1 transition-transform">Acessar Oferta →</span>
                      </div>
                    </a>
                  ))}
                  <button 
                    onClick={() => setHackedDeals([])}
                    className="w-full py-2 text-[9px] font-mono text-gray-500 hover:text-red-500 transition-colors"
                  >
                    [ LIMPAR_CACHE ]
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {personalizedOffers.length > 0 ? (
                    personalizedOffers.map((item, i) => (
                      <a 
                        key={i}
                        href={`https://www.google.com/search?q=comprar+${item.tag.toLowerCase()}+desconto+promoção&tbm=shop`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-2xl hover:shadow-md transition-shadow group relative"
                      >
                        <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center relative overflow-hidden">
                          <ShoppingBag size={18} className="text-gray-300 group-hover:scale-110 transition-transform" />
                          <div className="absolute top-1 right-1 bg-red-500 w-1.5 h-1.5 rounded-full"></div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] font-bold text-purple-400 uppercase tracking-tighter">{item.type}</p>
                            <span className="bg-green-100 text-green-700 text-[8px] font-bold px-1.5 py-0.5 rounded-full">-{item.discount}</span>
                          </div>
                          <p className="text-xs font-bold text-[#2E0249]">{item.tag}</p>
                          <p className="text-[10px] font-bold text-green-600">Ver preço com desconto</p>
                        </div>
                        <ChevronRight size={16} className="text-gray-300" />
                      </a>
                    ))
                  ) : (
                    <div className="py-8 flex flex-col items-center text-center px-4">
                      <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-300 mb-3">
                        <Box size={24} />
                      </div>
                      <p className="text-xs font-bold text-[#2E0249] mb-1">Feed Vazio</p>
                      <p className="text-[10px] text-gray-500">Gere novos looks para que a IA possa encontrar as melhores ofertas para você!</p>
                    </div>
                  )}
                </div>
              )}


            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100">
              <Button onClick={() => setShowFeedModal(false)} className="w-full py-3 text-sm">
                Fechar Feed
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full h-16 bg-white flex items-center justify-between px-3 md:px-6 sticky top-0 z-50 border-b border-gray-50/50 backdrop-blur-sm bg-white/95">
        <div className="flex items-center gap-1 md:gap-2">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-[#2E0249] transition-colors active:scale-90">
              {backIcon === 'x' ? <X size={22} /> : <ArrowLeft size={18} />}
            </button>
          )}
          <div className="flex items-center gap-1.5 md:gap-2.5">
            <img 
              src="https://i.postimg.cc/G2DYHjrv/P-(1).png" 
              alt="Logo" 
              className="w-6 h-6 md:w-7 md:h-7 object-contain" 
            />
            <span className="text-base md:text-lg font-semibold text-[#2E0249] tracking-tight font-['Inter'] whitespace-nowrap">
              Pandora AI
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-1 md:gap-2">
          {chestReady && (
            <button 
              onClick={onOpenChest}
              className="w-8 h-8 rounded-full bg-yellow-400 text-purple-900 flex items-center justify-center shadow-lg hover:bg-yellow-300 transition-all active:scale-95 relative animate-bounce"
            >
              <Archive size={16} />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></div>
            </button>
          )}

          <button 
            onClick={() => setShowVipGroupModal(true)}
            className="w-8 h-8 rounded-full bg-white border border-gray-100 text-purple-600 flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors active:scale-95 relative"
          >
            <MessageCircle size={16} />
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></div>
          </button>

          <div 
            onClick={() => setShowCreditsInfo(true)}
            className={`flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${badgeConfig.bg} ${badgeConfig.border} ${badgeConfig.text}`}
          >
            <span className="text-xs font-bold">{credits} <span className="hidden sm:inline">Créditos</span></span>
            {badgeConfig.icon}
          </div>
          <button 
            onClick={onOpenCredits}
            className="w-8 h-8 rounded-full bg-[#6A00F4] text-white flex items-center justify-center shadow-md hover:bg-[#5800cc] transition-colors active:scale-95"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar">
        {showBanner && (
          <div className="px-6">
            <CreditAlertBanner credits={credits} onOpenCredits={onOpenCredits} />
            {!isPremium && <PremiumBanner onUpgrade={onOpenCredits} />}
          </div>
        )}
        {children}
      </div>

      <VipGroupModal isOpen={showVipGroupModal} onClose={() => setShowVipGroupModal(false)} />
    </div>
  );
};

const HomeScreen: React.FC<{ 
    onUpload: (url: string) => void; 
    onContinue: () => void;
    uploadedImage?: string | null;
    userName?: string;
    onOpenFAQ: () => void;
    isFirstLogin?: boolean;
    isPremium?: boolean;
    onGuiaVisto?: () => void;
    userId?: string;
    userState?: UserState;
    setShowChestNotification?: (show: boolean) => void;
}> = ({ onUpload, onContinue, uploadedImage, userName = 'Usuário', onOpenFAQ, isFirstLogin = false, isPremium = false, onGuiaVisto, userId, userState, setShowChestNotification }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPhotoGuide, setShowPhotoGuide] = useState(false);

  useEffect(() => {
    if (isFirstLogin) {
      const timer = setTimeout(() => {
        setShowPhotoGuide(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isFirstLogin]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      onUpload(url);
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleDefaultUpload = () => {
    onUpload('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&q=80');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const url = URL.createObjectURL(e.dataTransfer.files[0]);
      onUpload(url);
    }
  };

  return (
    <>
      {/* Modals */}
      {showPhotoGuide && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
            <button onClick={() => setShowPhotoGuide(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
            <h3 className="text-xl font-bold text-[#2E0249] mb-4 flex items-center gap-2">
              <Info className="text-purple-600" /> Guia de Foto Perfeita
            </h3>
            
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-green-600 mb-2 flex items-center gap-2"><Check size={16} /> Boas Práticas</h4>
                <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
                  <li>Pessoa em pé e de corpo inteiro.</li>
                  <li>Boa iluminação (luz natural é melhor).</li>
                  <li>Fundo neutro e sem bagunça.</li>
                  <li>Roupas mais justas ajudam a IA.</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold text-red-500 mb-2 flex items-center gap-2"><X size={16} /> O que Evitar</h4>
                <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
                  <li>Fotos cortadas (sem cabeça ou pés).</li>
                  <li>Pessoas sentadas ou deitadas.</li>
                  <li>Roupas muito largas (escondem o corpo).</li>
                  <li>Objetos na frente do corpo.</li>
                </ul>
              </div>
            </div>
            
            <Button onClick={() => { 
              setShowPhotoGuide(false); 
              if (onGuiaVisto) onGuiaVisto();
            }} className="mt-6">Entendi!</Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar pb-6 space-y-6">
        <div className="px-6 mt-2">
          <h1 className="text-lg font-bold text-[#2E0249] leading-tight">
            Olá, {userName}!
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-light">
            Experimente novos estilos com IA
          </p>
        </div>

        {/* Daily Chest Notification/Button - REMOVED FROM HERE */}

        <div className="w-full px-2">
          <HomeCarousel 
            images={HOME_CAROUSEL_1} 
            borderRadiusClass="rounded-2xl" 
            interval={3000}
            indicatorPosition="top-right"
            borderColorClass="border-purple-500/80"
          />
        </div>

        <div className="px-6 flex flex-col gap-4 mt-2">
          <div className="text-center mb-2">
            <h2 className="text-2xl font-bold text-[#2E0249] leading-tight">
              O protagonista é <span className="text-[#6A00F4]">você</span>!
            </h2>
            <p className="text-xs text-gray-500 mt-2 tracking-wide">
              Envie sua foto e transforme-se em 3 segundos.
            </p>
          </div>

          {/* Privacy Assurance Block */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3 items-start">
            <ShieldCheck className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h4 className="text-xs font-bold text-blue-800 uppercase mb-1">Privacidade Garantida</h4>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                Sua identidade é nossa prioridade. Nossa IA garante que seu rosto, cabelo e corpo permaneçam inalterados. Apenas a roupa será substituída. Você está no controle!
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center pl-1 pr-1">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sua Foto</span>
              <button 
                onClick={() => setShowPhotoGuide(true)} 
                className={`flex items-center gap-1 text-[10px] font-bold uppercase hover:underline transition-all
                  ${isFirstLogin 
                    ? 'text-white bg-purple-600 px-3 py-1.5 rounded-full animate-pulse shadow-lg shadow-purple-300' 
                    : 'text-purple-600'
                  }`}
              >
                <Info size={12} /> Guia de Foto
              </button>
            </div>
            
            <div 
              onClick={triggerUpload}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 group relative overflow-hidden h-48
                ${isDragging ? 'border-purple-500 bg-purple-50 scale-[1.02]' : 'border-gray-200 bg-white hover:bg-purple-50'}
              `}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/png, image/jpeg, image/webp"
                onChange={handleFileChange}
              />
              
              {isDragging && (
                <div className="absolute inset-0 bg-purple-100/50 flex items-center justify-center z-10">
                  <p className="text-purple-700 font-bold animate-bounce">Solte a imagem aqui!</p>
                </div>
              )}

              {uploadedImage ? (
                <div className="absolute inset-0 w-full h-full bg-white">
                  <img src={uploadedImage} className="w-full h-full object-contain" alt="Uploaded" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="bg-white/20 backdrop-blur-md p-3 rounded-full border border-white/30">
                      <Upload className="text-white" size={28} />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-transform duration-300 ${isDragging ? 'scale-110 bg-purple-200' : 'bg-purple-50 group-hover:scale-110'}`}>
                    <Upload className="text-[#6A00F4]" size={28} />
                  </div>
                  <div className="space-y-1 text-center">
                    <p className="font-bold text-[#2E0249] text-sm">Começar a Transformação</p>
                    <p className="text-[10px] text-gray-400">Arraste ou clique para enviar (JPG, PNG, WEBP)</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button onClick={triggerUpload} className="flex items-center justify-center gap-2 py-3 px-4 bg-white border border-gray-200 rounded-xl shadow-sm active:scale-95 transition-transform hover:bg-gray-50">
              <ImageIcon size={18} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-600">Galeria</span>
            </button>
            <button onClick={triggerUpload} className="flex items-center justify-center gap-2 py-3 px-4 bg-[#6A00F4] text-white rounded-xl shadow-md shadow-purple-200 active:scale-95 transition-transform hover:bg-[#5800cc]">
              <CameraIcon size={18} className="text-white" />
              <span className="text-sm font-medium">Tirar Foto Agora</span>
            </button>
          </div>

          <div className="mt-6 mb-2">
            <Button onClick={onContinue} disabled={!uploadedImage}>
               Continuar <ArrowRight size={20} />
            </Button>
          </div>

          <div className="mt-2 text-center">
            <div className="flex items-center justify-center gap-1.5 mt-3">
                <Lock size={10} className="text-gray-400" />
                <p className="text-[10px] text-gray-400">Sua foto é segura e privada.</p>
            </div>
          </div>
        </div>

        <div className="w-full px-4 pb-4">
           <PromoCarousel isPremium={isPremium} />
        </div>

        {/* FAQ Link */}
        <div className="px-6 pb-8 text-center">
          <button 
            onClick={onOpenFAQ}
            className="text-purple-600 font-medium hover:text-purple-800 transition-colors"
          >
            Perguntas Frequentes e FAQ
          </button>
        </div>

        {/* Footer */}
        <div className="bg-gray-900 text-gray-400 py-8 px-6 text-center text-xs space-y-2">
          <p>© 2026 Pandora AI. Todos os direitos reservados.</p>
          <p className="opacity-50">Versão do Aplicativo: Versão 1.0.0 (Build 20260226)</p>
        </div>
      </div>
    </>
  );
};

const CategoryScreen: React.FC<{ onSelect: (id: string) => void; onBack: () => void; isPremium?: boolean; onOpenPremiumModal?: () => void }> = ({ onSelect, onBack, isPremium = false, onOpenPremiumModal }) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const handleContinue = () => {
    if (selectedCategory) {
      const category = CATEGORIES.find(c => c.id === selectedCategory);
      if (category?.badge === 'Premium' && !isPremium) {
        onOpenPremiumModal?.();
        return;
      }
      onSelect(selectedCategory);
    }
  };

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col animate-fade-in overflow-hidden relative">
      <div className="text-center px-6 py-4 bg-white z-20 shadow-sm shrink-0">
          <h2 className="text-xl font-bold text-[#2E0249] leading-relaxed">Escolha o que deseja experimentar</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4 pb-32">
        {CATEGORIES.map((cat) => (
          <button 
            key={cat.id} 
            onClick={() => setSelectedCategory(cat.id)} 
            className={`group relative rounded-3xl overflow-hidden shadow-sm transition-all duration-300 transform hover:-translate-y-1 bg-white ${cat.span ? 'col-span-2 h-64' : 'h-48'} ${selectedCategory === cat.id ? 'ring-4 ring-purple-500 ring-offset-2 rounded-3xl' : ''}`}
            style={{ borderRadius: '1.5rem' }} // Force rounded corners
          >
            <img src={cat.image} alt={cat.label} className="w-full h-full object-cover opacity-90 group-hover:scale-110 transition-transform duration-700" />
            
            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-4">
              <span className="text-white font-bold text-lg leading-tight text-left drop-shadow-md">{cat.label}</span>
              <div className={`h-1 bg-purple-500 rounded-full mt-2 transition-all duration-300 ${selectedCategory === cat.id ? 'w-full' : 'w-0 group-hover:w-8'}`}></div>
            </div>

            {/* Badges */}
            {cat.badge && (
              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg shadow-sm">
                <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">{cat.badge}</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white border-t border-gray-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-30">
        <div className="max-w-lg mx-auto">
          <Button 
            onClick={handleContinue} 
            disabled={!selectedCategory}
            className={!selectedCategory ? 'opacity-50 cursor-not-allowed' : ''}
          >
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
};

const FinalizeScreen: React.FC<{ 
  category: string; 
  userImage: string | null; 
  onGenerate: (clothingImage: string) => void;
  onRestart: () => void;
  onBack: () => void;
  loading: boolean;
  isPremium?: boolean;
  initialClothingImage?: string | null;
}> = ({ category, userImage, onGenerate, onRestart, onBack, loading, isPremium = false, initialClothingImage = null }) => {
  const [clothingImage, setClothingImage] = useState<string | null>(initialClothingImage);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showGifGuide, setShowGifGuide] = useState(false);
  const [showClothingCheck, setShowClothingCheck] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [gifGuiaVisto, setGifGuiaVisto] = useState(() => {
    return localStorage.getItem('gif_guia_visto') === 'true';
  });
  const [clothingCheckVisto, setClothingCheckVisto] = useState(() => {
    return localStorage.getItem('clothing_check_visto') === 'true';
  });

  const podeGerar = clothingImage && clothingImage.startsWith('data:image');

  const getScreenTexts = (categoryId: string) => {
    switch (categoryId) {
      case 'blusa': return { title: <>A blusa do <span className="text-[#6A00F4]">look</span>.</>, subtitle: "Personalize os detalhes.", label: "FOTO DA BLUSA", placeholder: "Arraste ou selecione a imagem da peça (ex: uma camisa neutra)" };
      case 'calca': return { title: <>A calça do <span className="text-[#6A00F4]">look</span>.</>, subtitle: "Personalize os detalhes.", label: "FOTO DA CALÇA", placeholder: "Arraste ou selecione a imagem da peça (ex: uma calça jeans)" };
      case 'short': return { title: <>O short/bermuda do <span className="text-[#6A00F4]">look</span>.</>, subtitle: "Personalize os detalhes.", label: "FOTO DO SHORT/BERMUDA", placeholder: "Arraste ou selecione a imagem da peça" };
      case 'saia': return { title: "Qual vestido vai te fazer apaixonar?", subtitle: "Envie a foto e deixe a mágica acontecer.", label: "FOTO DA SAIA/VESTIDO", placeholder: "Arraste ou selecione a imagem da peça" };
      case 'looks': return { title: "Qual look vai te deixar mais estiloso?", subtitle: "Envie a foto e deixe a mágica acontecer.", label: "FOTO DO LOOK COMPLETO", placeholder: "Arraste ou selecione a imagem do look completo" };
      default: return { title: <>A peça do <span className="text-[#6A00F4]">look</span>.</>, subtitle: "Personalize os detalhes.", label: "FOTO DA PEÇA", placeholder: "Arraste ou selecione a imagem da peça" };
    }
  };

  const texts = getScreenTexts(category);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const arquivo = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (!clothingCheckVisto) {
          setPendingImageUrl(base64);
          setShowClothingCheck(true);
        } else {
          setClothingImage(base64);
        }
      };
      reader.readAsDataURL(arquivo);
    }
  };

  const handleConfirmOnlyPiece = () => {
    if (pendingImageUrl) {
      setClothingImage(pendingImageUrl);
      setPendingImageUrl(null);
    }
    setShowClothingCheck(false);
    setClothingCheckVisto(true);
    localStorage.setItem('clothing_check_visto', 'true');
  };

  const handleNotOnlyPiece = () => {
    setShowClothingCheck(false);
    setShowGifGuide(true);
    // We don't mark as seen yet because they said "No", so they might need to see it again or they just want to see the guide.
    // Actually, the user said "depois não aparece mais", so maybe we should mark it as seen anyway or after they see the guide.
    // Let's mark it as seen after they interact with the guide or this modal.
    setClothingCheckVisto(true);
    localStorage.setItem('clothing_check_visto', 'true');
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleCreate = () => {
    console.log('DEBUG [FinalizeScreen] handleCreate - clothingImage:', !!clothingImage, clothingImage?.substring(0, 50));
    if (!podeGerar) { 
      triggerUpload(); 
      return; 
    }
    onGenerate(clothingImage!);
  };

  return (
    <div className="w-full h-full bg-white flex flex-col relative animate-slide-up overflow-hidden">
      <div className="text-center px-6 py-4 bg-white z-20 shadow-sm shrink-0">
          <h2 className="text-xl font-bold text-[#2E0249] leading-relaxed">Quase lá!</h2>
          <p className="text-gray-500 text-sm">Confira os detalhes antes de gerar</p>
      </div>

      <div className="flex-1 px-6 flex flex-col pt-4 overflow-y-auto no-scrollbar">
        <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-[#2E0249] leading-tight">{texts.title}</h2>
            <p className="text-sm text-gray-500 mt-2 font-medium">{texts.subtitle}</p>
        </div>

        <div className="flex flex-col gap-2 w-full">
            <div className="flex justify-between items-center pl-1 pr-1">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{texts.label}</span>
              <button
                onClick={() => setShowGifGuide(true)}
                className={`flex items-center gap-1 text-[10px] font-bold uppercase transition-all
                  ${!gifGuiaVisto
                    ? 'text-white bg-purple-600 px-3 py-1.5 rounded-full animate-pulse shadow-lg shadow-purple-300'
                    : 'text-purple-600 hover:underline'
                  }`}
              >
                🎬 Guia de Peça
              </button>
            </div>
             <div onClick={triggerUpload} className="border-2 border-dashed border-gray-200 bg-white rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-purple-50 transition-colors group relative overflow-hidden h-48">
                <input type="file" ref={fileInputRef} className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} />
                {clothingImage ? (
                    <>
                        <img src={clothingImage} alt="Peça selecionada" className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                             <div className="bg-white/20 backdrop-blur-md p-3 rounded-full text-white"><RefreshCw size={24} /></div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform"><Upload className="text-[#6A00F4]" size={24} /></div>
                        <div className="space-y-1 text-center"><p className="font-medium text-[#2E0249] text-sm">{texts.placeholder}</p><p className="text-[10px] text-gray-400">Formatos JPG, PNG ou WEBP</p></div>
                    </>
                )}
             </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 w-full">
            <button onClick={triggerUpload} className="flex items-center justify-center gap-2 py-3 px-4 bg-white border border-gray-200 rounded-xl shadow-sm active:scale-95 transition-transform">
                <ImageIcon size={18} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-600">Galeria</span>
            </button>
            <button onClick={triggerUpload} className="flex items-center justify-center gap-2 py-3 px-4 bg-[#6A00F4] text-white rounded-xl shadow-md shadow-purple-200 active:scale-95 transition-transform">
                <CameraIcon size={18} className="text-white" />
                <span className="text-sm font-medium">Câmera</span>
            </button>
        </div>

        {/* Warning for Complete Look */}
        {category === 'looks' && (
            <div className="mt-4 bg-yellow-50 border border-yellow-100 rounded-xl p-3 flex gap-2 items-start">
                <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={16} />
                <p className="text-xs text-yellow-700 leading-tight">
                    <strong>Atenção:</strong> Envie a foto do look completo (ex: terno, vestido, conjunto) sem o rosto de outra pessoa. O look pode incluir sapatos e acessórios.
                </p>
            </div>
        )}


        <div className="flex-1 flex flex-col justify-end mt-4 mb-2">
           <PromoCarousel isPremium={isPremium} />
        </div>

        {/* Modal de Verificação da Peça */}
        {showClothingCheck && (
          <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl text-center border border-purple-100">
              <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={40} className="text-yellow-500" />
              </div>
              
              <h3 className="text-2xl font-bold text-[#2E0249] mb-3 leading-tight">
                ⚠️ A foto tem só a peça?
              </h3>
              <p className="text-gray-500 mb-8 text-sm">
                Sem modelo vestindo? Para um resultado perfeito, a peça deve estar sozinha.
              </p>
              
              <div className="space-y-3">
                <button 
                  onClick={handleConfirmOnlyPiece}
                  className="w-full py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-green-100 flex items-center justify-center gap-2"
                >
                  ✅ Sim, só a peça
                </button>
                <button 
                  onClick={handleNotOnlyPiece}
                  className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-[#2E0249] rounded-2xl font-bold transition-all active:scale-95"
                >
                  Não
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Guia de Peça */}
        {showGifGuide && (
          <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
              <button onClick={() => setShowGifGuide(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
              <h3 className="text-xl font-bold text-[#2E0249] mb-4 flex items-center gap-2">
                <Sparkles className="text-purple-600" size={20} /> Guia de Peça Perfeita
              </h3>
              
              <div className="space-y-4">
                <div className="aspect-video bg-gray-100 rounded-2xl flex items-center justify-center overflow-hidden border border-gray-100">
                <img 
                  src="https://i.postimg.cc/yxjyGXLW/202603181804-ezgif-com-video-to-gif-converter.gif"
                  alt="Exemplo de peça de roupa"
                  className="w-full rounded-xl object-cover"
                  style={{ maxHeight: '250px', objectFit: 'cover' }}
                />
                </div>

                <div className="space-y-3">
                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={12} className="text-green-600" />
                    </div>
                    <p className="text-sm text-gray-600">Peça sozinha, sem ninguém vestindo.</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={12} className="text-green-600" />
                    </div>
                    <p className="text-sm text-gray-600">Fundo neutro (branco ou cor sólida).</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={12} className="text-green-600" />
                    </div>
                    <p className="text-sm text-gray-600">Boa iluminação, sem sombras fortes.</p>
                  </div>
                </div>
              </div>
              
              <Button onClick={() => {
                setShowGifGuide(false);
                setGifGuiaVisto(true);
                localStorage.setItem('gif_guia_visto', 'true');
              }} className="mt-6">Entendi!</Button>
            </div>
          </div>
        )}
      </div>

      <div className="p-8 bg-white border-t border-gray-100 rounded-t-[30px] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] w-full sticky bottom-0 z-30">
        <div className="flex flex-col gap-3">
            <Button 
              onClick={handleCreate} 
              isLoading={loading}
              disabled={loading || !podeGerar}
              className={!podeGerar ? 'grayscale opacity-70' : ''}
            >
              {loading ? "Processando..." : (podeGerar ? "Criar meu Look Agora!" : "Selecione a foto da roupa")}
            </Button>
            <Button variant="ghost" onClick={onRestart} disabled={loading}>Escolher outra categoria</Button>
        </div>
      </div>
    </div>
  );
};

// --- View 360 Input Screen ---
const View360Screen: React.FC<{ 
  userImage: string | null; 
  clothingImage: string | null;
  onGenerate360: (side: string, back: string, clothingBack: string | null) => void; 
  onBack: () => void;
}> = ({ userImage, clothingImage, onGenerate360, onBack }) => {
  const [sideImage, setSideImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [clothingBackImage, setClothingBackImage] = useState<string | null>(null);
  
  const sideInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const clothingBackInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setFunc: React.Dispatch<React.SetStateAction<string | null>>) => {
    if (e.target.files && e.target.files[0]) {
      const arquivo = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        setFunc(event.target?.result as string);
      };
      reader.readAsDataURL(arquivo);
    }
  };

  const isReady = sideImage && backImage;

  return (
    <div className="w-full min-h-screen bg-white flex flex-col animate-slide-up pb-8 relative overflow-y-auto">
       <div className="px-6 pb-4 text-center pt-6">
        <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-purple-100">
           <Rotate3d size={14} /> MODO 360°
        </div>
        <h1 className="text-xl font-bold text-[#2E0249] leading-tight">
           Veja a sua imagem em todos os ângulos
        </h1>
        <p className="text-sm text-gray-500 mt-2">
           Para um resultado melhor, anexe mais duas imagens (Lado e Costas).
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 space-y-6 pb-24">
         
         {/* Imagem Original (Frente) */}
         <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100">
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-white shadow-sm flex-shrink-0">
               <img src={userImage || ''} className="w-full h-full object-cover" alt="Frente" />
            </div>
            <div>
               <p className="font-bold text-[#2E0249] text-sm">Foto de Frente</p>
               <p className="text-xs text-green-600 flex items-center gap-1"><Check size={10} /> Já adicionada</p>
            </div>
         </div>

         {/* Upload Lado */}
         <div onClick={() => sideInputRef.current?.click()} className="border-2 border-dashed border-gray-200 bg-white rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-purple-50 transition-colors h-24">
             <input type="file" ref={sideInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, setSideImage)} />
             {sideImage ? (
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-white shadow-sm flex-shrink-0 border-2 border-purple-200">
                   <img src={sideImage} className="w-full h-full object-cover" alt="Lado" />
                </div>
             ) : (
                <div className="w-16 h-16 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0 text-purple-400">
                   <Upload size={24} />
                </div>
             )}
             <div>
                <p className="font-bold text-[#2E0249] text-sm">Foto de Lado</p>
                <p className="text-xs text-gray-400">{sideImage ? 'Clique para alterar' : 'Toque para adicionar'}</p>
             </div>
         </div>

          {/* Upload Costas */}
          <div className="space-y-3">
             <div onClick={() => backInputRef.current?.click()} className="border-2 border-dashed border-gray-200 bg-white rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-purple-50 transition-colors h-24">
                 <input type="file" ref={backInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, setBackImage)} />
                 {backImage ? (
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-white shadow-sm flex-shrink-0 border-2 border-purple-200">
                       <img src={backImage} className="w-full h-full object-cover" alt="Costas" />
                    </div>
                 ) : (
                    <div className="w-16 h-16 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0 text-purple-400">
                       <Upload size={24} />
                    </div>
                 )}
                 <div>
                    <p className="font-bold text-[#2E0249] text-sm">Foto de Costas (Sua)</p>
                    <p className="text-xs text-gray-400">{backImage ? 'Clique para alterar' : 'Toque para adicionar'}</p>
                 </div>
             </div>

             {backImage && (
               <div onClick={() => clothingBackInputRef.current?.click()} className="border-2 border-dashed border-purple-200 bg-purple-50/30 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-purple-100 transition-colors h-24 animate-in fade-in slide-in-from-top-2">
                   <input type="file" ref={clothingBackInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, setClothingBackImage)} />
                   {clothingBackImage ? (
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-white shadow-sm flex-shrink-0 border-2 border-purple-400">
                         <img src={clothingBackImage} className="w-full h-full object-cover" alt="Peça Costas" />
                      </div>
                   ) : (
                      <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center flex-shrink-0 text-purple-500 shadow-sm">
                         <ImageIcon size={24} />
                      </div>
                   )}
                   <div>
                      <p className="font-bold text-purple-900 text-sm">Veste de Costas (Peça)</p>
                      <p className="text-xs text-purple-400">{clothingBackImage ? 'Clique para alterar' : 'Opcional: Adicione a foto da peça de costas'}</p>
                   </div>
               </div>
             )}
          </div>
      </div>

      <div className="p-8 bg-white border-t border-gray-100 rounded-t-[30px] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] w-full sticky bottom-0 z-30">
        <Button 
           variant="primary" 
           disabled={!isReady} 
           onClick={() => isReady && onGenerate360(sideImage!, backImage!, clothingBackImage)}
           className={!isReady ? 'opacity-50 grayscale' : ''}
        >
            Gerar 360
        </Button>
      </div>
    </div>
  );
};

// --- Result 360 Image Item ---
const Result360ImageItem: React.FC<{
  img: string;
  label: string;
  isPremiumUser: boolean;
  onRestart: () => void;
  aspectRatio: 'original' | '9/16' | '1/1' | '4/5';
}> = ({ img, label, isPremiumUser, onRestart, aspectRatio }) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [touchStartDist, setTouchStartDist] = useState<number | null>(null);
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<number | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalZoom, setModalZoom] = useState(1);
  const [modalPan, setModalPan] = useState({ x: 0, y: 0 });
  const [showPinchHint, setShowPinchHint] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent, isModal = false) => {
    const zoom = isModal ? modalZoom : zoomLevel;
    if (zoom <= 1) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const currentPan = isModal ? modalPan : pan;
    setDragStart({ x: clientX - currentPan.x, y: clientY - currentPan.y });
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent, isModal = false) => {
    const zoom = isModal ? modalZoom : zoomLevel;
    if (!isDragging || zoom <= 1) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    if (isModal) {
      setModalPan({ x: clientX - dragStart.x, y: clientY - dragStart.y });
    } else {
      setPan({ x: clientX - dragStart.x, y: clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setTouchStartDist(null);
  };

  const handleTouchStart = (e: React.TouchEvent, isModal = false) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setTouchStartDist(dist);
    } else {
      handleMouseDown(e, isModal);
    }
  };

  const handleTouchMove = (e: React.TouchEvent, isModal = false) => {
    if (e.touches.length === 2 && touchStartDist !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = dist / touchStartDist;
      if (isModal) {
        setModalZoom(prev => Math.min(Math.max(prev * delta, 1), 4));
      } else {
        setZoomLevel(prev => Math.min(Math.max(prev * delta, 1), 3));
      }
      setTouchStartDist(dist);
    } else {
      handleMouseMove(e, isModal);
    }
  };

  const handleDoubleTap = (isModal = false) => {
    if (isModal) {
      if (modalZoom > 1) {
        setModalZoom(1);
        setModalPan({ x: 0, y: 0 });
      } else {
        setModalZoom(2.5);
      }
    } else {
      if (zoomLevel > 1) {
        setZoomLevel(1);
        setPan({ x: 0, y: 0 });
      } else {
        setZoomLevel(2);
      }
    }
  };

  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case '9/16': return 'aspect-[9/16]';
      case '1/1': return 'aspect-square';
      case '4/5': return 'aspect-[4/5]';
      default: return '';
    }
  };

  const handleDownload = async () => {
    if (!img || !containerRef.current) return;

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = img;
    
    await new Promise((resolve) => {
        image.onload = resolve;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let targetWidth = 1080;
    let targetHeight;

    if (aspectRatio === 'original') {
        targetWidth = image.naturalWidth;
        targetHeight = image.naturalHeight;
    } else if (aspectRatio === '9/16') {
        targetHeight = (targetWidth * 16) / 9;
    } else if (aspectRatio === '1/1') {
        targetHeight = targetWidth;
    } else if (aspectRatio === '4/5') {
        targetHeight = (targetWidth * 5) / 4;
    } else {
        targetHeight = (targetWidth * 4) / 3;
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Calculate scaling to fill image into canvas (cover)
    const imgAspectRatio = image.naturalWidth / image.naturalHeight;
    const canvasAspectRatio = canvas.width / canvas.height;
    
    let drawWidth, drawHeight;
    if (imgAspectRatio > canvasAspectRatio) {
        // Image is wider than canvas, match height
        drawHeight = canvas.height;
        drawWidth = canvas.height * imgAspectRatio;
    } else {
        // Image is taller than canvas, match width
        drawWidth = canvas.width;
        drawHeight = canvas.width / imgAspectRatio;
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoomLevel, zoomLevel);
    
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const panScaleX = canvas.width / containerWidth; 
    const panScaleY = canvas.height / containerHeight;
    ctx.translate(pan.x * panScaleX, pan.y * panScaleY);
    
    ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();

    // Watermark
    ctx.font = `bold ${Math.max(20, canvas.width * 0.02)}px Inter, sans-serif`;
    ctx.fillStyle = "rgba(106, 0, 244, 0.8)";
    ctx.textAlign = "right";
    ctx.fillText("PANDORA AI", canvas.width - (canvas.width * 0.02), canvas.height - (canvas.height * 0.02));

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `pandora-360-${label.toLowerCase()}-${aspectRatio.replace('/', '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (showImageModal) {
      const alreadySeen = localStorage.getItem('pinch_hint_visto_360') === 'true';
      if (!alreadySeen) {
        setShowPinchHint(true);
        setTimeout(() => {
          setShowPinchHint(false);
          localStorage.setItem('pinch_hint_visto_360', 'true');
        }, 3000);
      }
    } else {
      setModalZoom(1);
      setModalPan({ x: 0, y: 0 });
    }
  }, [showImageModal]);

  return (
    <div className="flex flex-col gap-4 min-w-[85%] snap-center pb-4">
      {/* Modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center">
          <div 
            className="w-full h-full relative overflow-hidden flex items-center justify-center touch-none"
            onMouseDown={(e) => handleMouseDown(e, true)}
            onMouseMove={(e) => handleMouseMove(e, true)}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={(e) => handleTouchStart(e, true)}
            onTouchMove={(e) => handleTouchMove(e, true)}
            onTouchEnd={handleMouseUp}
            onDoubleClick={() => handleDoubleTap(true)}
          >
            <img 
              src={img} 
              className="max-w-full max-h-full object-contain transition-transform duration-75 ease-linear"
              style={{ transform: `translate(${modalPan.x}px, ${modalPan.y}px) scale(${modalZoom})` }}
              draggable={false}
            />

            {showPinchHint && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-24 h-24">
                    <div className="absolute inset-0 border-4 border-white/40 rounded-full animate-ping"/>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-8">
                      <div className="w-4 h-4 bg-white rounded-full opacity-90" style={{ animation: 'pinchFinger1 1.5s ease-in-out infinite' }}/>
                      <div className="w-4 h-4 bg-white rounded-full opacity-90" style={{ animation: 'pinchFinger2 1.5s ease-in-out infinite' }}/>
                    </div>
                  </div>
                  <p className="text-white text-sm font-bold bg-black/50 px-4 py-2 rounded-full">Use 2 dedos para dar zoom</p>
                </div>
              </div>
            )}
          </div>

          {/* Zoom Controls */}
          <div className="absolute bottom-40 left-1/2 -translate-x-1/2 flex gap-4 z-20">
            <button onClick={() => setModalZoom(prev => Math.max(prev - 0.5, 1))} className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/30">
              <ZoomIn size={20} className="rotate-180" />
            </button>
            <button onClick={() => setModalZoom(prev => Math.min(prev + 0.5, 4))} className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/30">
              <ZoomIn size={20} />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="absolute bottom-8 left-0 right-0 px-6 flex flex-col gap-3 z-20">
            <button
              onClick={onRestart}
              className="w-full py-3.5 bg-white text-[#6A00F4] border-2 border-[#6A00F4] rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
            >
              <RefreshCcw size={18} /> Trocar peça
            </button>
          </div>
          
          <button 
            onClick={() => setShowImageModal(false)}
            className="absolute top-4 right-4 text-white p-2 bg-white/20 rounded-full backdrop-blur-md z-10"
          >
            <X size={24} />
          </button>
        </div>
      )}

      <div 
        ref={containerRef}
        className={`relative w-full ${getAspectRatioClass()} rounded-2xl overflow-hidden shadow-lg border-4 border-[#6A00F4] bg-[#6A00F4]/5 cursor-pointer touch-none transition-all duration-300`}
        style={aspectRatio === 'original' && naturalAspectRatio ? { aspectRatio: naturalAspectRatio } : {}}
      >
        <div 
          className="w-full h-full overflow-hidden relative"
          onMouseDown={(e) => handleMouseDown(e)}
          onMouseMove={(e) => handleMouseMove(e)}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={(e) => handleTouchStart(e)}
          onTouchMove={(e) => handleTouchMove(e)}
          onTouchEnd={handleMouseUp}
          onDoubleClick={() => handleDoubleTap()}
        >
          <img 
            src={img} 
            className="w-full h-full object-cover transition-transform duration-75 ease-linear" 
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`, transformOrigin: 'center center' }}
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              setNaturalAspectRatio(img.naturalWidth / img.naturalHeight);
            }}
          />
        </div>
        <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded font-bold">
          {label}
        </div>
      </div>
    </div>
  );
};

// --- Result 360 Screen ---
const Result360Screen: React.FC<{ 
  images: string[] | null; 
  onRestart: () => void;
  onBack: () => void;
  userState: UserState;
  onOpenPremiumModal?: () => void;
  aspectRatio: 'original' | '9/16' | '1/1' | '4/5';
  setAspectRatio: (ratio: 'original' | '9/16' | '1/1' | '4/5') => void;
}> = ({ images, onRestart, onBack, userState, onOpenPremiumModal, aspectRatio, setAspectRatio }) => {
  const isPremiumUser = userState.subscriptionTier === 'premium' || 
                        (userState.lastPurchaseAmount === 29.9 || userState.lastPurchaseAmount === 29.90 || userState.lastPurchaseAmount === 30) ||
                        (userState.lastPlan && (userState.lastPlan.toLowerCase().includes('premium') || userState.lastPlan.includes('29,90') || userState.lastPlan.includes('29.90') || userState.lastPlan.includes('30')));

  const handleDownloadAll = async () => {
    if (!images) return;
    
    for (let i = 0; i < images.length; i++) {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = images[i];
        await new Promise((resolve, reject) => {
          img.onerror = reject;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(null);
              return;
            }

            let targetWidth = 1080;
            let targetHeight;

            if (aspectRatio === 'original') {
              targetWidth = img.naturalWidth;
              targetHeight = img.naturalHeight;
            } else if (aspectRatio === '9/16') {
              targetHeight = (targetWidth * 16) / 9;
            } else if (aspectRatio === '1/1') {
              targetHeight = targetWidth;
            } else if (aspectRatio === '4/5') {
              targetHeight = (targetWidth * 5) / 4;
            } else {
              targetHeight = (targetWidth * 4) / 3;
            }

            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const imgAspectRatio = img.naturalWidth / img.naturalHeight;
            const canvasAspectRatio = canvas.width / canvas.height;
            
            let drawWidth, drawHeight;
            if (imgAspectRatio > canvasAspectRatio) {
              drawHeight = canvas.height;
              drawWidth = canvas.height * imgAspectRatio;
            } else {
              drawWidth = canvas.width;
              drawHeight = canvas.width / imgAspectRatio;
            }

            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
            ctx.restore();

            // Watermark
            ctx.font = `bold ${Math.max(20, canvas.width * 0.02)}px Inter, sans-serif`;
            ctx.fillStyle = "rgba(106, 0, 244, 0.8)";
            ctx.textAlign = "right";
            ctx.fillText("PANDORA AI", canvas.width - (canvas.width * 0.02), canvas.height - (canvas.height * 0.02));

            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            const labels = ['Frente', 'Lateral', 'Costas'];
            link.download = `pandora-360-${labels[i].toLowerCase()}-${aspectRatio.replace('/', '-')}-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            resolve(null);
          };
        });
        // Small delay between downloads
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error('Erro ao baixar imagem 360:', err);
        window.open(images[i], '_blank');
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto pb-24">
      {/* Aspect Ratio Tabs - Applied to all */}
      <div className="flex justify-center mt-4 mb-2">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          <button onClick={() => setAspectRatio('original')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aspectRatio === 'original' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}>Original</button>
          <button 
            onClick={() => {
              if (!isPremiumUser) {
                onOpenPremiumModal?.();
                return;
              }
              setAspectRatio('4/5');
            }} 
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aspectRatio === '4/5' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}
          >
            Instagram {!isPremiumUser && '🔒'}
          </button>
          <button 
            onClick={() => {
              if (!isPremiumUser) {
                onOpenPremiumModal?.();
                return;
              }
              setAspectRatio('9/16');
            }} 
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aspectRatio === '9/16' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}
          >
            Storys {!isPremiumUser && '🔒'}
          </button>
          <button 
            onClick={() => {
              if (!isPremiumUser) {
                onOpenPremiumModal?.();
                return;
              }
              setAspectRatio('1/1');
            }} 
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aspectRatio === '1/1' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}
          >
            Square {!isPremiumUser && '🔒'}
          </button>
        </div>
      </div>

      {/* 360 Images List */}
      <div className="flex-1 px-6">
        {images && images.length >= 3 ? (
          <div className="flex flex-row overflow-x-auto gap-4 pb-12 snap-x no-scrollbar">
            <div className="min-w-[85%] snap-center">
              <Result360ImageItem 
                img={images[0]} 
                label="Frente" 
                onRestart={onRestart}
                isPremiumUser={isPremiumUser}
                aspectRatio={aspectRatio}
              />
            </div>
            <div className="min-w-[85%] snap-center">
              <Result360ImageItem 
                img={images[1]} 
                label="Lateral" 
                onRestart={onRestart}
                isPremiumUser={isPremiumUser}
                aspectRatio={aspectRatio}
              />
            </div>
            <div className="min-w-[85%] snap-center">
              <Result360ImageItem 
                img={images[2]} 
                label="Costas" 
                onRestart={onRestart}
                isPremiumUser={isPremiumUser}
                aspectRatio={aspectRatio}
              />
            </div>
          </div>
        ) : (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-4">
            <Rotate3d size={48} className="animate-spin-slow" />
            <p className="text-sm font-medium">Carregando visualização 360°...</p>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent pt-10 z-20">
        <div className="max-w-md mx-auto flex flex-col gap-3">
          <Button 
            onClick={handleDownloadAll}
            variant="primary"
          >
            <Download size={20} /> Baixar Todas as Fotos
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => compartilharWhatsApp()} 
              className="py-3 px-6 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-full font-bold text-base flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
            >
              <MessageCircle size={18} /> WhatsApp
            </button>
            <button 
              onClick={() => compartilharInstagram()} 
              className="py-3 px-6 bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] text-white rounded-full font-bold text-base flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
            >
              <Instagram size={18} /> Instagram
            </button>
          </div>
          
          <Button 
            onClick={onRestart}
            variant="outline"
            className="border-purple-200 text-purple-700 hover:bg-purple-50"
          >
            <RefreshCcw size={18} /> Trocar peça
          </Button>
        </div>
      </div>
    </div>
  );
};

const ResultScreen: React.FC<{ 
  userImage: string | null; 
  clothingImage: string | null;
  generatedImage: string | null;
  onRestart: () => void;
  onView360: () => void;
  onBack: () => void;
  onOpenPremiumModal?: () => void;
  onOpenCheckout?: (url: string) => void;
  userState: UserState;
  aspectRatio: 'original' | '9/16' | '1/1' | '4/5';
  setAspectRatio: (ratio: 'original' | '9/16' | '1/1' | '4/5') => void;
}> = ({ userImage, clothingImage, generatedImage, onRestart, onView360, onBack, onOpenPremiumModal, onOpenCheckout, userState, aspectRatio, setAspectRatio }) => {
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  const [showTapHint, setShowTapHint] = useState(() => {
    return localStorage.getItem('result_hint_visto') !== 'true';
  });
  const [showPinchHint, setShowPinchHint] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [touchStartDist, setTouchStartDist] = useState<number | null>(null);
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [show360Modal, setShow360Modal] = useState(false);

  const isPremiumUser = userState.subscriptionTier === 'premium' || 
                        (userState.lastPurchaseAmount === 29.9 || userState.lastPurchaseAmount === 29.90 || userState.lastPurchaseAmount === 30) ||
                        (userState.lastPlan && (userState.lastPlan.toLowerCase().includes('premium') || userState.lastPlan.includes('29,90') || userState.lastPlan.includes('29.90') || userState.lastPlan.includes('30')));

  const getDaysSinceJoin = () => {
    const rawDate = userState.subscriptionStartDate || userState.createdAt;
    const startDate = parseFirebaseDate(rawDate);
    if (!startDate) return 0;
    const now = new Date();
    const diffTime = now.getTime() - startDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysSinceJoin = getDaysSinceJoin();
  const is360Unlocked = daysSinceJoin >= 7;

  const [activeAngleIndex, setActiveAngleIndex] = useState(0); // 0: Front, 1: Side, 2: Back
  const has360Images = userState.generated360Images && userState.generated360Images.length >= 3;
  const currentImage = has360Images ? userState.generated360Images[activeAngleIndex] : generatedImage;

  const handleVeja360 = () => {
    if (!is360Unlocked) {
      const daysRemaining = 7 - daysSinceJoin;
      alert(`✨ Olá, estrela! Sua jornada 360° está quase pronta. \n\nPara garantir a melhor experiência e qualidade, o recurso 360° será liberado em ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}. \n\nAproveite para explorar novos looks enquanto preparamos tudo com carinho para você! 💜`);
      return;
    }

    if (!isPremiumUser) {
      setShow360Modal(true);
      return;
    }
    
    onView360();
  };

  useEffect(() => {
    if (zoomLevel === 1) setPan({ x: 0, y: 0 });
  }, [zoomLevel]);

  useEffect(() => {
    if (showImageModal) {
      const alreadySeen = localStorage.getItem('pinch_hint_visto') === 'true';
      if (!alreadySeen) {
        setShowPinchHint(true);
        setTimeout(() => {
          setShowPinchHint(false);
          localStorage.setItem('pinch_hint_visto', 'true');
        }, 3000);
      }
    }
  }, [showImageModal]);

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.5, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.5, 1));

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    setDragStart({ x: clientX - pan.x, y: clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || zoomLevel <= 1) return;
    e.preventDefault(); // Prevent scrolling on touch
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    setPan({ x: clientX - dragStart.x, y: clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setTouchStartDist(null);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setTouchStartDist(dist);
    } else {
      handleMouseDown(e);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDist !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = dist / touchStartDist;
      setZoomLevel(prev => Math.min(Math.max(prev * delta, 1), 4));
      setTouchStartDist(dist);
    } else {
      handleMouseMove(e);
    }
  };
  
  const getAspectRatioClass = () => {
    switch (aspectRatio) {
        case '9/16': return 'aspect-[9/16]';
        case '1/1': return 'aspect-square';
        case '4/5': return 'aspect-[4/5]';
        default: return '';
    }
  };

  const handleDownload = async () => {
    if (!currentImage || !containerRef.current) return;

    try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = currentImage;
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let targetWidth, targetHeight;

        if (aspectRatio === 'original') {
            targetWidth = img.naturalWidth;
            targetHeight = img.naturalHeight;
        } else {
            targetWidth = 1080;
            if (aspectRatio === '9/16') {
                targetHeight = (targetWidth * 16) / 9;
            } else if (aspectRatio === '1/1') {
                targetHeight = targetWidth;
            } else if (aspectRatio === '4/5') {
                targetHeight = (targetWidth * 5) / 4;
            } else {
                targetHeight = (targetWidth * 4) / 3;
            }
        }

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Calculate scaling to fill image into canvas (cover)
        const imgAspectRatio = img.naturalWidth / img.naturalHeight;
        const canvasAspectRatio = canvas.width / canvas.height;
        
        let drawWidth, drawHeight;
        
        if (imgAspectRatio > canvasAspectRatio) {
            drawHeight = canvas.height;
            drawWidth = canvas.height * imgAspectRatio;
        } else {
            drawWidth = canvas.width;
            drawHeight = canvas.width / imgAspectRatio;
        }

        // Apply transformations
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(zoomLevel, zoomLevel);
        
        // Map pan (pixels in UI) to canvas pixels. 
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        const panScaleX = canvas.width / containerWidth; 
        const panScaleY = canvas.height / containerHeight;
        ctx.translate(pan.x * panScaleX, pan.y * panScaleY);
        
        ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        ctx.restore();

        // Add Watermark
        ctx.font = `bold ${Math.max(20, canvas.width * 0.02)}px Inter, sans-serif`;
        ctx.fillStyle = "rgba(106, 0, 244, 0.8)"; // Purple
        ctx.textAlign = "right";
        ctx.fillText("PANDORA AI", canvas.width - (canvas.width * 0.02), canvas.height - (canvas.height * 0.02));

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        const angleLabel = has360Images ? ['frente', 'lado', 'costas'][activeAngleIndex] : 'look';
        link.download = `pandora-${angleLabel}-${aspectRatio.replace('/', '-')}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error('Erro ao baixar imagem:', err);
        window.open(currentImage, '_blank');
    }
  };

  return (
    <div className="w-full h-full min-h-screen bg-white flex flex-col animate-fade-in overflow-y-auto relative">
      <style>{`
        @keyframes pinchFinger1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(12px, 12px); }
        }
        @keyframes pinchFinger2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-12px, -12px); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
      `}</style>
      {/* Image Modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center">
            <div 
              className="w-full h-full relative overflow-hidden flex items-center justify-center touch-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUp}
              onDoubleClick={() => {
                if (zoomLevel > 1) {
                  setZoomLevel(1);
                  setPan({ x: 0, y: 0 });
                } else {
                  setZoomLevel(2.5);
                }
              }}
            >
            <img 
              src={showImageModal} 
              className="max-w-full max-h-full object-contain transition-transform duration-75 ease-linear"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})` }}
              draggable={false}
            />

            {showPinchHint && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-24 h-24">
                    <div className="absolute inset-0 border-4 border-white/40 rounded-full animate-ping"/>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-8">
                      <div className="w-4 h-4 bg-white rounded-full opacity-90" style={{ animation: 'pinchFinger1 1.5s ease-in-out infinite' }}/>
                      <div className="w-4 h-4 bg-white rounded-full opacity-90" style={{ animation: 'pinchFinger2 1.5s ease-in-out infinite' }}/>
                    </div>
                  </div>
                  <p className="text-white text-sm font-bold bg-black/50 px-4 py-2 rounded-full">Use 2 dedos para dar zoom</p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons in Modal */}
          <div className="absolute bottom-8 left-0 right-0 px-6 flex flex-col gap-3 z-20">
            <button
              onClick={onRestart}
              className="w-full py-3.5 bg-white text-[#6A00F4] border-2 border-[#6A00F4] rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
            >
              <RefreshCcw size={18} /> Trocar peça
            </button>
          </div>
          
          <button 
            onClick={() => setShowImageModal(null)}
            className="absolute top-4 right-4 text-white p-2 bg-white/20 rounded-full backdrop-blur-md z-10"
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* Header removido - agora no MainLayout */}
      <div className="px-6 pt-8 pb-4 text-center flex-shrink-0 bg-white z-10 relative">
        <h1 className="text-2xl font-bold text-[#6A00F4] leading-tight">
           Resultado Incrível!
        </h1>
        <p className="text-sm text-gray-500 mt-2">
           Veja como a peça se ajustou ao seu corpo.
        </p>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto px-6 pb-12 w-full">
        <div className="flex flex-col items-center gap-6 pb-8">
            
            {/* Aspect Ratio Controls */}
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                <button onClick={() => setAspectRatio('original')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aspectRatio === 'original' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-[#2E0249]'}`}>Original</button>
                <button 
                  onClick={() => {
                    if (!isPremiumUser) {
                      onOpenPremiumModal?.();
                      return;
                    }
                    setAspectRatio('4/5');
                  }} 
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aspectRatio === '4/5' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-[#2E0249]'}`}
                >
                  Instagram {!isPremiumUser && '🔒'}
                </button>
                <button 
                  onClick={() => {
                    if (!isPremiumUser) {
                      onOpenPremiumModal?.();
                      return;
                    }
                    setAspectRatio('9/16');
                  }} 
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aspectRatio === '9/16' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-[#2E0249]'}`}
                >
                  Storys {!isPremiumUser && '🔒'}
                </button>
                <button 
                  onClick={() => {
                    if (!isPremiumUser) {
                      onOpenPremiumModal?.();
                      return;
                    }
                    setAspectRatio('1/1');
                  }} 
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aspectRatio === '1/1' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-[#2E0249]'}`}
                >
                  Square {!isPremiumUser && '🔒'}
                </button>
            </div>

            {/* Angle Selection Tabs */}
            {has360Images && (
              <div className="flex gap-2 p-1 bg-purple-50 rounded-xl border border-purple-100">
                <button 
                  onClick={() => setActiveAngleIndex(0)} 
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeAngleIndex === 0 ? 'bg-[#6A00F4] text-white shadow-md' : 'text-purple-400 hover:bg-purple-100'}`}
                >
                  Frente
                </button>
                <button 
                  onClick={() => setActiveAngleIndex(1)} 
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeAngleIndex === 1 ? 'bg-[#6A00F4] text-white shadow-md' : 'text-purple-400 hover:bg-purple-100'}`}
                >
                  Lado
                </button>
                <button 
                  onClick={() => setActiveAngleIndex(2)} 
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeAngleIndex === 2 ? 'bg-[#6A00F4] text-white shadow-md' : 'text-purple-400 hover:bg-purple-100'}`}
                >
                  Costas
                </button>
              </div>
            )}

            {/* Generated Image */}
            <div 
                ref={containerRef}
                className={`w-full ${getAspectRatioClass()} rounded-2xl overflow-hidden shadow-2xl border-4 border-[#6A00F4] relative bg-[#6A00F4]/5 mb-0 flex-shrink-0 group touch-none transition-all duration-300 flex items-center justify-center`}
                style={aspectRatio === 'original' && naturalAspectRatio ? { aspectRatio: naturalAspectRatio } : {}}
            >
                <div 
                    className="w-full h-full overflow-hidden relative cursor-move flex items-center justify-center"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleMouseUp}
                >
                    {currentImage ? (
                        <img 
                            src={currentImage} 
                            alt="Look Gerado" 
                            className="w-full h-full object-cover transition-transform duration-75 ease-linear" 
                            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`, transformOrigin: 'center center' }}
                            draggable={false}
                            onLoad={(e) => {
                              const img = e.currentTarget;
                              setNaturalAspectRatio(img.naturalWidth / img.naturalHeight);
                            }}
                            onDoubleClick={() => {
                              setShowImageModal(currentImage);
                              setShowTapHint(false);
                              localStorage.setItem('result_hint_visto', 'true');
                            }}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                        Erro ao gerar imagem
                        </div>
                    )}
                </div>

                {showTapHint && (
                  <div className="absolute inset-0 flex items-end justify-center pb-16 pointer-events-none z-10">
                    <div className="bg-black/60 backdrop-blur-sm text-white px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-2 animate-pulse">
                      <span className="text-lg">👆👆</span>
                      Toque 2x para abrir em tela cheia
                    </div>
                  </div>
                )}




                {/* Badges on Image */}
                <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-bold text-purple-600 shadow-sm flex items-center gap-1 z-20 whitespace-nowrap">
                    PANDORA AI <Sparkles size={10} />
                </div>
                
                {isPremiumUser && (
                  <button 
                      onClick={handleVeja360}
                      className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full text-xs font-bold text-[#2E0249] shadow-sm flex items-center gap-2 hover:bg-white transition-colors active:scale-95 transform hover:scale-105 z-20"
                  >
                      <Rotate3d size={14} /> Veja 360
                  </button>
                )}
            </div>

            {/* Elogio da Estilista IA */}
            {userState.lastCompliment && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full bg-purple-50 border border-purple-100 rounded-2xl p-4 relative overflow-hidden"
              >
                <div className="absolute -top-1 -right-1 opacity-10">
                  <Sparkles size={60} className="text-purple-600" />
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-lg shadow-purple-200">
                    <Sparkles size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">Elogio da Estilista</p>
                    <p className="text-purple-900 text-sm font-medium leading-relaxed italic">
                      "{userState.lastCompliment}"
                    </p>
                  </div>
                </div>
              </motion.div>
            )}


            {/* Input Images Row */}
            <div className="w-full flex justify-center gap-8 items-center flex-shrink-0">
                <button onClick={() => userImage && setShowImageModal(userImage)} className="flex flex-col items-center gap-2 group">
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-200 shadow-sm group-hover:border-purple-400 transition-colors">
                        <img src={userImage || ''} className="w-full h-full object-cover" alt="Você" />
                    </div>
                    <span className="text-xs text-gray-500 font-bold group-hover:text-purple-600 transition-colors">Você</span>
                </button>
                
                <div className="flex items-center text-gray-300">
                    <ArrowRight size={20} />
                </div>

                <button onClick={() => clothingImage && setShowImageModal(clothingImage)} className="flex flex-col items-center gap-2 group">
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-purple-200 shadow-sm group-hover:border-purple-400 transition-colors">
                        <img src={clothingImage || ''} className="w-full h-full object-cover" alt="Peça" />
                    </div>
                    <span className="text-xs text-gray-500 font-bold group-hover:text-purple-600 transition-colors">Peça</span>
                </button>
            </div>

            {/* Buttons - Prominent Download and Change Piece */}
            <div className="w-full space-y-4 mt-2 mb-8">
                <Button onClick={handleDownload} variant="primary">
                    <Download size={18} /> Baixar Imagem
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => compartilharWhatsApp(generatedImage || '')} 
                    className="w-full py-3 px-6 rounded-full font-bold transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2 text-base shadow-sm bg-[#25D366] hover:bg-[#128C7E] text-white border-none"
                  >
                    <MessageCircle size={18} /> WhatsApp
                  </button>
                  <button 
                    onClick={() => compartilharInstagram()} 
                    className="w-full py-3 px-6 rounded-full font-bold transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2 text-base shadow-sm bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] text-white border-none"
                  >
                    <Instagram size={18} /> Instagram
                  </button>
                </div>

                <Button onClick={onRestart} variant="outline" className="border-purple-200 text-purple-700 hover:bg-purple-50">
                    <RefreshCcw size={18} /> Trocar peça
                </Button>
            </div>
        </div>

        {show360Modal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-5">
            <div className="bg-white rounded-[24px] p-6 max-w-[360px] w-full max-h-[90vh] overflow-y-auto relative">
              <button 
                onClick={() => setShow360Modal(false)}
                className="absolute top-4 right-4 text-gray-400 p-1"
              >
                <X size={20} />
              </button>

              {/* Título */}
              <div className="text-center mb-4">
                <div className="text-[32px] mb-2">🔄</div>
                <h3 className="text-xl font-bold text-[#2E0249] mb-1.5">
                  Veja seu Look em 360°!
                </h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">
                  Vire sua roupa em todos os ângulos.<br/>
                  Exclusivo no <strong className="text-purple-600">Plano Premium</strong>.
                </p>
              </div>

              {/* Instrução */}
              <div className="bg-purple-50 rounded-xl p-3 mb-4 text-xs text-purple-600 font-medium">
                <strong>📸 Para o melhor resultado, tire 3 fotos:</strong>
              </div>

              {/* 3 fotos HORIZONTAL */}
              <div className="flex gap-2 mb-4 justify-center">
                {/* Frente */}
                <div className="flex-1 text-center">
                  <img 
                    src="https://i.postimg.cc/68g1gWQR/foto-frente.jpg"
                    alt="Foto de frente"
                    className="w-full aspect-[4/3] object-cover rounded-lg border-2 border-purple-100"
                  />
                  <p className="text-[11px] font-bold text-purple-600 mt-1">✅ Frente</p>
                </div>

                {/* Lateral */}
                <div className="flex-1 text-center">
                  <img 
                    src="https://i.postimg.cc/c60kV5dV/foto-lateral.jpg"
                    alt="Foto lateral"
                    className="w-full aspect-[4/3] object-cover rounded-lg border-2 border-purple-100"
                  />
                  <p className="text-[11px] font-bold text-purple-600 mt-1">✅ Lateral</p>
                </div>

                {/* Costas */}
                <div className="flex-1 text-center">
                  <img 
                    src="https://i.postimg.cc/FYdTjMxP/foto-costas.jpg"
                    alt="Foto de costas"
                    className="w-full aspect-[4/3] object-cover rounded-lg border-2 border-purple-100"
                  />
                  <p className="text-[11px] font-bold text-purple-600 mt-1">✅ Costas</p>
                </div>
              </div>

              {/* Preço */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-3 text-center mb-4">
                <p className="text-[13px] text-gray-500 mb-1">
                  Acesse o Plano Premium por apenas
                </p>
                <p className="text-2xl font-bold text-purple-600">
                  R$ 29,90
                </p>
                <p className="text-[11px] text-purple-400 mt-0.5">
                  + 360° + formatos Instagram, Stories e Square
                </p>
              </div>

              {/* Botão Premium */}
              <button
                onClick={() => {
                  onOpenCheckout?.('https://pay.cakto.com.br/wsopww7_808505?');
                  setShow360Modal(false);
                }}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-2xl text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-200 active:scale-95 transition-transform mb-2.5"
              >
                Quero o Plano Premium 🚀
              </button>

              {/* Botão fechar */}
              <button
                onClick={() => setShow360Modal(false)}
                className="w-full py-3 bg-transparent text-gray-400 text-sm font-medium hover:text-gray-600 transition-colors"
              >
                Agora não
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Cadastro Screen ---
const CadastroScreen: React.FC<{
  onBack: () => void;
  onCriarConta: () => void;
  onGoogleLogin: () => void;
  nome: string;
  setNome: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  senha: string;
  setSenha: (val: string) => void;
  confirmarSenha: string;
  setConfirmarSenha: (val: string) => void;
  isLoading: boolean;
}> = ({ 
  onBack, 
  onCriarConta, 
  onGoogleLogin, 
  nome,
  setNome,
  email, 
  setEmail, 
  senha, 
  setSenha, 
  confirmarSenha, 
  setConfirmarSenha,
  isLoading
}) => {
  const senhasCoincidem = senha === confirmarSenha && senha.length > 0;
  const isFormValid = email.includes('@') && senha.length >= 6 && senhasCoincidem && nome.length > 0;

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col items-center justify-start overflow-y-auto bg-white">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#6A00F4]/5 via-white to-[#ec4899]/5 z-0" />
      
      <div className="relative z-10 w-full max-w-md px-8 pt-[15vh] pb-10 animate-fade-in flex flex-col items-center">
        <button 
          onClick={onBack}
          className="absolute top-6 left-4 p-2 rounded-full hover:bg-purple-50 text-[#8B2CF5] transition-colors"
        >
          <ArrowLeft size={24} />
        </button>

        <div className="mb-2 w-full flex flex-col items-center transform scale-75 origin-top">
          <AppLogo size="md" hideSlogan={true} />
          <h2 className="text-5xl font-mono font-black text-[#8B2CF5] mt-5 uppercase tracking-tighter">Criar Conta</h2>
        </div>

        <div className="w-full space-y-2">
          <Input 
            icon={<Zap size={20} />} 
            type="text" 
            placeholder="Seu nome completo" 
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            label="Nome"
          />
          <Input 
            icon={<Mail size={20} />} 
            type="email" 
            placeholder="seu@email.com" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            label="Email"
          />
          <Input 
            icon={<Lock size={20} />} 
            type="password" 
            placeholder="Mínimo 6 caracteres" 
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            label="Senha"
          />
          <div className="relative">
            <Input 
              icon={<ShieldCheck size={20} />} 
              type="password" 
              placeholder="Confirme sua senha" 
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              label="Confirmar Senha"
            />
            {confirmarSenha.length > 0 && (
              <div className="absolute right-4 top-[38px]">
                {senhasCoincidem ? (
                  <Check size={18} className="text-green-500" />
                ) : (
                  <X size={18} className="text-red-500" />
                )}
              </div>
            )}
          </div>
          
          {confirmarSenha.length > 0 && !senhasCoincidem && (
            <p className="text-red-500 text-[10px] font-medium ml-1">As senhas não coincidem</p>
          )}
        </div>

        <div className="w-full mt-4 space-y-3">
          <Button 
            onClick={onCriarConta} 
            isLoading={isLoading}
            disabled={!isFormValid || isLoading}
            className={`w-full py-6 text-xl transition-all transform active:scale-95 ${!isFormValid ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
          >
            Criar Minha Conta
          </Button>

          <div className="flex items-center gap-4 py-2">
            <div className="h-[1px] flex-1 bg-gray-200"></div>
            <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">ou</span>
            <div className="h-[1px] flex-1 bg-gray-200"></div>
          </div>

          <button 
            onClick={onGoogleLogin}
            disabled={isLoading}
            className="w-full py-3 px-6 rounded-2xl font-semibold transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-3 text-base shadow-sm border border-gray-200 bg-white text-[#2E0249] hover:bg-gray-50 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continuar com Google
          </button>

          <div className="text-center pt-4">
            <p className="text-sm text-gray-500">
              Já tem uma conta?{' '}
              <a 
                onClick={onBack}
                className="cursor-pointer text-[#8B2CF5] font-bold hover:underline"
              >
                Fazer login
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Closet Screen ---
const ClosetScreen: React.FC<{ 
  history: HistoryItem[]; 
  onReuse: (item: HistoryItem) => void 
}> = ({ history, onReuse }) => {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-black text-[#2E0249] tracking-tight">MEU CLOSET</h2>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{history.length} Looks salvos</p>
      </div>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
            <Box size={40} />
          </div>
          <p className="text-gray-400 text-sm font-medium">Seu closet está vazio.<br/>Crie seu primeiro look!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {history.map((item) => (
            <div key={item.id} className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all group">
              <div className="aspect-[3/4] relative overflow-hidden">
                <img 
                  src={item.generatedImage} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                  alt="Look"
                  referrerPolicy="no-referrer"
                />
                <button 
                  onClick={() => onReuse(item)}
                  className="absolute top-3 right-3 w-8 h-8 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-purple-600 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              <div className="p-3">
                <p className="text-[10px] text-gray-400 font-bold uppercase truncate">
                  {new Date(item.date).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Jornada Screen - Removed ---

const App: React.FC = () => {
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showAvaliacaoModal, setShowAvaliacaoModal] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [urlPublicaImagem, setUrlPublicaImagem] = useState<string>('');
  const [notaAvaliacao, setNotaAvaliacao] = useState(0);
  const [comentarioAvaliacao, setComentarioAvaliacao] = useState('');
  const [hoveredStar, setHoveredStar] = useState(0);
  const [screen, setScreen] = useState<Screen>(Screen.SPLASH); 
  const [previousScreen, setPreviousScreen] = useState<Screen | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>("A IA está criando o seu look...");
  const [is360Loading, setIs360Loading] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [email, setEmail] = useState('');

  // States para a tela de cadastro
  const [cadastroNome, setCadastroNome] = useState('');
  const [cadastroEmail, setCadastroEmail] = useState('');
  const [cadastroSenha, setCadastroSenha] = useState('');
  const [cadastroConfirmarSenha, setCadastroConfirmarSenha] = useState('');
  const [isCadastroLoading, setIsCadastroLoading] = useState(false);
  const [emailRecuperacao, setEmailRecuperacao] = useState('');
  const [oobCode, setOobCode] = useState('');
  const [novaSenhaRedefinir, setNovaSenhaRedefinir] = useState('');
  const [confirmarNovaSenhaRedefinir, setConfirmarNovaSenhaRedefinir] = useState('');
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'original' | '9/16' | '1/1' | '4/5'>('original');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [userState, setUserState] = useState<UserState>({
    email: '',
    name: '',
    cellphone: '',
    taxId: '',
    profileImage: null,
    uploadedImage: null,
    sideImage: null,
    backImage: null,
    selectedCategory: null,
    clothingImage: null,
    clothingBackImage: null,
    generatedImage: null,
    generated360Images: null,
    credits: 0,
    history: [],
    streak: 0,
    styleProfile: null,
    styleTags: [],
    lastPlan: null,
    lastPurchaseAmount: null,
    lastPurchaseCredits: null,
    lastPurchaseDate: null,
    subscriptionTier: 'basic',
    subscriptionExpiresAt: null,
    subscriptionStartDate: null,
    creditsReleased: 0,
    totalPhotosGenerated: 0,
    dailyUsage: null,
    rechargeCount: 0,
    badge: null,
    pendingCredits: 0,
    closetLimit: 10
  });

  const [showChestNotification, setShowChestNotification] = useState(false);
  const [showAchievementModal, setShowAchievementModal] = useState(false);
  const [showChestModal, setShowChestModal] = useState(false);
  const [isClaimingChest, setIsClaimingChest] = useState(false);
  const [achievedBadge, setAchievedBadge] = useState<'gold' | 'diamond' | null>(null);
  const [showClosetLimitModal, setShowClosetLimitModal] = useState(false);
  const [pendingClothingImageUrl, setPendingClothingImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (userId && userState.dailyUsage?.date === new Date().toISOString().split('T')[0]) {
      if (userState.dailyUsage.count >= 30 && !userState.dailyUsage.claimedChest) {
        setShowChestNotification(true);
      } else {
        setShowChestNotification(false);
      }
    }
  }, [userState.dailyUsage, userId]);

  const isChestReady = userState.dailyUsage?.date === new Date().toISOString().split('T')[0] && 
                      userState.dailyUsage.count >= 30 && 
                      !userState.dailyUsage.claimedChest;

  const handleClaimChest = async () => {
    if (!userId || isClaimingChest) return;
    
    try {
      setIsClaimingChest(true);
      const win = await claimChest(userId);
      
      if (win > 0) {
        // Confetti effect
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#6A00F4', '#F52C99', '#FFD700']
        });
        
        setShowChestModal(false);
        setShowChestNotification(false);
        
        // Show success message (could be a toast or another modal, but user asked for "fala parabens")
        alert('🎉 PARABÉNS! Você ganhou 10 créditos extras! 🎁✨');
      }
    } catch (error) {
      console.error('Erro ao resgatar baú:', error);
    } finally {
      setIsClaimingChest(false);
    }
  };

  const isInitialLoadRef = useRef(true);

  // Preload GIF Guia de Peça
  useEffect(() => {
    const img = new Image();
    img.src = "https://i.postimg.cc/yxjyGXLW/202603181804-ezgif-com-video-to-gif-converter.gif";
  }, []);

  useEffect(() => {
    console.log('📱 App State - Screen:', screen);
    console.log('💰 App State - Credits:', userState.credits);
  }, [screen, userState.credits]);

  useEffect(() => {
    let userUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('🔐 Auth State Changed:', user ? `User: ${user.email} (UID: ${user.uid})` : 'No user');
      if (user && user.email) {
        const userEmail = user.email.toLowerCase().trim();
        setUserId(user.uid);
        setIsAdmin(userEmail === 'pandoravesteai@gmail.com');

        // Listener em tempo real para os dados do usuário
        if (userUnsubscribe) userUnsubscribe();
        
        userUnsubscribe = listenToUser(user.uid, async (userData) => {
          console.log('🔄 Firestore Update Received for UID:', user.uid);
          console.log('📄 Raw Firestore Data:', JSON.stringify(userData));
          
          let plan = userData.lastPurchasePlan || userData.lastPlan || null;
          const purchaseAmount = Number(userData.lastPurchaseAmount);
          
          if (!plan) {
            if (purchaseAmount === 29.9 || purchaseAmount === 29.90 || purchaseAmount === 30) {
              plan = 'Premium (R$ 29,90)';
            } else if (purchaseAmount === 19.9 || purchaseAmount === 19.90 || purchaseAmount === 20) {
              plan = 'Básico (R$ 19,90)';
            }
          }

          const isPremium = userData.subscriptionTier === 'premium' || 
                            (plan && (plan.toLowerCase().includes('premium') || plan.includes('29,90') || plan.includes('29.90') || plan.includes('30')));

          setUserState(prev => {
            const newState = {
              ...prev,
              email: userEmail,
              credits: Number(userData.credits ?? userData.exp ?? 0),
              name: userData.nome || userData.name || '',
              lastPlan: plan,
              lastPurchaseAmount: userData.lastPurchaseAmount || null,
              lastPurchaseCredits: userData.lastPurchaseCredits || null,
              lastPurchaseDate: userData.lastPurchase || userData.lastPurchaseDate || null,
              subscriptionTier: isPremium ? 'premium' : (userData.subscriptionTier || 'basic'),
              subscriptionExpiresAt: userData.subscriptionExpiresAt || null,
              subscriptionStartDate: userData.subscriptionStartDate || null,
              creditsReleased: userData.creditsReleased || 0,
              totalPhotosGenerated: userData.totalPhotosGenerated || 0,
              dailyUsage: userData.dailyUsage || null,
              rechargeCount: userData.rechargeCount || 0,
              badge: userData.badge || null,
              pendingCredits: userData.pendingCredits || 0,
              closetLimit: userData.closetLimit || 10,
              streak: userData.streak ?? 0,
              styleProfile: userData.styleProfile ?? null,
              styleTags: userData.styleTags ?? [],
              lastLogin: userData.lastLogin ?? '',
              createdAt: userData.createdAt || userData.created_at || null,
            };
            console.log('✅ UserState Updated with Credits:', newState.credits);
            return newState;
          });

          // Lógica de Streak (Ofensiva Diária) - Executa apenas uma vez por login ou quando o dia muda
          const today = new Date().toISOString().split('T')[0];
          const lastLoginDate = userData.lastLogin ? userData.lastLogin.split('T')[0] : null;

          if (lastLoginDate !== today) {
            let newStreak = (userData.streak ?? 0);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            if (lastLoginDate === yesterdayStr) {
              newStreak += 1;
            } else {
              newStreak = 1;
            }

            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, { 
              streak: newStreak, 
              lastLogin: today 
            });
          }

          // Verificação de Expiração de Assinatura Premium
          if (userData.subscriptionTier === 'premium' && userData.subscriptionExpiresAt) {
            const expiryDate = new Date(userData.subscriptionExpiresAt);
            const now = new Date();
            
            if (now > expiryDate) {
              const userRef = doc(db, 'users', user.uid);
              await updateDoc(userRef, {
                subscriptionTier: 'basic'
              });
              console.log('⚠️ Assinatura Premium expirada. Retornando ao plano básico.');
            }
          }

          // Processa liberação de créditos pendentes
          await processCreditRelease(user.uid);

          // Só redireciona se estiver na tela de login ou splash e for a primeira carga
          if (isInitialLoadRef.current) {
            setScreen(prev => {
              if (prev === Screen.SPLASH || prev === Screen.LOGIN) {
                return Screen.MAIN;
              }
              return prev;
            });
            isInitialLoadRef.current = false;
          }
        });

        // Carrega histórico do Firestore (uma vez por login)
        try {
          const { getDocs, collection, orderBy, query, limit } = 
            await import('firebase/firestore');
          
          const historyRef = collection(db, 'users', user.uid, 'history');
          const q = query(historyRef, orderBy('date', 'desc'), limit(50));
          const snapshot = await getDocs(q);
          
          const history: HistoryItem[] = snapshot.docs.map(doc => ({
            id: doc.data().id,
            date: doc.data().date,
            generatedImage: doc.data().generatedImage,
            userImage: doc.data().userImage,
            clothingImage: doc.data().clothingImage,
            type: doc.data().type,
            prompt: doc.data().prompt || '',
            stylistTip: doc.data().stylistTip || '',
          }));
          
          setUserState(prev => ({
            ...prev,
            history
          }));
          
          console.log(`✅ ${history.length} itens do histórico carregados`);
        } catch (error) {
          console.error('Erro ao carregar histórico:', error);
        }

        // Só redireciona se estiver na tela de login ou splash
        // setScreen movido para dentro do listenToUser

        const jaViuGuia = localStorage.getItem(`guia_visto_${user.uid}`);
        if (!jaViuGuia) {
          setIsFirstLogin(true);
        }

        setTimeout(async () => {
          if (user.uid) {
            await requestNotificationPermission(user.uid);
          }
        }, 3000);

      } else {
        // usuário deslogado
        setUserId('');
        setUserState({
          email: '',
          name: '',
          cellphone: '',
          taxId: '',
          profileImage: null,
          uploadedImage: null,
          sideImage: null,
          backImage: null,
          selectedCategory: null,
          clothingImage: null,
          clothingBackImage: null,
          generatedImage: null,
          generated360Images: null,
          credits: 0,
          history: [],
          streak: 0,
          styleProfile: null,
          styleTags: [],
          lastPlan: null,
          lastPurchaseAmount: null,
          lastPurchaseCredits: null,
          lastPurchaseDate: null,
          subscriptionTier: 'basic',
          subscriptionExpiresAt: null,
          subscriptionStartDate: null,
          creditsReleased: 0,
          totalPhotosGenerated: 0,
          dailyUsage: null,
          rechargeCount: 0,
          badge: null,
          pendingCredits: 0
        });
        isInitialLoadRef.current = true;
        if (userUnsubscribe) {
          userUnsubscribe();
          userUnsubscribe = null;
        }
      }
    });

    return () => {
      authUnsubscribe();
      if (userUnsubscribe) userUnsubscribe();
    };
  }, []);

  useEffect(() => {
    console.log('🔍 Verificando URL...');
    
    const urlParams = new URLSearchParams(window.location.search);
    
    // Detecta pagamento bem-sucedido
    const payment = urlParams.get('payment');
    const paidUserId = urlParams.get('userId');
    const credits = parseInt(urlParams.get('credits') || '0');
    const amount = parseFloat(urlParams.get('amount') || '0');
    
    if (payment === 'success' && paidUserId && credits > 0) {
      // Se o valor for 29.90, ativa o premium por 30 dias
      if (amount === 29.9 || amount === 29.90) {
        purchasePremium(paidUserId).then(() => {
          addCredits(paidUserId, credits).then(() => {
            window.history.replaceState({}, '', '/');
            alert(`✅ Plano Premium Ativado! ${credits} créditos adicionados.`);
          });
        });
      } else {
        addCredits(paidUserId, credits).then(() => {
          window.history.replaceState({}, '', '/');
          alert(`✅ ${credits} créditos adicionados!`);
        });
      }
    }

    // Detecta se a URL tem parâmetros de reset de senha
    const mode = urlParams.get('mode');
    const code = urlParams.get('oobCode');
    
    console.log('Mode:', mode);
    console.log('OobCode:', code ? 'Presente' : 'Ausente');
    
    if (mode === 'resetPassword' && code) {
      console.log('✅ Link detectado! Abrindo tela de redefinir senha...');
      setOobCode(code);
      setScreen(Screen.REDEFINIR_SENHA);
    }
  }, []);


  const isPremiumUser = userState.subscriptionTier === 'premium' || 
                        (userState.lastPurchaseAmount === 29.9 || userState.lastPurchaseAmount === 29.90 || userState.lastPurchaseAmount === 30) ||
                        (userState.lastPlan && (userState.lastPlan.toLowerCase().includes('premium') || userState.lastPlan.includes('29,90') || userState.lastPlan.includes('29.90') || userState.lastPlan.includes('30')));

  const getUserName = () => {
    if (userState.name) return userState.name;
    if (!userState.email) return 'Usuário';
    const namePart = userState.email.split('@')[0];
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
  };


  const handleSalvarNovaSenha = async () => {
    // Validações
    if (!novaSenhaRedefinir || !confirmarNovaSenhaRedefinir) {
      alert('Preencha todos os campos!');
      return;
    }
    
    if (novaSenhaRedefinir !== confirmarNovaSenhaRedefinir) {
      alert('As senhas não coincidem!');
      return;
    }
    
    if (novaSenhaRedefinir.length < 6) {
      alert('A senha deve ter no mínimo 6 caracteres!');
      return;
    }
    
    try {
      console.log('💾 Salvando nova senha no Firebase...');
      
      // FIREBASE: Atualizar senha
      await confirmPasswordReset(auth, oobCode, novaSenhaRedefinir);
      
      console.log('✅ Senha atualizada com sucesso!');
      alert('✅ Senha alterada com sucesso!');
      
      // Redirecionar para o site oficial
      window.location.href = 'https://pandoravesteai.com';
      
    } catch (error: any) {
      console.error('❌ Erro ao redefinir senha:', error);
      
      if (error.code === 'auth/expired-action-code') {
        alert('❌ Link expirado! Solicite um novo link.');
      } else if (error.code === 'auth/invalid-action-code') {
        alert('❌ Link inválido! Solicite um novo link.');
      } else {
        alert('❌ Erro: ' + error.message);
      }
    }
  };

  const handleSplashFinish = () => {
    setScreen(Screen.LOGIN);
  };

  const handleLogin = async (email: string, userIdFromLogin: string) => {
    const userEmail = email.toLowerCase().trim();
    const user = auth.currentUser;
    if (!user) return;
    
    setUserId(user.uid);
    
    try {
      const userRef = doc(db, 'users', user.uid);
      let userSnap = await getDoc(userRef);
      
      // Verificar se documento existe, se não, criar (migração)
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: userEmail,
          nome: 'Usuário',
          uid: user.uid,
          credits: 10,
          created_at: serverTimestamp()
        });
        console.log('Usuário migrado/criado no Firestore via Login:', user.uid);
        // Busca o documento recém criado
        userSnap = await getDoc(userRef);
      }

      const userData = userSnap.data() || { credits: 1 };
      // setUserState removido para deixar o listenToUser gerenciar os dados
      setScreen(Screen.MAIN);
    } catch (error) {
      console.error('Erro ao processar login no Firestore:', error);
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    }

    // Solicita permissões de notificação e instalação PWA
    const requestPermissions = async () => {
      // 1. Permissão de Notificações
      if (userId) {
        await requestNotificationPermission(userId);
      }
      
      // 2. Prompt de Instalação PWA
      if (window.deferredPrompt) {
        const { outcome } = await window.deferredPrompt.prompt();
        if (outcome === 'accepted') {
          console.log('PWA instalado!');
        }
        window.deferredPrompt = null;
      }
    };

    setTimeout(requestPermissions, 2000); // Aguarda 2s após login
  };

  const handleOpenCheckout = (url: string) => {
    setPreviousScreen(screen);
    setCheckoutUrl(url);
    setScreen(Screen.CHECKOUT);
  };

  const handleBuyCredits = async (plan: '20' | '30') => {
    if (plan === '30') {
      const checkoutUrl = `https://pay.cakto.com.br/wsopww7_808505?email=${encodeURIComponent(userState.email)}&external_id=${userId}`;
      handleOpenCheckout(checkoutUrl);
      return;
    }
    try {
      const result = await createPixPayment(userId, plan, userState.email);
      if (result.url) {
        window.open(result.url, '_blank');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao criar pagamento. Tente novamente.');
    }
  };

  const handleUpdateProfile = (name: string, image: string | null, cellphone?: string, taxId?: string) => {
    setUserState(prev => ({ 
      ...prev, 
      name, 
      profileImage: image, 
      cellphone: cellphone || prev.cellphone,
      taxId: taxId || prev.taxId 
    }));
  };

  const handleHomeUpload = (url: string) => {
    setUserState(prev => ({ ...prev, uploadedImage: url }));
  };

  const handleConfirmUpload = () => {
    setScreen(Screen.CATEGORY);
  };

  const handleCategorySelect = (id: string) => {
    setUserState(prev => ({ ...prev, selectedCategory: id }));
    setScreen(Screen.FINALIZE);
  };

  const handleStyleQuizComplete = async (style: string) => {
    setUserState(prev => ({ ...prev, styleProfile: style }));
    setScreen(Screen.CREDITS);
    
    if (userId) {
      try {
        await updateDoc(doc(db, 'users', userId), { styleProfile: style });
      } catch (error) {
        console.error('Erro ao salvar perfil de estilo:', error);
      }
    }
  };

  const addToHistory = async (item: HistoryItem) => {
    // Salva no estado local
    setUserState(prev => {
        return {
            ...prev,
            history: [item, ...prev.history],
        };
    });
    
    // Salva no Firestore
    if (userId) {
      try {
        // Comprime a imagem gerada antes de salvar no Firestore para evitar limite de 1MB
        const compressedGeneratedImage = await compressImage(item.generatedImage, 1024, 1024, 0.7);
        
        // Também tenta converter e comprimir as imagens de entrada se forem blob URLs
        // para garantir que o histórico seja persistente e caiba no limite
        let compressedUserImage = item.userImage;
        let compressedClothingImage = item.clothingImage || '';

        if (item.userImage.startsWith('blob:')) {
            const b64 = await urlToBase64(item.userImage);
            compressedUserImage = await compressImage(`data:image/jpeg;base64,${b64}`, 800, 800, 0.6);
        }
        
        if (item.clothingImage?.startsWith('blob:')) {
            const b64 = await urlToBase64(item.clothingImage);
            compressedClothingImage = await compressImage(`data:image/jpeg;base64,${b64}`, 800, 800, 0.6);
        }

        await setDoc(
          doc(db, 'users', userId, 'history', item.id),
          {
            id: item.id,
            date: item.date,
            generatedImage: compressedGeneratedImage,
            userImage: compressedUserImage,
            clothingImage: compressedClothingImage,
            type: item.type,
            prompt: item.prompt || '',
            stylistTip: item.stylistTip || '',
          }
        );
        console.log('✅ Histórico salvo no Firestore (comprimido)');
      } catch (error) {
        console.error('Erro ao salvar histórico:', error);
      }
    }
  };

  const handleReuseHistoryItem = (item: HistoryItem) => {
    setUserState(prev => ({
        ...prev,
        uploadedImage: item.userImage,
        selectedCategory: null,
        clothingImage: null,
        generatedImage: null
    }));
    setScreen(Screen.CATEGORY);
  };

  const handleOpenFAQ = () => {
    setPreviousScreen(screen);
    setScreen(Screen.FAQ);
  };

  const handleBackFromFAQ = () => {
    if (previousScreen) {
        setScreen(previousScreen);
    } else {
        setScreen(Screen.MAIN);
    }
    setPreviousScreen(null);
  };

  const handleUnlockCloset = async () => {
    if (userState.credits < 20) {
      alert('❌ Você não tem créditos suficientes para liberar espaço! Recarregue agora.');
      setScreen(Screen.CREDITS);
      setShowClosetLimitModal(false);
      return;
    }

    const ok = await unlockClosetSpace(userId);
    if (ok) {
      alert('✅ Espaço liberado! Você agora tem +10 slots no seu Closet Virtual.');
      setShowClosetLimitModal(false);
      if (pendingClothingImageUrl) {
        handleGenerateLook(pendingClothingImageUrl);
        setPendingClothingImageUrl(null);
      }
    } else {
      alert('Erro ao liberar espaço. Tente novamente.');
    }
  };

  const handleGenerateLook = async (clothingImageUrl: string) => {
    console.log('DEBUG - userImage length:', userState.uploadedImage?.length);
    console.log('DEBUG - clothingImage length:', clothingImageUrl?.length);
    console.log('DEBUG - state completo:', { userImage: !!userState.uploadedImage, clothingImage: !!clothingImageUrl });

    if (userState.credits < 10) {
      alert('❌ Você não tem créditos suficientes! Recarregue agora.');
      setScreen(Screen.CREDITS);
      return;
    }

    // Verifica limite do Closet Virtual
    const currentHistorySize = userState.history.length;
    const currentLimit = userState.closetLimit || 10;

    if (currentHistorySize >= currentLimit) {
      setPendingClothingImageUrl(clothingImageUrl);
      setShowClosetLimitModal(true);
      return;
    }

    // Desconta 10 créditos ANTES de gerar
    const ok = await deductCredit(userId, 10);
    if (!ok) {
      alert('Erro ao processar créditos. Tente novamente.');
      return;
    }

    setLoadingMessage("A IA está criando o seu look...");
    setAspectRatio('original');
    
    // Garantir que a imagem da roupa está no estado global para o LoadingScreen
    setUserState(prev => ({ ...prev, clothingImage: clothingImageUrl }));
    setScreen(Screen.LOADING);

    const categoryToUse = userState.selectedCategory || "clothes";
    console.log('🚀 [Try-On] Iniciando geração...', {
      category: categoryToUse,
      hasUserImage: !!userState.uploadedImage,
      hasClothingImage: !!clothingImageUrl,
      clothingImageUrl: clothingImageUrl?.substring(0, 50) + '...'
    });

    try {
      if (!userState.uploadedImage) {
        throw new Error("Foto do usuário não encontrada. Por favor, tire uma foto sua primeiro.");
      }
      if (!clothingImageUrl) {
        throw new Error("Foto da roupa não encontrada. Por favor, selecione uma peça.");
      }

      // Se já for data URL, extrai direto sem fetch. Se for URL, tenta converter ou retorna a URL para o backend
      const extrairBase64 = async (url: string): Promise<string> => {
        if (!url) return '';
        try {
          if (url.startsWith('data:')) {
            return url.split(',')[1] || '';
          }
          if (url.startsWith('blob:')) {
            return await urlToBase64(url);
          }
          // Tenta converter URL remota para base64 (para compressão)
          const b64 = await urlToBase64(url);
          // Se b64 vier vazio (erro de CORS), retorna a URL original para o backend processar
          return b64 || url;
        } catch (e) {
          console.warn(`⚠️ [Try-On] Falha ao converter URL para base64, enviando URL original: ${url.substring(0, 50)}...`);
          return url;
        }
      };

      const [userB64Raw, clothingB64Raw] = await Promise.all([
        extrairBase64(userState.uploadedImage || ''),
        extrairBase64(clothingImageUrl)
      ]);

      console.log('📦 [Try-On] Base64 extraído:', {
        userB64Length: userB64Raw?.length,
        clothingB64Length: clothingB64Raw?.length,
        userHasData: !!userB64Raw,
        clothingHasData: !!clothingB64Raw
      });

      if (!userB64Raw || (userB64Raw.length < 100 && !userB64Raw.startsWith('http'))) {
        throw new Error("Não foi possível processar a sua foto. Verifique se ela foi carregada corretamente.");
      }
      if (!clothingB64Raw || (clothingB64Raw.length < 100 && !clothingB64Raw.startsWith('http'))) {
        throw new Error("Não foi possível processar a imagem da roupa. Tente novamente.");
      }

      // Compressão para garantir estabilidade e performance
      console.log('🗜️ [Try-On] Iniciando compressão...');
      const [userBase64, clothingBase64] = await Promise.all([
        compressImage(userB64Raw, 768, 768, 0.7).then(res => res.includes(',') ? res.split(',')[1] : res),
        compressImage(clothingB64Raw, 768, 768, 0.7).then(res => res.includes(',') ? res.split(',')[1] : res)
      ]);

      if (!userBase64 || (userBase64.length < 100 && !userBase64.startsWith('http'))) {
        throw new Error("Erro na compressão da sua foto.");
      }
      if (!clothingBase64 || (clothingBase64.length < 100 && !clothingBase64.startsWith('http'))) {
        throw new Error("Erro na compressão da imagem da roupa.");
      }

      console.log('🗜️ [Try-On] Imagens comprimidas:', {
        userCompressedLength: userBase64?.length,
        clothingCompressedLength: clothingBase64?.length
      });

      const resultImage = await generateTryOnLook(
        userBase64, 
        clothingBase64, 
        categoryToUse
      );

      if (!resultImage) {
        throw new Error("Nenhuma imagem foi gerada.");
      }

      // Log para depuração: verificar se a imagem mudou (comparação simples de tamanho/prefixo)
      console.log('📸 [Try-On] Imagem gerada com sucesso. Tamanho:', resultImage.length);
      if (resultImage.includes(userBase64.substring(0, 100))) {
        console.warn('⚠️ [Try-On] A imagem gerada parece ser idêntica à original. O modelo pode ter falhado em aplicar a roupa.');
      }

      // Salva no Firebase Storage via Cloud Function (Resolve CORS)
      try {
        const salvarImagemStorage = httpsCallable(functions, 'salvarImagemStorage');
        const resultado = await salvarImagemStorage({
          imagemBase64: resultImage,
          userId: userId
        });
        
        const { url } = resultado.data as { url: string };
        setUrlPublicaImagem(url);
        
      } catch (error: any) {
        console.error('Erro detalhado ao salvar imagem no Storage:', {
          message: error.message,
          code: error.code,
          details: error.details
        });
        setUrlPublicaImagem('');
      }

      // Gera um elogio personalizado baseado na peça
      const compliment = await generateCompliment(clothingBase64);
      setUserState(prev => ({ ...prev, lastCompliment: compliment }));

      // Sucesso — salva no histórico
      addToHistory({
        id: Date.now().toString(),
        date: new Date().toISOString(),
        generatedImage: resultImage,
        userImage: userState.uploadedImage!,
        clothingImage: clothingImageUrl,
        type: 'UPLOAD',
        stylistTip: getStylistTip(userState.selectedCategory || 'default'),
        compliment: compliment
      });

      setUserState(prev => ({ ...prev, generatedImage: resultImage }));
      setScreen(Screen.RESULT);

      // Atualiza estatísticas de gamificação
      if (userId) {
        const today = new Date().toISOString().split('T')[0];
        // totalPhotosGenerated já é incrementado no deductCredit
        const currentTotalPhotos = userState.totalPhotosGenerated || 0;
        const currentDailyUsage = userState.dailyUsage?.date === today ? userState.dailyUsage.count : 0;
        const newDailyUsage = currentDailyUsage + 10;
        
        // Define o badge baseado no total de fotos
        let newBadge = userState.badge;
        if (currentTotalPhotos >= 100) newBadge = 'diamond';
        else if (currentTotalPhotos >= 60) newBadge = 'gold';
        else if (currentTotalPhotos >= 40) newBadge = 'silver';
        else if (currentTotalPhotos >= 20) newBadge = 'bronze';

        // Verifica se subiu de nível para Ouro ou Diamante
        if (newBadge !== userState.badge) {
          if (newBadge === 'gold') {
            setAchievedBadge('gold');
            setShowAchievementModal(true);
          } else if (newBadge === 'diamond') {
            setAchievedBadge('diamond');
            setShowAchievementModal(true);
          }
        }

        try {
          await updateDoc(doc(db, 'users', userId), {
            dailyUsage: { date: today, count: newDailyUsage, claimedChest: userState.dailyUsage?.claimedChest || false },
            badge: newBadge
          });
          setUserState(prev => ({ 
            ...prev, 
            dailyUsage: { date: today, count: newDailyUsage, claimedChest: prev.dailyUsage?.claimedChest || false },
            badge: newBadge as any
          }));
        } catch (err) {
          console.error('Erro ao atualizar gamificação:', err);
        }
      }

      // Extrai tags de estilo em segundo plano para não travar a UI
      extractStyleTags(clothingBase64).then(async (newTags) => {
        if (newTags.length > 0 && userId) {
          const updatedTags = [...(userState.styleTags || []), ...newTags].slice(-20); // Mantém as últimas 20 tags
          
          // Salva no Firestore
          try {
            await updateDoc(doc(db, 'users', userId), { styleTags: updatedTags });
            setUserState(prev => ({ ...prev, styleTags: updatedTags }));
          } catch (error) {
            console.error('Erro ao salvar styleTags:', error);
          }
        }
      });

      setTimeout(() => {
        const jaAvaliou = localStorage.getItem(`avaliou_${userId}`);
        if (!jaAvaliou) {
          setShowAvaliacaoModal(true);
        }
      }, 2500);

    } catch (error: any) {
      console.error('Erro detalhado na geração:', {
        message: error.message,
        code: error.code,
        details: error.details,
        stack: error.stack
      });
      
      // DEVOLVE OS 10 CRÉDITOS AUTOMATICAMENTE
      try {
        await addCredits(userId, 10);
        console.log('✅ 10 créditos devolvidos');
      } catch (creditError) {
        console.error('Erro ao devolver créditos:', creditError);
      }

      // Verifica tipo de erro para mensagem certa
      const errorMsg = error?.message || '';
      const errorCode = error?.code || '';
      
      let displayMsg = '❌ Erro ao gerar imagem.\n\nSeus 10 créditos foram devolvidos!\n\nTente novamente em instantes.';
      
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('Too Many Requests') || errorCode === 'resource-exhausted') {
        displayMsg = '⚠️ Muitos usuários gerando imagens ao mesmo tempo.\n\nSeus 10 créditos foram devolvidos!\n\nTente novamente em alguns instantes.';
      } else if (errorMsg.includes('timeout') || errorMsg.includes('deadline') || errorCode === 'deadline-exceeded') {
        displayMsg = '⏱️ A geração demorou muito e foi cancelada.\n\nSeus 10 créditos foram devolvidos!\n\nTente novamente.';
      } else if (errorMsg.includes('not-found') || errorMsg.includes('Não foi possível gerar a imagem')) {
        displayMsg = '🔍 A IA não conseguiu identificar a pessoa ou a roupa.\n\nCertifique-se de que a pessoa e a peça estão bem visíveis e com fundo simples.';
      }

      setErrorMessage(displayMsg);
      setShowErrorModal(true);
      setScreen(Screen.FINALIZE);
    }
  };

  const handleView360 = () => {
    const isPremiumUser = userState.subscriptionTier === 'premium' || 
                          (userState.lastPurchaseAmount === 29.9 || userState.lastPurchaseAmount === 29.90 || userState.lastPurchaseAmount === 30) ||
                          (userState.lastPlan && (userState.lastPlan.toLowerCase().includes('premium') || userState.lastPlan.includes('29,90') || userState.lastPlan.includes('29.90') || userState.lastPlan.includes('30')));

    const rawDate = userState.subscriptionStartDate || userState.createdAt;
    const startDate = parseFirebaseDate(rawDate);
    let daysSinceJoin = 0;
    if (startDate) {
      const now = new Date();
      const diffTime = now.getTime() - startDate.getTime();
      daysSinceJoin = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    if (daysSinceJoin < 7) {
      const daysRemaining = 7 - daysSinceJoin;
      alert(`✨ Olá, estrela! Sua jornada 360° está quase pronta. \n\nPara garantir a melhor experiência e qualidade, o recurso 360° será liberado em ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}. \n\nAproveite para explorar novos looks enquanto preparamos tudo com carinho para você! 💜`);
      return;
    }

    if (!isPremiumUser) {
      setShowPremiumModal(true);
      return;
    }

    setScreen(Screen.VIEW_360);
  };

  const handleGenerate360 = async (sideImgUrl: string, backImgUrl: string, clothingBackImgUrl: string | null) => {
     if (userState.credits < 20) {
       alert('⚠️ Você precisa de pelo menos 20 créditos para gerar a visualização 360°.');
       handleOpenCredits();
       return;
     }

     // Desconta 20 créditos ANTES de gerar
     const ok = await deductCredit(userId, 20);
     if (!ok) {
       alert('Erro ao processar créditos. Tente novamente.');
       return;
     }

     setLoadingMessage("Gerando visualização 360°...");
     setIs360Loading(true);
     setAspectRatio('original');
     setUserState(prev => ({ ...prev, sideImage: sideImgUrl, backImage: backImgUrl, clothingBackImage: clothingBackImgUrl }));
     setScreen(Screen.LOADING);
     
     try {
       // Preparar Base64 para as 3 imagens
       // Se já temos a imagem gerada de frente, não precisamos gerar de novo
       const safeExtract = async (url: string | null): Promise<string> => {
         if (!url) return '';
         try {
           if (url.startsWith('data:')) return url.split(',')[1] || '';
           const b64 = await urlToBase64(url);
           return b64 || url;
         } catch (e) {
           return url;
         }
       };
       const frontB64Raw = userState.generatedImage ? null : await safeExtract(userState.uploadedImage);
       const sideB64Raw = await safeExtract(sideImgUrl);
       const backB64Raw = await safeExtract(backImgUrl);
       const clothingB64Raw = await safeExtract(userState.clothingImage);
       const clothingBackB64Raw = clothingBackImgUrl ? await safeExtract(clothingBackImgUrl) : null;

        // Revertendo para 768px para garantir estabilidade, pois 1024px pode causar falhas no modelo Vertex AI
        const [frontB64, sideB64, backB64, clothingB64, clothingBackB64] = await Promise.all([
          frontB64Raw ? compressImage(frontB64Raw.startsWith('http') ? frontB64Raw : `data:image/jpeg;base64,${frontB64Raw}`, 768, 768, 0.7).then(res => res.split(',')[1] || res) : Promise.resolve(null),
          compressImage(sideB64Raw.startsWith('http') ? sideB64Raw : `data:image/jpeg;base64,${sideB64Raw}`, 768, 768, 0.7).then(res => res.split(',')[1] || res),
          compressImage(backB64Raw.startsWith('http') ? backB64Raw : `data:image/jpeg;base64,${backB64Raw}`, 768, 768, 0.7).then(res => res.split(',')[1] || res),
          compressImage(clothingB64Raw.startsWith('http') ? clothingB64Raw : `data:image/jpeg;base64,${clothingB64Raw}`, 768, 768, 0.7).then(res => res.split(',')[1] || res),
          clothingBackB64Raw ? compressImage(clothingBackB64Raw.startsWith('http') ? clothingBackB64Raw : `data:image/jpeg;base64,${clothingBackB64Raw}`, 768, 768, 0.7).then(res => res.split(',')[1] || res) : Promise.resolve(null)
        ]);

       if (sideB64 && backB64 && clothingB64) {
           const results = await generate360View(frontB64, sideB64, backB64, clothingB64, userState.selectedCategory || "clothes", clothingBackB64);
           
           // Se pulamos a geração da frente, usamos a imagem que já temos
           const finalResults = [...results];
           if (frontB64 === null && userState.generatedImage) {
             finalResults[0] = userState.generatedImage;
           }
           
           setUserState(prev => ({ ...prev, generated360Images: finalResults }));
           setIs360Loading(false);
           setScreen(Screen.RESULT_360);

           // Atualiza estatísticas de gamificação para 360 (consome 20 créditos)
           if (userId) {
             const today = new Date().toISOString().split('T')[0];
             const currentDailyUsage = userState.dailyUsage?.date === today ? userState.dailyUsage.count : 0;
             const newDailyUsage = currentDailyUsage + 20;
             
             try {
               await updateDoc(doc(db, 'users', userId), {
                 dailyUsage: { 
                   date: today, 
                   count: newDailyUsage, 
                   claimedChest: userState.dailyUsage?.claimedChest || false 
                 }
               });
               setUserState(prev => ({ 
                 ...prev, 
                 dailyUsage: { 
                   date: today, 
                   count: newDailyUsage, 
                   claimedChest: prev.dailyUsage?.claimedChest || false 
                 }
               }));
             } catch (err) {
               console.error('Erro ao atualizar gamificação 360:', err);
             }
           }
       } else {
          throw new Error("Erro ao processar imagens para 360.");
       }
     } catch (error) {
       console.error('Erro ao gerar 360:', error);
       
       // DEVOLVE OS 20 CRÉDITOS AUTOMATICAMENTE
       try {
         await addCredits(userId, 20);
         console.log('✅ 20 créditos devolvidos');
       } catch (creditError) {
         console.error('Erro ao devolver créditos:', creditError);
       }

       alert('❌ Erro ao gerar visualização 360°.\n\nSeus 20 créditos foram devolvidos!\n\nTente novamente em instantes.');
       
       setIs360Loading(false);
       setScreen(Screen.VIEW_360);
     }
  };

  const handleRestart = () => {
    // Keep user info and home upload, reset category and clothing
    setUserState(prev => ({ 
        ...prev, 
        selectedCategory: null, 
        clothingImage: null, 
        generatedImage: null,
        sideImage: null, 
        backImage: null, 
        generated360Images: null
    }));
    setScreen(Screen.CATEGORY);
  };

  const handleOpenCredits = () => {
      setScreen(Screen.CREDITS);
  };

  const handleAddCredits = () => {
      // Simulation of adding credits
      setUserState(prev => ({ ...prev, credits: prev.credits + 10 }));
  };

  const handleBackToHome = () => {
      setScreen(Screen.MAIN);
  };

  const salvarAvaliacao = async () => {
    if (notaAvaliacao === 0) return;
    
    try {
      const { collection, addDoc, serverTimestamp } = 
        await import('firebase/firestore');
      
      await addDoc(collection(db, 'avaliacoes'), {
        userId,
        nota: notaAvaliacao,
        comentario: comentarioAvaliacao.trim(),
        categoria: userState.selectedCategory || 'geral',
        data: serverTimestamp(),
      });

      localStorage.setItem(`avaliou_${userId}`, 'true');
      setShowAvaliacaoModal(false);
      setNotaAvaliacao(0);
      setComentarioAvaliacao('');
      console.log('✅ Avaliação salva!');
    } catch (error) {
      console.error('Erro ao salvar avaliação:', error);
      setShowAvaliacaoModal(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // FUNÇÕES DA TELA DE CADASTRO
  // ═══════════════════════════════════════════════════════════

  const handleCriarConta = async () => {
    if (!cadastroNome || !cadastroEmail || !cadastroSenha || !cadastroConfirmarSenha) {
      alert('⚠️ Preencha todos os campos');
      return;
    }
    
    if (cadastroSenha.length < 6) {
      alert('⚠️ A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (cadastroSenha !== cadastroConfirmarSenha) {
      alert('⚠️ As senhas não coincidem');
      return;
    }
    
    try {
      setIsCadastroLoading(true);
      const emailLower = cadastroEmail.toLowerCase().trim();
      
      let user;
      try {
        // Tenta criar nova conta
        const result = await createUserWithEmailAndPassword(auth, emailLower, cadastroSenha);
        user = result.user;
        
        // Cria documento no Firestore com créditos iniciais usando UID como ID
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          email: emailLower,
          nome: cadastroNome,
          uid: user.uid,
          credits: 10,
          created_at: serverTimestamp()
        });
        console.log('Novo usuário criado no Firestore via Cadastro:', user.uid);
      } catch (error: any) {
        // Se o email já estiver em uso, tenta fazer login automaticamente com a mesma senha
        if (error.code === 'auth/email-already-in-use') {
          console.log('Email já em uso, tentando login automático...');
          const loginResult = await signInWithEmailAndPassword(auth, emailLower, cadastroSenha);
          user = loginResult.user;
        } else {
          throw error;
        }
      }
      
      if (user) {
        setUserId(user.uid);
        
        // Busca dados do usuário para atualizar o estado local
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          setUserState(prev => ({ 
            ...prev, 
            email: emailLower,
            name: userData.nome || cadastroNome,
            credits: userData.credits ?? 10
          }));
        } else {
          setUserState(prev => ({ 
            ...prev, 
            email: emailLower,
            name: cadastroNome,
            credits: 10
          }));
        }
        
        // Marca guia como visto para ir direto
        localStorage.setItem(`guia_visto_${user.uid}`, 'true');
        setIsFirstLogin(false);
        setScreen(Screen.MAIN);
      }
      
    } catch (error: any) {
      console.error('Erro ao cadastrar:', error);
      
      if (error.code === 'auth/email-already-in-use') {
        // Já tratado acima com login automático, mas se chegar aqui é porque a senha está errada
        alert('❌ Este email já está cadastrado com outra senha.\n\nUse a tela de login para entrar ou recuperar sua senha.');
      } else if (error.code === 'auth/invalid-email') {
        alert('❌ Email inválido.\n\nDigite um email válido.');
      } else if (error.code === 'auth/weak-password') {
        alert('❌ Senha muito fraca.\n\nUse pelo menos 6 caracteres.');
      } else {
        alert('❌ Erro ao criar conta.\n\nTente novamente em alguns instantes.');
      }
    } finally {
      setIsCadastroLoading(false);
    }
  };

  const handleGoogleLoginFromCadastro = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      if (!user.email) {
        alert('Não foi possível obter seu email. Tente novamente.');
        return;
      }
      
      const userEmail = user.email.toLowerCase().trim();
      setUserId(user.uid);
      
      // Verificar se usuário já existe no Firestore
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      let credits = 10;
      let name = user.displayName || 'Usuário';
      
      // Se NÃO existe, criar com créditos iniciais
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: userEmail,
          nome: name,
          uid: user.uid,
          credits: 10,
          created_at: serverTimestamp()
        });
        console.log('Novo usuário criado no Firestore via Google (Cadastro):', user.uid);
      } else {
        const userData = userSnap.data();
        credits = userData.credits ?? 0;
        name = userData.nome || userData.name || name;
      }
      
      setUserState(prev => ({ 
        ...prev, 
        email: userEmail,
        name: name,
        credits 
      }));

      // Marca guia como visto para ir direto
      localStorage.setItem(`guia_visto_${user.uid}`, 'true');
      setIsFirstLogin(false);

      // Limpa campos de cadastro
      setCadastroEmail('');
      setCadastroSenha('');
      setCadastroConfirmarSenha('');
      
      setScreen(Screen.MAIN);
    } catch (error) {
      console.error('Erro no login Google (Cadastro):', error);
      alert('Erro ao fazer login com Google. Tente novamente.');
    }
  };

  const handleEnviarLinkRecuperacao = async () => {
    if (!emailRecuperacao || !emailRecuperacao.includes('@')) {
      alert('⚠️ Digite um email válido');
      return;
    }
    
    try {
      const emailLower = emailRecuperacao.toLowerCase().trim();
      
      // Configurações para o link de recuperação apontar de volta para o app
      const actionCodeSettings = {
        url: 'https://pandoravesteai.com',
        handleCodeInApp: true,
      };
      
      await sendPasswordResetEmail(auth, emailLower, actionCodeSettings);
      
      // Limpa o campo e volta para login
      setEmailRecuperacao('');
      setScreen(Screen.LOGIN);
      
      // Mostra o modal de sucesso
      setShowSuccessModal(true);
      
    } catch (error: any) {
      console.error('Erro ao enviar email:', error);
      
      if (error.code === 'auth/user-not-found') {
        alert('❌ Email não encontrado.\n\nEste email não está cadastrado.\n\nClique em "Cadastre-se" para criar uma conta.');
      } else if (error.code === 'auth/invalid-email') {
        alert('❌ Email inválido.\n\nDigite um email válido.');
      } else {
        alert('❌ Erro ao enviar email.\n\nTente novamente em alguns instantes.');
      }
    }
  };


  const renderScreen = () => {
    let content = null;
    let showBanner = true;
    let onBack = undefined;
    let backIcon: 'arrow' | 'x' = 'arrow';

    switch (screen) {
      case Screen.SPLASH:
        return <SplashScreen onFinish={handleSplashFinish} />;
      case Screen.LOGIN:
        return (
          <LoginScreen 
            onLogin={handleLogin} 
            onNoRegistration={() => setScreen(Screen.NO_REGISTRATION)}
            setUserId={setUserId}
            setUserState={setUserState}
            setScreen={setScreen}
            setShowSuccessModal={setShowSuccessModal}
            setIsFirstLogin={setIsFirstLogin}
          />
        );
      case Screen.CADASTRO:
        return (
          <CadastroScreen 
            onBack={() => setScreen(Screen.LOGIN)}
            onCriarConta={handleCriarConta}
            onGoogleLogin={handleGoogleLoginFromCadastro}
            nome={cadastroNome}
            setNome={setCadastroNome}
            email={cadastroEmail}
            setEmail={setCadastroEmail}
            senha={cadastroSenha}
            setSenha={setCadastroSenha}
            confirmarSenha={cadastroConfirmarSenha}
            setConfirmarSenha={setCadastroConfirmarSenha}
            isLoading={isCadastroLoading}
          />
        );
      case Screen.RECUPERAR_SENHA:
        return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6">
            <div className="w-full max-w-md space-y-8">
              <AppLogo size="md" />

              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-[#2E0249]">Recuperar Senha</h2>
                  <p className="text-gray-500 text-sm mt-2">Enviaremos um link para o seu e-mail</p>
                </div>

                <Input
                  label="EMAIL"
                  type="email"
                  placeholder="seu@email.com"
                  value={emailRecuperacao}
                  onChange={(e) => setEmailRecuperacao(e.target.value)}
                  icon={<Mail size={20} />}
                  autoComplete="email"
                />

                <Button
                  onClick={handleEnviarLinkRecuperacao}
                  disabled={!emailRecuperacao || !emailRecuperacao.includes('@')}
                >
                  Enviar Link de Recuperação
                </Button>

                <div className="text-center">
                  <button 
                    onClick={() => {
                      setEmailRecuperacao('');
                      setScreen(Screen.LOGIN);
                    }}
                    className="text-[#8B2CF5] hover:text-[#F52C99] transition-colors text-sm font-semibold"
                  >
                    ← Voltar para Login
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      case Screen.REDEFINIR_SENHA:
        return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 animate-fade-in">
            <div className="w-full max-w-md space-y-10">
              <AppLogo size="lg" />

              <div className="space-y-6">
                <Input
                  label="NOVA SENHA"
                  type="password"
                  placeholder="••••••••"
                  value={novaSenhaRedefinir}
                  onChange={(e) => setNovaSenhaRedefinir(e.target.value)}
                  icon={<Lock size={20} />}
                />

                <Input
                  label="REPETIR SENHA"
                  type="password"
                  placeholder="••••••••"
                  value={confirmarNovaSenhaRedefinir}
                  onChange={(e) => setConfirmarNovaSenhaRedefinir(e.target.value)}
                  icon={<Lock size={20} />}
                />

                {confirmarNovaSenhaRedefinir && novaSenhaRedefinir !== confirmarNovaSenhaRedefinir && (
                  <p className="text-red-500 text-xs font-semibold ml-1 animate-pulse">
                    ⚠️ As senhas não coincidem
                  </p>
                )}

                <div className="pt-4">
                  <Button
                    onClick={handleSalvarNovaSenha}
                    disabled={
                      !novaSenhaRedefinir || 
                      !confirmarNovaSenhaRedefinir ||
                      novaSenhaRedefinir !== confirmarNovaSenhaRedefinir ||
                      novaSenhaRedefinir.length < 6
                    }
                  >
                    Salvar Nova Senha
                  </Button>
                </div>

                <div className="text-center">
                  <button 
                    onClick={() => {
                      setNovaSenhaRedefinir('');
                      setConfirmarNovaSenhaRedefinir('');
                      setOobCode('');
                      window.history.replaceState({}, document.title, '/');
                      setScreen(Screen.LOGIN);
                    }}
                    className="text-gray-400 hover:text-purple-600 transition-colors text-sm font-medium"
                  >
                    ← Voltar para Login
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      case Screen.NO_REGISTRATION:
        return <NoRegistrationScreen onBack={() => setScreen(Screen.LOGIN)} />;
      case Screen.MAIN:
        content = (
          <HomeScreen 
            onUpload={handleHomeUpload} 
            onContinue={handleConfirmUpload}
            uploadedImage={userState.uploadedImage}
            userName={getUserName()} 
            onOpenFAQ={handleOpenFAQ}
            isFirstLogin={isFirstLogin}
            isPremium={isPremiumUser}
            onGuiaVisto={() => {
              setIsFirstLogin(false);
              localStorage.setItem(`guia_visto_${userId}`, 'true');
            }}
            userId={userId || undefined}
            userState={userState}
          />
        );
        showBanner = true;
        break;
      case Screen.ONBOARDING:
        setScreen(Screen.MAIN);
        return null;
      case Screen.FAQ:
        content = <FAQScreen onBack={handleBackFromFAQ} />;
        onBack = handleBackFromFAQ;
        showBanner = false; // Hide banner on FAQ
        break;
      case Screen.UPLOAD:
        content = (
           <HomeScreen 
             onUpload={handleHomeUpload} 
             onContinue={handleConfirmUpload}
             uploadedImage={userState.uploadedImage}
             userName={getUserName()} 
             onOpenFAQ={handleOpenFAQ}
             isFirstLogin={isFirstLogin}
             isPremium={isPremiumUser}
             onGuiaVisto={() => {
               setIsFirstLogin(false);
               localStorage.setItem(`guia_visto_${userId}`, 'true');
             }}
             userId={userId || undefined}
             userState={userState}
           />
        );
        break;
      case Screen.CREDITS:
        content = (
            <ProfileScreen 
                userId={userId}
                userState={userState}
                setUserState={setUserState}
                history={userState.history}
                onAddCredits={handleOpenCredits}
                onBuyCredits={handleBuyCredits}
                onOpenCheckout={handleOpenCheckout}
                onBack={handleBackToHome}
                onUpdateProfile={handleUpdateProfile}
                onReuse={handleReuseHistoryItem}
                onOpenFAQ={handleOpenFAQ}
                onSyncCredits={() => {}}
                setUserId={setUserId}
                setScreen={setScreen}
                isAdmin={isAdmin}
                showChestNotification={showChestNotification}
                setShowChestNotification={setShowChestNotification}
            />
        );
        onBack = handleBackToHome;
        showBanner = false; // Hide banner on Profile
        break;
      case Screen.CATEGORY:
        content = <CategoryScreen onSelect={handleCategorySelect} onBack={() => { setScreen(Screen.MAIN); }} isPremium={isPremiumUser} onOpenPremiumModal={() => setShowPremiumModal(true)} />;
        onBack = () => { setScreen(Screen.MAIN); };
        break;
      case Screen.STYLE_QUIZ:
        return (
          <StyleQuizScreen 
            onComplete={handleStyleQuizComplete}
            onBack={() => setScreen(Screen.CREDITS)}
          />
        );
      case Screen.FINALIZE:
        content = (
          <FinalizeScreen 
            category={userState.selectedCategory!} 
            userImage={userState.uploadedImage}
            onGenerate={handleGenerateLook}
            onRestart={handleRestart}
            onBack={() => setScreen(Screen.CATEGORY)}
            loading={false}
            isPremium={isPremiumUser}
            initialClothingImage={userState.clothingImage}
          />
        );
        onBack = () => setScreen(Screen.CATEGORY);
        break;
      case Screen.LOADING:
        return (
          <LoadingScreen 
            message={loadingMessage} 
            userImage={userState.uploadedImage}
            clothingImage={userState.clothingImage}
            is360={is360Loading}
          />
        );
      case Screen.RESULT:
        content = (
          <ResultScreen 
            userImage={userState.uploadedImage}
            clothingImage={userState.clothingImage}
            generatedImage={userState.generatedImage}
            onRestart={handleRestart}
            onView360={handleView360}
            onBack={() => setScreen(Screen.FINALIZE)}
            onOpenPremiumModal={() => setShowPremiumModal(true)}
            onOpenCheckout={handleOpenCheckout}
            userState={userState}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
          />
        );
        onBack = () => setScreen(Screen.FINALIZE);
        break;
      case Screen.CHECKOUT:
        content = (
          <CheckoutScreen 
            url={checkoutUrl || "https://pay.cakto.com.br/wsopww7_808505?"} 
            onBack={() => setScreen(previousScreen || Screen.ONBOARDING)} 
          />
        );
        onBack = () => setScreen(previousScreen || Screen.ONBOARDING);
        break;
      case Screen.VIEW_360:
         content = (
           <View360Screen 
             userImage={userState.uploadedImage}
             onGenerate360={handleGenerate360}
             onBack={() => setScreen(Screen.RESULT)}
           />
         );
         onBack = () => setScreen(Screen.RESULT);
         backIcon = 'x';
         break;
      case Screen.RESULT_360:
         content = (
           <Result360Screen 
             images={userState.generated360Images}
             onRestart={handleRestart}
             onBack={() => setScreen(Screen.RESULT)}
             userState={userState}
             onOpenPremiumModal={() => setShowPremiumModal(true)}
             aspectRatio={aspectRatio}
             setAspectRatio={setAspectRatio}
           />
         );
         onBack = () => setScreen(Screen.RESULT);
         backIcon = 'x';
         break;
      default:
        return (
          <LoginScreen 
            onLogin={handleLogin} 
            onNoRegistration={() => setScreen(Screen.NO_REGISTRATION)}
            setUserId={setUserId}
            setUserState={setUserState}
            setScreen={setScreen}
            setShowSuccessModal={setShowSuccessModal}
            setIsFirstLogin={setIsFirstLogin}
          />
        );
    }

    if (content) {
      return (
        <MainLayout 
          credits={userState.credits} 
          onOpenCredits={handleOpenCredits} 
          onOpenFAQ={handleOpenFAQ}
          onOpenPremiumModal={() => setShowPremiumModal(true)}
          showBanner={showBanner}
          isPremium={isPremiumUser}
          onBack={onBack}
          backIcon={backIcon}
          styleTags={userState.styleTags}
          chestReady={isChestReady}
          onOpenChest={() => setShowChestModal(true)}
        >
          {content}
        </MainLayout>
      );
    }
    return null;
  };

  return (
    <ErrorBoundary>
      <div className="w-full h-[100dvh] max-w-lg mx-auto bg-white shadow-2xl overflow-hidden relative font-sans text-[#2E0249] flex flex-col">
        {renderScreen()}

        {/* Modal de Erro Customizado */}
        {showErrorModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl transform animate-scale-in text-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600">
                <AlertTriangle size={40} />
              </div>
              <h3 className="text-xl font-bold text-[#2E0249] mb-4">Ops! Algo deu errado</h3>
              <div className="text-gray-600 mb-8 whitespace-pre-line">
                {errorMessage}
              </div>
              <Button onClick={() => setShowErrorModal(false)} className="w-full">
                Entendi
              </Button>
            </div>
          </div>
        )}

        {/* Modal de Sucesso Recuperação de Senha */}
        {showSuccessModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl transform animate-scale-in text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
                <Check size={40} strokeWidth={3} />
              </div>
              <h3 className="text-xl font-bold text-[#2E0249] mb-4">Link Enviado!</h3>
              <p className="text-gray-600 mb-2">
                Foi enviado para você um link de recuperação para você redefinir sua senha.
              </p>
              <p className="text-gray-500 text-sm mb-8">
                Cheque o seu e-mail e sua caixa de spam.
              </p>
              <Button onClick={() => setShowSuccessModal(false)} className="w-full">
                Entendi
              </Button>
            </div>
          </div>
        )}

        {/* Modal Premium Persuasivo */}
        {showPremiumModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl transform animate-scale-in text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-purple-600 to-pink-500"></div>
              <button 
                onClick={() => setShowPremiumModal(false)} 
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </button>
              
              <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6 text-purple-600 shadow-inner">
                <ShieldCheck size={40} />
              </div>
              
              <h3 className="text-2xl font-black text-[#2E0249] mb-4 tracking-tight">🔒 OPORTUNIDADE EXCLUSIVA!</h3>
              
              <div className="space-y-4 mb-8">
                <p className="text-gray-600 text-sm leading-relaxed">
                  Liberte o poder do <span className="font-bold text-purple-600">Plano Premium (R$ 29,90)</span> agora mesmo! 💎
                </p>
                <p className="text-gray-600 text-sm leading-relaxed font-medium">
                  Não perca a chance de aproveitar os descontos especiais e as ofertas secretas que a Pandora AI selecionou para o seu estilo.
                </p>
                <p className="text-purple-700 text-xs font-bold bg-purple-50 py-2 px-4 rounded-full inline-block">
                  Economize de verdade nas maiores lojas do Brasil! 🛍️✨
                </p>
              </div>
              
              <Button onClick={() => { 
                setShowPremiumModal(false); 
                handleOpenCheckout("https://pay.cakto.com.br/wsopww7_808505?");
              }}>
                Quero ser Premium agora!
              </Button>
            </div>
          </div>
        )}

        {showAvaliacaoModal && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            animation: 'fadeIn 0.3s ease'
          }}>
            <div style={{
              background: 'white',
              borderRadius: '24px',
              padding: '32px 24px',
              maxWidth: '340px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
              {/* Emoji */}
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
              
              {/* Título */}
              <h3 style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#1a1a1a',
                marginBottom: '6px'
              }}>
                Gostou do resultado?
              </h3>
              
              <p style={{
                fontSize: '13px',
                color: '#888',
                marginBottom: '24px'
              }}>
                Sua avaliação nos ajuda a melhorar!
              </p>

              {/* Estrelas */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '20px'
              }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setNotaAvaliacao(star)}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '36px',
                      padding: '4px',
                      transition: 'transform 0.1s ease',
                      transform: (hoveredStar || notaAvaliacao) >= star 
                        ? 'scale(1.2)' : 'scale(1)',
                      filter: (hoveredStar || notaAvaliacao) >= star 
                        ? 'none' : 'grayscale(100%)'
                    }}
                  >
                    ⭐
                  </button>
                ))}
              </div>

              {/* Comentário opcional */}
              {notaAvaliacao > 0 && (
                <textarea
                  placeholder="O que achou? (opcional)"
                  value={comentarioAvaliacao}
                  onChange={(e) => setComentarioAvaliacao(e.target.value)}
                  maxLength={200}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid #e0e0e0',
                    fontSize: '13px',
                    resize: 'none',
                    height: '80px',
                    marginBottom: '16px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              )}

              {/* Botões */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => {
                    localStorage.setItem(`avaliou_${userId}`, 'true');
                    setShowAvaliacaoModal(false);
                  }}
                  style={{
                    flex: 1,
                    padding: '13px',
                    background: '#f5f5f5',
                    color: '#888',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}>
                  Agora não
                </button>

                <button
                  onClick={salvarAvaliacao}
                  disabled={notaAvaliacao === 0}
                  style={{
                    flex: 1,
                    padding: '13px',
                    background: notaAvaliacao > 0 
                      ? 'linear-gradient(135deg, #9333ea, #ec4899)' 
                      : '#e0e0e0',
                    color: notaAvaliacao > 0 ? 'white' : '#aaa',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: notaAvaliacao > 0 ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s ease'
                  }}>
                  Enviar ⭐
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Admin */}
      </div>

      {/* Closet Limit Modal */}
      <AnimatePresence>
        {showClosetLimitModal && (
          <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl text-center relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-400 to-purple-500"></div>
              
              <button 
                onClick={() => setShowClosetLimitModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2"
              >
                <X size={24} />
              </button>

              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mx-auto mb-6">
                <Box size={40} />
              </div>

              <h3 className="text-2xl font-bold text-[#2E0249] mb-2">Closet Cheio! 👗</h3>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                Seu Closet Virtual atingiu o limite de <b>{userState.closetLimit || 10} imagens</b>. 
                Deseja liberar mais <b>10 espaços</b> por apenas <b>20 créditos</b>?
              </p>

              <div className="bg-gray-50 rounded-2xl p-4 mb-8 flex items-center justify-between">
                <div className="text-left">
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Custo</p>
                  <p className="text-lg font-bold text-blue-600">20 Créditos</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Seu Saldo</p>
                  <p className="text-lg font-bold text-[#2E0249]">{userState.credits} ⚡</p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button 
                  onClick={handleUnlockCloset}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-500 shadow-lg shadow-blue-200"
                >
                  <Zap size={18} /> Liberar Espaço Agora
                </Button>
                <button 
                  onClick={() => setShowClosetLimitModal(false)}
                  className="w-full py-3 text-gray-400 text-sm font-medium hover:text-gray-600 transition-colors"
                >
                  Talvez mais tarde
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Chest Modal */}
      <AnimatePresence>
        {showChestModal && (
          <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className="bg-white rounded-[40px] p-8 w-full max-w-sm shadow-2xl text-center relative overflow-hidden"
            >
              <button 
                onClick={() => setShowChestModal(false)}
                className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 p-2"
              >
                <X size={24} />
              </button>

              <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 mx-auto mb-6 animate-bounce">
                <Archive size={48} />
              </div>

              <h2 className="text-2xl font-black text-[#2E0249] mb-2 tracking-tight">
                BAÚ DE RECOMPENSA! 🎁
              </h2>
              
              <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                Você usou 30 créditos hoje e liberou um presente especial! Toque no baú para resgatar.
              </p>

              <Button 
                onClick={handleClaimChest}
                disabled={isClaimingChest}
                className="w-full py-4 text-lg font-black bg-gradient-to-r from-yellow-400 to-orange-500 shadow-lg shadow-yellow-200"
              >
                {isClaimingChest ? 'RESGATANDO...' : 'ABRIR BAÚ (+10⚡)'}
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Achievement Modal */}
      <AnimatePresence>
        {showAchievementModal && (
          <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0, rotate: 10 }}
              className="bg-white rounded-[40px] p-8 w-full max-w-sm shadow-2xl text-center relative overflow-hidden"
            >
              {/* Decorative elements */}
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-purple-600/10 to-transparent"></div>
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl"></div>
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-pink-500/10 rounded-full blur-2xl"></div>
              
              <div className="relative z-10">
                <div className="w-24 h-24 mx-auto mb-6 relative">
                  <div className="absolute inset-0 bg-yellow-400 rounded-full animate-ping opacity-20"></div>
                  <div className={`w-full h-full rounded-full flex items-center justify-center text-white shadow-xl ${achievedBadge === 'diamond' ? 'bg-gradient-to-br from-blue-400 to-indigo-600' : 'bg-gradient-to-br from-yellow-400 to-orange-500'}`}>
                    {achievedBadge === 'diamond' ? <Trophy size={48} /> : <Star size={48} fill="currentColor" />}
                  </div>
                </div>

                <h2 className="text-3xl font-black text-[#2E0249] mb-2 tracking-tight">
                  PARABÉNS! 🎉
                </h2>
                
                <p className="text-lg font-bold text-purple-600 mb-4">
                  Você agora é nível {achievedBadge === 'diamond' ? 'DIAMANTE' : 'OURO'}!
                </p>

                <div className="bg-purple-50 rounded-2xl p-4 mb-8">
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {achievedBadge === 'diamond' ? 
                      "Incrível! Você atingiu o topo da nossa comunidade. Sua jornada de estilo é uma inspiração para todos! 💎✨" : 
                      "Uau! Você está brilhando! Seu senso de estilo evoluiu e agora você faz parte da nossa elite Gold! 🌟🚀"
                    }
                  </p>
                </div>

                <Button 
                  onClick={() => setShowAchievementModal(false)}
                  className={`w-full py-4 text-lg font-black shadow-lg ${achievedBadge === 'diamond' ? 'bg-indigo-600 shadow-indigo-200' : 'bg-yellow-500 shadow-yellow-200'}`}
                >
                  CONTINUAR BRILHANDO
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Chest Notification */}
      <AnimatePresence>
        {showChestNotification && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[100] flex justify-center px-4"
          >
            <button
              onClick={() => {
                setShowChestModal(true);
              }}
              className="bg-purple-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border-2 border-white/20 backdrop-blur-md"
            >
              <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center text-purple-900 animate-bounce">
                <Archive size={18} />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold">Seu Baú está disponível! 🎁</p>
                <p className="text-[10px] opacity-80">Toque aqui para resgatar seus 10 créditos.</p>
              </div>
              <ArrowRight size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </ErrorBoundary>
  );
};

export default App;