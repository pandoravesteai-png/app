import * as React from 'react';
import { useState, useEffect, useRef, Component } from 'react';
import { Screen, UserState, ClothingType, HistoryItem } from './types';
import { AppLogo, Button, Input } from './components/UI';
import { CATEGORIES, HOME_CAROUSEL_1, HOME_CAROUSEL_2 } from './constants';
import { Mail, Lock, Upload, Image as ImageIcon, Camera as CameraIcon, Check, ArrowRight, RefreshCw, Eye, Sparkles, Zap, Trash2, Download, RefreshCcw, Box, Rotate3d, Home, ArrowLeft, Plus, Wallet, Info, ShieldCheck, AlertTriangle, X, ChevronDown, ChevronUp, Pencil, Save, ExternalLink, UserX, ZoomIn, Move } from 'lucide-react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './services/firebase';
import { signOut } from 'firebase/auth';
import { generateFashionTip, generateTryOnLook, generate360View } from './services/geminiService';
import { loginWithGoogle, loginWithEmail, deleteCurrentUser } from './services/firebase';
import { getOrCreateUserCredits, deductCredit, addCredits, listenToUser, saveUserEmail } from './services/creditsService';
import { createPixPayment } from './services/paymentService';

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

// Placeholders for missing functions used in user request
const getMessagingToken = async () => {
  console.log('getMessagingToken placeholder called');
  return null; // Return null for now
};

const saveUserToken = async (userId: string, token: string) => {
  console.log('saveUserToken placeholder called', userId, token);
  try {
    await updateDoc(doc(db, 'users', userId), { fcmToken: token });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
};

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
          <h2 className="text-xl font-bold text-gray-900 mb-2">Ops! Algo deu errado.</h2>
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
        className="absolute top-6 left-6 p-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
      >
        <ArrowLeft size={24} />
      </button>

      <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mb-6 text-purple-600">
        <UserX size={40} />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Conta não encontrada</h2>
      <p className="text-gray-600 mb-8 max-w-xs">
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
const PromoCarousel: React.FC = () => {
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
        <p className="text-[10px] text-gray-600 mb-3 px-2 leading-tight">
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

        <button onClick={nextSlide} className="bg-[#6A00F4] text-white px-4 py-2 rounded-full text-xs font-bold shadow-md hover:bg-purple-700 transition-colors w-3/4">
           Quero Meu Book Agora!
        </button>
      </div>
    ),
    // Slide 5: WhatsApp
    (
      <div className="w-full h-full bg-white border-4 border-purple-500 rounded-3xl flex flex-col items-center justify-center p-4 relative overflow-hidden text-center">
        <h3 className="text-xl font-bold text-[#6A00F4] mb-2 leading-tight">Pronto para Transformar Sua Imagem?</h3>
        <p className="text-[10px] text-gray-600 mb-4 px-4 leading-tight">
           Fale com nossa equipe e garanta seu Book Profissional hoje mesmo!
        </p>
        
        <button 
          onClick={() => window.open('https://wa.me/5583987368351?text=Ol%C3%A1%2C%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20o%20BOOk%20de%20fotos%20profissionais!', '_blank')}
          className="bg-[#25D366] text-white px-5 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg hover:bg-[#20bd5a] transition-transform active:scale-95 animate-pulse mb-3 w-full justify-center max-w-xs"
        >
           <span className="text-sm">Falar com Especialista</span>
        </button>
        
        <div className="flex items-center gap-3 text-[8px] text-gray-400">
           <span className="flex items-center gap-1"><ShieldCheck size={8} /> Compra Segura</span>
           <span className="flex items-center gap-1"><Lock size={8} /> Privacidade</span>
        </div>
      </div>
    )
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000); // Increased duration for reading
    return () => clearInterval(timer);
  }, [slides.length]);

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
          <AppLogo size="lg" showText={true} />
          
          {/* Loading Bar Container */}
          <div className="w-64 h-1.5 bg-gray-100 rounded-full mt-10 overflow-hidden relative">
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
}> = ({ message, userImage, clothingImage }) => {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [scale, setScale] = useState(1.2);
  
  const messages = [
    "✨ Analisando seu corpo...",
    "🎨 Moldando a peça em você...",
    "💫 Ajustando o caimento...",
    "🚀 Finalizando seu novo look..."
  ];

  useEffect(() => {
    // Progresso da barra
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        const next = prev + Math.random() * 10;
        return Math.min(next, 100);
      });
    }, 400);

    // Troca de mensagens
    const messageInterval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % messages.length);
    }, 2000);

    // Efeito de "zoom" na roupa
    const scaleInterval = setInterval(() => {
      setScale(prev => prev === 1.2 ? 1 : 1.2);
    }, 1500);

    return () => {
      clearInterval(progressInterval);
      clearInterval(messageInterval);
      clearInterval(scaleInterval);
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
      
      {/* Container principal com as duas imagens */}
      <div style={{
        position: 'relative',
        width: '320px',
        height: '420px',
        marginBottom: '40px',
        borderRadius: '24px',
        overflow: 'hidden',
        boxShadow: '0 25px 50px rgba(0,0,0,0.3)'
      }}>
        
        {/* Foto da pessoa ao fundo (desfocada) */}
        {userImage && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 1
          }}>
            <img 
              src={userImage}
              alt="Você"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(4px) brightness(0.85)',
                opacity: 0.8
              }}
            />
            {/* Overlay gradiente */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(to bottom, rgba(102,126,234,0.15), rgba(118,75,162,0.15))'
            }} />
          </div>
        )}

        {/* Peça de roupa se moldando (animada) */}
        {clothingImage && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) scale(${scale})`,
            transition: 'transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
            zIndex: 2,
            width: '70%',
            maxWidth: '220px'
          }}>
            <img 
              src={clothingImage}
              alt="Roupa"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                filter: 'drop-shadow(0 15px 30px rgba(0,0,0,0.5))',
                borderRadius: '12px'
              }}
            />
            
            {/* Efeito de brilho passando (moldagem acontecendo) */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: '-100%',
              width: '100%',
              height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
              animation: 'scan 2s ease-in-out infinite',
              pointerEvents: 'none'
            }} />
          </div>
        )}

        {/* Ondas de energia (efeito de processamento) */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.3)',
          zIndex: 3,
          animation: 'ripple 2s ease-out infinite'
        }} />
        
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.2)',
          zIndex: 3,
          animation: 'ripple 2s ease-out 0.5s infinite'
        }} />
      </div>

      {/* Mensagem principal */}
      <h2 style={{
        color: 'white',
        fontSize: '22px',
        fontWeight: 'bold',
        marginBottom: '8px',
        textAlign: 'center',
        animation: 'fade-slide 0.5s ease-in-out',
        textShadow: '0 2px 10px rgba(0,0,0,0.3)'
      }}>
        {message || messages[messageIndex]}
      </h2>

      <p style={{
        color: 'rgba(255,255,255,0.85)',
        fontSize: '14px',
        marginBottom: '25px',
        textAlign: 'center',
        fontWeight: '500'
      }}>
        A IA está moldando a peça ao seu corpo
      </p>

      {/* Barra de progresso */}
      <div style={{
        width: '100%',
        maxWidth: '320px'
      }}>
        <div style={{
          width: '100%',
          height: '6px',
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '10px',
          overflow: 'hidden',
          marginBottom: '10px',
          position: 'relative'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
            borderRadius: '10px',
            transition: 'width 0.3s ease-out',
            boxShadow: '0 0 15px rgba(255,255,255,0.6)'
          }} />
        </div>
        
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <p style={{
            color: 'white',
            fontSize: '14px',
            fontWeight: 'bold'
          }}>
            {Math.round(progress)}% completo
          </p>
          
          <div style={{
            display: 'flex',
            gap: '4px'
          }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  width: '6px',
                  height: '6px',
                  background: 'white',
                  borderRadius: '50%',
                  animation: `bounce 1s ease-in-out ${i * 0.15}s infinite`
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <style>
        {`
          @keyframes scan {
            0% { left: -100%; }
            100% { left: 200%; }
          }

          @keyframes ripple {
            0% {
              transform: translate(-50%, -50%) scale(0.8);
              opacity: 1;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.3);
              opacity: 0;
            }
          }

          @keyframes fade-slide {
            from {
              opacity: 0;
              transform: translateY(-10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
        `}
      </style>
    </div>
  );
};

const LoginScreen: React.FC<{ 
  onLogin: (email: string, uid: string) => void; 
  onForgotPassword: () => void;
  onNoRegistration: () => void;
  setUserId: (uid: string) => void;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  setScreen: (screen: Screen) => void;
}> = ({ onLogin, onForgotPassword, onNoRegistration, setUserId, setUserState, setScreen }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    const { user, isNewUser, error: loginError } = await loginWithGoogle();
    setIsLoading(false);

    if (loginError) {
      setError("Erro ao conectar com Google.");
      return;
    }

    if (user) {
      setUserId(user.uid);
      await saveUserEmail(user.uid, user.email || '');
      
      const credits = await getOrCreateUserCredits(user.uid);
      setUserState(prev => ({ ...prev, email: user.email || '', credits }));
      setScreen(Screen.ONBOARDING);

      // Solicita permissões de notificação e instalação PWA
      const requestPermissions = async () => {
        // 1. Permissão de Notificações
        if ('Notification' in window && Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            // Registra o token FCM
            const token = await getMessagingToken();
            if (token) {
              await saveUserToken(user.uid, token);
            }
          }
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
    }
  };

  const handleEmailLogin = async () => {
    if (!email || !password) {
        setError("Por favor, preencha email e senha.");
        return;
    }
    
    setIsLoading(true);
    setError(null);
    const { user, error: loginError } = await loginWithEmail(email, password);
    setIsLoading(false);

    if (loginError) {
      setError(loginError);
      return;
    }

    if (user) {
      onLogin(user.email || email, user.uid);
    }
  };

  const handleRegister = () => {
    window.open('https://pandora-style-ai.lovable.app', '_blank');
  };

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col items-center justify-center overflow-y-auto bg-white">
      <div className="relative z-10 w-full max-w-md px-8 animate-fade-in flex flex-col items-center">
        <div className="mb-6 w-full flex justify-center">
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
          <Button onClick={handleEmailLogin} disabled={isLoading}>
            {isLoading ? 'Entrando...' : 'Entrar na Plataforma'}
          </Button>

          <button 
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-4 px-6 rounded-2xl font-semibold transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-3 text-base shadow-sm border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-70 disabled:cursor-not-allowed"
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
          
          <div className="flex justify-between items-center w-full pt-2">
            <button 
              onClick={onForgotPassword}
              className="text-purple-600 text-sm font-medium hover:text-purple-800 transition-colors"
            >
              Esqueceu a senha?
            </button>
            <button 
              onClick={handleRegister}
              className="text-purple-600 text-sm font-medium hover:text-purple-800 transition-colors"
            >
              Cadastre-se
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ForgotPasswordScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = () => {
    if (email) {
      setIsSubmitted(true);
    }
  };

  return (
    <div className="w-full min-h-screen bg-white flex flex-col animate-slide-up relative overflow-y-auto">
      <div className="px-6 pt-6 pb-2">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-8 pt-4">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Recuperar Senha</h2>
          <p className="text-gray-500">
            Digite seu email para receber as instruções de recuperação de senha.
          </p>
        </div>

        {!isSubmitted ? (
          <div className="space-y-6">
            <Input 
              icon={<Mail size={20} />} 
              type="email" 
              placeholder="seu@email.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              label="Email Cadastrado"
            />
            <Button onClick={handleSubmit}>
              Enviar Instruções
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center animate-fade-in space-y-6 mt-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-2">
              <Check size={32} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Email Enviado!</h3>
              <p className="text-gray-500">
                Verifique sua caixa de entrada em <strong>{email}</strong> para redefinir sua senha.
              </p>
            </div>
            <Button variant="outline" onClick={onBack}>
              Voltar ao Login
            </Button>
          </div>
        )}
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
    setUserId: (uid: string) => void;
    setScreen: (screen: Screen) => void;
}> = ({ userId, userState, setUserState, history, onAddCredits, onBuyCredits, onBack, onUpdateProfile, onReuse, onOpenFAQ, setUserId, setScreen }) => {
    const [editingName, setEditingName] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [newName, setNewName] = useState(userState.name || '');
    const [image, setImage] = useState<string | null>(userState.profileImage || null);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const handleSaveProfile = () => {
        onUpdateProfile(newName, image);
    };

    return (
        <div className="w-full min-h-screen bg-white flex flex-col animate-slide-up relative overflow-y-auto">
            {/* History Detail Modal */}
            {selectedHistoryItem && (
                <div className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-fade-in p-6 overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-white font-bold text-lg">Detalhes da Criação</h3>
                        <button onClick={() => setSelectedHistoryItem(null)} className="p-2 bg-white/10 rounded-full text-white">
                            <X size={24} />
                        </button>
                    </div>
                    
                    <div className="flex-1 flex flex-col gap-6">
                        <div className="w-full aspect-[3/4] rounded-2xl overflow-hidden border-2 border-purple-500 shadow-2xl bg-gray-900 relative">
                            <img src={selectedHistoryItem.generatedImage} className="w-full h-full object-cover" alt="Generated" />
                            <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white border border-white/10">
                                {new Date(selectedHistoryItem.date).toLocaleDateString()}
                            </div>
                        </div>

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
                             <button className="flex items-center justify-center gap-2 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-colors">
                                <Download size={18} /> Baixar
                             </button>
                             <button className="flex items-center justify-center gap-2 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-colors">
                                <Trash2 size={18} /> Excluir
                             </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="px-6 pt-6 pb-2">
                <button 
                    onClick={onBack}
                    className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
                >
                    <ArrowLeft size={24} />
                </button>
            </div>

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
                  
                  <div style={{
                    padding: '12px',
                    background: '#f5f5f5',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: '500',
                    color: userState.lastPlan ? '#9333ea' : '#999',
                  }}>
                    {userState.lastPlan || 'Nenhum plano comprado ainda'}
                  </div>
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
                        // Abre o link direto do Abacate Pay
                        window.open('https://pay.abacatepay.com/pandora-ai', '_blank');
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
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <RefreshCw size={18} className="text-purple-600" /> Histórico
                        </h3>
                        <span className="text-xs text-gray-400">{history.length} criações</span>
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
                                    onClick={() => setSelectedHistoryItem(item)}
                                    className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-sm border border-gray-100 group"
                                >
                                    <img src={item.generatedImage} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="History" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                        <p className="text-white text-[10px] font-bold">
                                            {new Date(item.date).toLocaleDateString()}
                                        </p>
                                        <p className="text-white/80 text-[10px]">
                                            {item.type === 'TEXT' ? 'Via Texto' : 'Via Upload'}
                                        </p>
                                    </div>
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
            </div>
        </div>
    );
};

// --- FAQ Screen ---
const FAQScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="w-full min-h-screen bg-white flex flex-col animate-slide-up relative overflow-y-auto">
      <div className="px-6 pt-6 pb-2">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-6 pt-4 pb-8 overflow-y-auto no-scrollbar">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Perguntas Frequentes</h2>
        
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


const HomeScreen: React.FC<{ 
    onUpload: (url: string) => void; 
    onContinue: () => void;
    uploadedImage?: string | null;
    userName?: string;
    credits: number;
    onOpenCredits: () => void;
    onOpenFAQ: () => void;
}> = ({ onUpload, onContinue, uploadedImage, userName = 'Usuário', credits, onOpenCredits, onOpenFAQ }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPhotoGuide, setShowPhotoGuide] = useState(false);
  const [showCreditsInfo, setShowCreditsInfo] = useState(false);

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

  const isLowCredits = credits <= 2;

  return (
    <div className="w-full h-screen bg-white flex flex-col overflow-y-auto animate-fade-in font-sans relative">
      
      {/* Modals */}
      {showPhotoGuide && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
            <button onClick={() => setShowPhotoGuide(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
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
            
            <Button onClick={() => setShowPhotoGuide(false)} className="mt-6">Entendi!</Button>
          </div>
        </div>
      )}

      {showCreditsInfo && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative text-center">
            <button onClick={() => setShowCreditsInfo(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 text-purple-600">
              <Zap size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Sistema de Créditos</h3>
            <p className="text-gray-600 text-sm mb-6">
              Cada geração de look consome 1 crédito. Você pode recarregar seus créditos a qualquer momento para continuar transformando seu estilo!
            </p>
            <Button onClick={() => { setShowCreditsInfo(false); onOpenCredits(); }}>
              Gerenciar Créditos
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="w-full h-16 bg-white flex items-center justify-between px-6 sticky top-0 z-50 border-b border-gray-50/50 backdrop-blur-sm bg-white/95">
        <div className="flex items-center gap-2.5">
          <img 
            src="https://i.postimg.cc/G2DYHjrv/P-(1).png" 
            alt="Logo" 
            className="w-7 h-7 object-contain" 
          />
          <span className="text-lg font-semibold text-[#2E0249] tracking-tight font-['Inter']">
            Pandora AI
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <div 
            onClick={() => setShowCreditsInfo(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${isLowCredits ? 'bg-red-50 border-red-200 text-red-600' : 'bg-purple-50 border-purple-100 text-purple-700'}`}
          >
            <span className="text-xs font-bold">{credits} Créditos</span>
            {isLowCredits && <AlertTriangle size={12} />}
          </div>
          <button 
            onClick={onOpenCredits}
            className="w-8 h-8 rounded-full bg-[#6A00F4] text-white flex items-center justify-center shadow-md hover:bg-[#5800cc] transition-colors active:scale-95"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-6 space-y-6">
        {credits <= 5 && (() => {
          let config = null;
          
          if (credits === 0) {
            config = {
              gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              emoji: '🚫',
              title: 'Seus créditos acabaram',
              subtitle: 'Você está perdendo looks incríveis agora. Cada dia sem o Pandora AI é um dia com o guarda-roupa errado.',
              btn: '✨ Quero meus looks agora',
              pulse: true,
            };
          } else if (credits <= 2) {
            config = {
              gradient: 'linear-gradient(135deg, #c94b4b 0%, #4b134f 100%)',
              emoji: '🔥',
              title: `Só ${credits} crédito${credits > 1 ? 's' : ''} restante${credits > 1 ? 's' : ''}!`,
              subtitle: 'Não deixe a inspiração parar na hora errada. Recarregue antes que acabe!',
              btn: '🛍️ Recarregar agora',
              pulse: true,
            };
          } else {
            config = {
              gradient: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
              emoji: '⚡',
              title: `${credits} créditos restantes`,
              subtitle: 'Está acabando! Garanta mais créditos e continue se reinventando todo dia.',
              btn: '+ Recarregar',
              pulse: false,
            };
          }

          return (
            <div
              onClick={onOpenCredits}
              className="mx-6 mt-4 p-4 rounded-2xl shadow-lg cursor-pointer flex flex-col sm:flex-row items-center gap-4 sm:justify-between transition-all active:scale-[0.98]"
              style={{
                background: config.gradient,
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                animation: config.pulse ? 'pulse 1.5s infinite' : 'none',
              }}>
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <span className="text-3xl shrink-0">{config.emoji}</span>
                <div className="flex-1">
                  <p className="text-white font-bold text-base sm:text-lg leading-tight">
                    {config.title}
                  </p>
                  <p className="text-white/90 text-xs sm:text-sm mt-1 leading-relaxed">
                    {config.subtitle}
                  </p>
                </div>
              </div>
              <button
                className="w-full sm:w-auto bg-white text-[#9333ea] px-4 py-2 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap shadow-sm"
              >
                {config.btn}
              </button>
            </div>
          );
        })()}

        <div className="px-6 mt-4">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">
            Olá, {userName}!
          </h1>
          <p className="text-sm text-gray-500 mt-1.5 font-light">
            Experimente novos estilos com inteligência artificial
          </p>
        </div>

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
            <h2 className="text-2xl font-bold text-gray-900 leading-tight">
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
              <button onClick={() => setShowPhotoGuide(true)} className="text-purple-600 flex items-center gap-1 text-[10px] font-bold uppercase hover:underline">
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
                    <p className="font-bold text-gray-800 text-sm">Começar a Transformação</p>
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
           <PromoCarousel />
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
    </div>
  );
};

const CategoryScreen: React.FC<{ onSelect: (id: string) => void; onBack: () => void }> = ({ onSelect, onBack }) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const handleContinue = () => {
    if (selectedCategory) {
      onSelect(selectedCategory);
    }
  };

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col animate-fade-in overflow-hidden relative">
      <div className="pt-12 px-6 pb-6 bg-white z-20 shadow-sm shrink-0 flex flex-col items-center relative">
        <button 
           onClick={onBack}
           className="absolute top-8 left-6 p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
        >
           <ArrowLeft size={24} />
        </button>
        <div className="mb-4 transform scale-125"> 
            <img src="https://i.postimg.cc/G2DYHjrv/P-(1).png" alt="Logo" className="w-14 h-14 object-contain" />
        </div>
        <div className="text-center px-4">
            <h2 className="text-xl font-bold text-gray-900 leading-relaxed">Escolha o que deseja experimentar</h2>
        </div>
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
}> = ({ category, userImage, onGenerate, onRestart, onBack, loading }) => {
  const [clothingImage, setClothingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getScreenTexts = (categoryId: string) => {
    switch (categoryId) {
      case 'blusa': return { title: <>A blusa do <span className="text-[#6A00F4]">look</span>.</>, subtitle: "Personalize os detalhes.", label: "FOTO DA BLUSA", placeholder: "Arraste ou selecione a imagem da peça (ex: uma camisa neutra)" };
      case 'calca': return { title: <>A calça do <span className="text-[#6A00F4]">look</span>.</>, subtitle: "Personalize os detalhes.", label: "FOTO DA CALÇA", placeholder: "Arraste ou selecione a imagem da peça (ex: uma calça jeans)" };
      case 'short': return { title: <>O short/bermuda do <span className="text-[#6A00F4]">look</span>.</>, subtitle: "Personalize os detalhes.", label: "FOTO DO SHORT/BERMUDA", placeholder: "Arraste ou selecione a imagem da peça" };
      case 'saia': return { title: "Qual vestido vai te fazer apaixonar?", subtitle: "Envie a foto e deixe a mágica acontecer.", label: "FOTO DA SAIA/VESTIDO", placeholder: "Arraste ou selecione a imagem da peça" };
      case 'sapatos': return { title: "Qual sapato vai te fazer apaixonar?", subtitle: "Envie a foto e deixe a mágica acontecer.", label: "FOTO DO SAPATO", placeholder: "Arraste ou selecione a imagem da peça" };
      case 'looks': return { title: "Qual look vai te deixar mais estiloso?", subtitle: "Envie a foto e deixe a mágica acontecer.", label: "FOTO DO LOOK COMPLETO", placeholder: "Arraste ou selecione a imagem do look completo" };
      default: return { title: <>A peça do <span className="text-[#6A00F4]">look</span>.</>, subtitle: "Personalize os detalhes.", label: "FOTO DA PEÇA", placeholder: "Arraste ou selecione a imagem da peça" };
    }
  };

  const texts = getScreenTexts(category);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      setClothingImage(url);
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleCreate = () => {
    if (!clothingImage) { triggerUpload(); return; }
    onGenerate(clothingImage);
  };

  return (
    <div className="w-full h-full bg-white flex flex-col relative animate-slide-up overflow-hidden">
      <div className="px-6 pt-6 pb-2 shrink-0">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
      </div>

      <div className="flex-1 px-6 flex flex-col pt-4 overflow-y-auto no-scrollbar">
        <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 leading-tight">{texts.title}</h2>
            <p className="text-sm text-gray-500 mt-2 font-medium">{texts.subtitle}</p>
        </div>

        <div className="flex flex-col gap-2 w-full">
             <span className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left pl-1">{texts.label}</span>
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
                        <div className="space-y-1 text-center"><p className="font-medium text-gray-800 text-sm">{texts.placeholder}</p><p className="text-[10px] text-gray-400">Formatos JPG, PNG ou WEBP</p></div>
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

        {/* Recommendation Section */}
        <div className="mt-6 bg-purple-50 border border-purple-100 rounded-2xl p-4 flex gap-3 items-start">
            <div className="bg-white p-1.5 rounded-full shadow-sm text-purple-600 mt-0.5">
                <Sparkles size={14} />
            </div>
            <div>
                <h4 className="text-xs font-bold text-purple-800 uppercase mb-1">Dica para um resultado perfeito</h4>
                <p className="text-[11px] text-purple-700 leading-relaxed">
                    Envie uma imagem da peça sozinha (sem ninguém vestindo), com boa iluminação e fundo neutro (preferencialmente branco ou cor sólida). Isso ajuda a IA a identificar os detalhes com precisão.
                </p>
            </div>
        </div>

        <div className="flex-1 flex flex-col justify-end mt-4 mb-2">
           <PromoCarousel />
        </div>
      </div>

      <div className="p-8 bg-white border-t border-gray-100 rounded-t-[30px] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] w-full sticky bottom-0 z-30">
        <div className="flex flex-col gap-3">
            <Button onClick={handleCreate} isLoading={loading}>Criar meu Look Agora!</Button>
            <Button variant="ghost" onClick={onRestart} disabled={loading}>Escolher outra categoria</Button>
        </div>
      </div>
    </div>
  );
};

// --- View 360 Input Screen ---
const View360Screen: React.FC<{ 
  userImage: string | null; 
  onGenerate360: (side: string, back: string) => void; 
  onBack: () => void;
}> = ({ userImage, onGenerate360, onBack }) => {
  const [sideImage, setSideImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  
  const sideInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setFunc: React.Dispatch<React.SetStateAction<string | null>>) => {
    if (e.target.files && e.target.files[0]) {
      setFunc(URL.createObjectURL(e.target.files[0]));
    }
  };

  const isReady = sideImage && backImage;

  return (
    <div className="w-full min-h-screen bg-white flex flex-col animate-slide-up pb-8 relative overflow-y-auto">
       {/* Header with Back Button */}
       <div className="px-6 pt-6 pb-2">
            <button 
                onClick={onBack}
                className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
            >
                <ArrowLeft size={24} />
            </button>
       </div>

       <div className="px-6 pb-4 text-center">
        <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-purple-100">
           <Rotate3d size={14} /> MODO 360°
        </div>
        <h1 className="text-xl font-bold text-gray-900 leading-tight">
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
               <p className="font-bold text-gray-800 text-sm">Foto de Frente</p>
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
                <p className="font-bold text-gray-800 text-sm">Foto de Lado</p>
                <p className="text-xs text-gray-400">{sideImage ? 'Clique para alterar' : 'Toque para adicionar'}</p>
             </div>
         </div>

         {/* Upload Costas */}
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
                <p className="font-bold text-gray-800 text-sm">Foto de Costas</p>
                <p className="text-xs text-gray-400">{backImage ? 'Clique para alterar' : 'Toque para adicionar'}</p>
             </div>
         </div>
      </div>

      <div className="p-8 bg-white border-t border-gray-100 rounded-t-[30px] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] w-full sticky bottom-0 z-30">
        <Button 
           variant="primary" 
           disabled={!isReady} 
           onClick={() => isReady && onGenerate360(sideImage!, backImage!)}
           className={!isReady ? 'opacity-50 grayscale' : ''}
        >
            Gerar 360
        </Button>
      </div>
    </div>
  );
};

// --- Result 360 Screen ---
const Result360Screen: React.FC<{ 
  images: string[] | null; 
  onRestart: () => void;
  onBack: () => void;
}> = ({ images, onRestart, onBack }) => {
   
   const handleDownloadAll = () => {
     images?.forEach((img, idx) => {
        const link = document.createElement('a');
        link.href = img;
        link.download = `pandora-look-360-${idx}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
     });
   };

   return (
     <div className="w-full h-full min-h-screen bg-white flex flex-col animate-fade-in overflow-y-auto">
        {/* Header Fixed */}
        <div className="px-6 pt-6 pb-4 bg-white z-10 flex items-center gap-4 shadow-sm shrink-0">
          <button 
             onClick={onBack}
             className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
          >
             <ArrowLeft size={24} />
          </button>
          <div className="flex-1 text-center pr-8">
             <h1 className="text-xl font-bold text-gray-900 leading-tight">Look 360°</h1>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-12 space-y-6 pt-6">
           {images && images.map((img, idx) => (
             <div key={idx} className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden shadow-lg border-4 border-white bg-gray-100">
                <img src={img} className="w-full h-full object-cover" alt={`Ângulo ${idx}`} />
                <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded font-bold">
                   {idx === 0 ? "FRENTE" : idx === 1 ? "LADO" : "COSTAS"}
                </div>
             </div>
           ))}

           {/* Buttons at the end of scroll */}
           <div className="space-y-3 pt-6 pb-8">
              <Button onClick={handleDownloadAll}>
                  <Download size={18} /> Baixar Todas as Imagens
              </Button>
              <Button variant="outline" onClick={onRestart}>
                  <Home size={18} /> Voltar para o início
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
}> = ({ userImage, clothingImage, generatedImage, onRestart, onView360, onBack }) => {
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [touchStartDist, setTouchStartDist] = useState<number | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'original' | '9/16' | '1/1' | '4/5'>('original');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (zoomLevel === 1) setPan({ x: 0, y: 0 });
  }, [zoomLevel]);

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
  
  const handleDownload = async () => {
    if (!generatedImage || !containerRef.current) return;

    // If original and no zoom/pan, just download the file directly
    if (aspectRatio === 'original' && zoomLevel === 1 && pan.x === 0 && pan.y === 0) {
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `pandora-look-original-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = generatedImage;
    
    await new Promise((resolve) => {
        img.onload = resolve;
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

    // Fill background white
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate scaling to fit image into canvas (cover)
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
    
    // Draw image centered
    ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();

    // Add Watermark
    ctx.font = `bold ${Math.max(20, canvas.width * 0.02)}px Inter, sans-serif`;
    ctx.fillStyle = "rgba(106, 0, 244, 0.8)"; // Purple
    ctx.textAlign = "right";
    ctx.fillText("PANDORA AI", canvas.width - (canvas.width * 0.02), canvas.height - (canvas.height * 0.02));

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `pandora-look-${aspectRatio.replace('/', '-')}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getAspectRatioClass = () => {
    switch (aspectRatio) {
        case '9/16': return 'aspect-[9/16]';
        case '1/1': return 'aspect-square';
        case '4/5': return 'aspect-[4/5]';
        default: return 'aspect-[3/4]'; // Default display for original, assuming portrait
    }
  };

  return (
    <div className="w-full h-full min-h-screen bg-white flex flex-col animate-fade-in overflow-y-auto relative">
      {/* Image Modal */}
      {showImageModal && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setShowImageModal(null)}>
           <img src={showImageModal} className="max-w-full max-h-full rounded-lg" alt="Preview" />
           <button className="absolute top-4 right-4 text-white p-2 bg-white/20 rounded-full backdrop-blur-md">
             <X size={24} />
           </button>
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-8 pb-4 text-center flex-shrink-0 bg-white z-10 relative">
        <button 
            onClick={onBack}
            className="absolute top-8 left-6 p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
        >
            <ArrowLeft size={24} />
        </button>
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
                <button onClick={() => setAspectRatio('original')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aspectRatio === 'original' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Original</button>
                <button onClick={() => setAspectRatio('4/5')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aspectRatio === '4/5' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Instagram</button>
                <button onClick={() => setAspectRatio('9/16')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aspectRatio === '9/16' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Storys</button>
                <button onClick={() => setAspectRatio('1/1')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${aspectRatio === '1/1' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Square</button>
            </div>

            {/* Generated Image */}
            <div 
                ref={containerRef}
                className={`w-full ${getAspectRatioClass()} rounded-2xl overflow-hidden shadow-2xl border-4 border-[#6A00F4] relative bg-gray-100 mb-0 flex-shrink-0 group touch-none transition-all duration-300`}
            >
                <div 
                    className="w-full h-full overflow-hidden relative cursor-move"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleMouseUp}
                    onWheel={(e) => {
                        const delta = e.deltaY * -0.001;
                        setZoomLevel(prev => Math.min(Math.max(prev + delta, 1), 4));
                    }}
                >
                    {generatedImage ? (
                        <img 
                            src={generatedImage} 
                            alt="Look Gerado" 
                            className="w-full h-full object-cover transition-transform duration-75 ease-linear" 
                            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`, transformOrigin: 'center center' }}
                            draggable={false}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                        Erro ao gerar imagem
                        </div>
                    )}
                </div>

                {/* Zoom Hint Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10">
                    <div className="bg-black/40 backdrop-blur-md text-white px-4 py-2 rounded-full text-[10px] font-medium flex items-center gap-2 animate-pulse">
                        <ZoomIn size={12} /> Use o scroll ou pinça para zoom
                    </div>
                </div>

                {/* Mobile Hint */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none sm:hidden z-10">
                    <div className="bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-[8px] font-medium flex items-center gap-2 whitespace-nowrap">
                        <Move size={10} /> Arraste e use dois dedos para zoom
                    </div>
                </div>

                {/* Badges on Image */}
                <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-bold text-purple-600 shadow-sm flex items-center gap-1 z-20">
                    PANDORA AI <Sparkles size={10} />
                </div>
                
                <button 
                    onClick={onView360}
                    className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full text-xs font-bold text-gray-900 shadow-sm flex items-center gap-2 hover:bg-white transition-colors active:scale-95 transform hover:scale-105 z-20"
                >
                    <Rotate3d size={14} /> Veja 360
                </button>
            </div>

            <p className="text-[10px] text-purple-500 font-medium -mt-4 animate-pulse flex items-center gap-1">
               <Sparkles size={10} /> Dica: Use o scroll ou pinça para dar zoom e arraste para ajustar.
            </p>

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
                <Button onClick={onRestart} variant="outline" className="border-purple-200 text-purple-700 hover:bg-purple-50">
                    <RefreshCcw size={18} /> Trocar peça
                </Button>
            </div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const paidUserId = params.get('userId');
    const credits = parseInt(params.get('credits') || '0');
    
    if (payment === 'success' && paidUserId && credits > 0) {
      addCredits(paidUserId, credits).then(() => {
        window.history.replaceState({}, '', '/');
        alert(`✅ ${credits} créditos adicionados!`);
      });
    }
  }, []);

  const [screen, setScreen] = useState<Screen>(Screen.SPLASH); 
  const [previousScreen, setPreviousScreen] = useState<Screen | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>("A IA está criando o seu look...");
  const [userId, setUserId] = useState<string>('');

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
    generatedImage: null,
    generated360Images: null,
    credits: 0,
    history: [],
    lastPlan: null
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const paidUserId = params.get('userId');
    const credits = parseInt(params.get('credits') || '0');
    
    if (payment === 'success' && paidUserId && credits > 0) {
      addCredits(paidUserId, credits).then(() => {
        window.history.replaceState({}, '', '/');
        alert(`✅ ${credits} créditos adicionados!`);
      });
    }
  }, []);

  const getUserName = () => {
    if (userState.name) return userState.name;
    if (!userState.email) return 'Usuário';
    const namePart = userState.email.split('@')[0];
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
  };


  useEffect(() => {
    if (!userId) return;
    const unsubscribe = listenToUser(userId, (data) => {
      setUserState(prev => ({ 
        ...prev, 
        credits: data.credits || 0,
        name: data.name || prev.name,
        lastPlan: data.lastPlan || null
      }));
    });
    return () => unsubscribe();
  }, [userId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const paidUserId = params.get('userId');
    const credits = parseInt(params.get('credits') || '0');
    
    if (payment === 'success' && paidUserId && credits > 0) {
      addCredits(paidUserId, credits).then(() => {
        window.history.replaceState({}, '', '/');
      });
    }
  }, []);

  const handleSplashFinish = () => {
    setScreen(Screen.LOGIN);
  };

  const handleLogin = async (email: string, uid: string) => {
    setUserId(uid);
    
    await saveUserEmail(uid, email);
    
    try {
      const data = await getDoc(doc(db, 'users', uid));
      const userData = data.exists() ? data.data() : { credits: 1 };
      setUserState(prev => ({ 
        ...prev, 
        email, 
        credits: userData.credits || 0,
        name: userData.name || '',
        lastPlan: userData.lastPlan || null
      }));
      setScreen(Screen.ONBOARDING);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    }

    // Solicita permissões de notificação e instalação PWA
    const requestPermissions = async () => {
      // 1. Permissão de Notificações
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          // Registra o token FCM
          const token = await getMessagingToken();
          if (token) {
            await saveUserToken(uid, token);
          }
        }
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

  const handleBuyCredits = async (plan: '20' | '30') => {
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

  const addToHistory = (item: HistoryItem) => {
    setUserState(prev => ({
        ...prev,
        history: [item, ...prev.history]
    }));
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
        setScreen(Screen.ONBOARDING);
    }
    setPreviousScreen(null);
  };

  const handleGenerateLook = async (clothingImageUrl: string) => {
    // Verifica se tem créditos ANTES de gerar
    if (userState.credits <= 0) {
      alert('❌ Você não tem créditos! Recarregue agora para continuar criando looks incríveis.');
      setScreen(Screen.CREDITS);
      return;
    }

    // Desconta 1 crédito ANTES de gerar
    const ok = await deductCredit(userId);
    if (!ok) {
      alert('Erro ao processar. Tente novamente.');
      setScreen(Screen.CREDITS);
      return;
    }

    // Agora sim gera a imagem
    setLoadingMessage("A IA está criando o seu look...");
    setUserState(prev => ({ ...prev, clothingImage: clothingImageUrl }));
    setScreen(Screen.LOADING);

    // Convert blob URLs to Base64
    const userBase64 = userState.uploadedImage ? await urlToBase64(userState.uploadedImage) : "";
    const clothingBase64 = await urlToBase64(clothingImageUrl);

    if (userBase64 && clothingBase64) {
      const resultImage = await generateTryOnLook(userBase64, clothingBase64, userState.selectedCategory || "clothes");
      
      addToHistory({
        id: Date.now().toString(),
        date: new Date().toISOString(),
        generatedImage: resultImage,
        userImage: userState.uploadedImage!,
        clothingImage: clothingImageUrl,
        type: 'UPLOAD'
      });

      setUserState(prev => ({ ...prev, generatedImage: resultImage }));
      setScreen(Screen.RESULT);
    } else {
      setScreen(Screen.FINALIZE); // Go back if error
    }
  };

  const handleView360 = () => {
    setScreen(Screen.VIEW_360);
  };

  const handleGenerate360 = async (sideImgUrl: string, backImgUrl: string) => {
     setLoadingMessage("Gerando visualização 360°...");
     setUserState(prev => ({ ...prev, sideImage: sideImgUrl, backImage: backImgUrl }));
     setScreen(Screen.LOADING);
     
     // Preparar Base64 para as 3 imagens
     const frontB64 = userState.uploadedImage ? await urlToBase64(userState.uploadedImage) : "";
     const sideB64 = await urlToBase64(sideImgUrl);
     const backB64 = await urlToBase64(backImgUrl);
     const clothingB64 = userState.clothingImage ? await urlToBase64(userState.clothingImage) : "";

     if (frontB64 && sideB64 && backB64 && clothingB64) {
        const results = await generate360View(frontB64, sideB64, backB64, clothingB64, userState.selectedCategory || "clothes");
        setUserState(prev => ({ ...prev, generated360Images: results }));
        setScreen(Screen.RESULT_360);
     } else {
        setScreen(Screen.VIEW_360); // Error fallback
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
      setScreen(Screen.ONBOARDING);
  };

  const renderScreen = () => {
    switch (screen) {
      case Screen.SPLASH:
        return <SplashScreen onFinish={handleSplashFinish} />;
      case Screen.LOGIN:
        return (
          <LoginScreen 
            onLogin={handleLogin} 
            onForgotPassword={() => setScreen(Screen.FORGOT_PASSWORD)} 
            onNoRegistration={() => setScreen(Screen.NO_REGISTRATION)}
            setUserId={setUserId}
            setUserState={setUserState}
            setScreen={setScreen}
          />
        );
      case Screen.NO_REGISTRATION:
        return <NoRegistrationScreen onBack={() => setScreen(Screen.LOGIN)} />;
      case Screen.FORGOT_PASSWORD:
        return <ForgotPasswordScreen onBack={() => setScreen(Screen.LOGIN)} />;
      case Screen.ONBOARDING:
        return (
          <HomeScreen 
             onUpload={handleHomeUpload} 
             onContinue={handleConfirmUpload}
             uploadedImage={userState.uploadedImage}
             userName={getUserName()} 
             credits={userState.credits}
             onOpenCredits={handleOpenCredits}
             onOpenFAQ={handleOpenFAQ}
          />
        );
      case Screen.FAQ:
        return <FAQScreen onBack={handleBackFromFAQ} />;
      case Screen.UPLOAD:
        return (
           <HomeScreen 
             onUpload={handleHomeUpload} 
             onContinue={handleConfirmUpload}
             uploadedImage={userState.uploadedImage}
             userName={getUserName()} 
             credits={userState.credits}
             onOpenCredits={handleOpenCredits}
             onOpenFAQ={handleOpenFAQ}
           />
        ); 
      case Screen.CREDITS:
        return (
            <ProfileScreen 
                userId={userId}
                userState={userState}
                setUserState={setUserState}
                history={userState.history}
                onAddCredits={handleAddCredits}
                onBuyCredits={handleBuyCredits}
                onBack={handleBackToHome}
                onUpdateProfile={handleUpdateProfile}
                onReuse={handleReuseHistoryItem}
                onOpenFAQ={handleOpenFAQ}
                setUserId={setUserId}
                setScreen={setScreen}
            />
        );
      case Screen.CATEGORY:
        return <CategoryScreen onSelect={handleCategorySelect} onBack={() => setScreen(Screen.ONBOARDING)} />;
      case Screen.FINALIZE:
        return (
          <FinalizeScreen 
            category={userState.selectedCategory!} 
            userImage={userState.uploadedImage}
            onGenerate={handleGenerateLook}
            onRestart={handleRestart}
            onBack={() => setScreen(Screen.CATEGORY)}
            loading={false}
          />
        );
      case Screen.LOADING:
        return (
          <LoadingScreen 
            message={loadingMessage} 
            userImage={userState.uploadedImage}
            clothingImage={userState.clothingImage}
          />
        );
      case Screen.RESULT:
        return (
          <ResultScreen 
            userImage={userState.uploadedImage}
            clothingImage={userState.clothingImage}
            generatedImage={userState.generatedImage}
            onRestart={handleRestart}
            onView360={handleView360}
            onBack={() => setScreen(Screen.CATEGORY)}
          />
        );
      case Screen.VIEW_360:
         return (
           <View360Screen 
             userImage={userState.uploadedImage}
             onGenerate360={handleGenerate360}
             onBack={() => setScreen(Screen.RESULT)}
           />
         );
      case Screen.RESULT_360:
         return (
           <Result360Screen 
             images={userState.generated360Images}
             onRestart={handleRestart}
             onBack={() => setScreen(Screen.VIEW_360)}
           />
         );
      default:
        return (
          <LoginScreen 
            onLogin={handleLogin} 
            onForgotPassword={() => setScreen(Screen.FORGOT_PASSWORD)} 
            onNoRegistration={() => setScreen(Screen.NO_REGISTRATION)}
            setUserId={setUserId}
            setUserState={setUserState}
            setScreen={setScreen}
          />
        );
    }
  };

  return (
    <ErrorBoundary>
      <div className="w-full h-[100dvh] max-w-lg mx-auto bg-white shadow-2xl overflow-hidden relative font-sans text-gray-900 flex flex-col">
        {renderScreen()}
      </div>
    </ErrorBoundary>
  );
};

export default App;