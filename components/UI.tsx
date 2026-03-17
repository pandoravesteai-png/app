import React from 'react';
import { Loader2 } from 'lucide-react';

// --- Logo Component ---
export const AppLogo: React.FC<{ size?: 'sm' | 'md' | 'lg', hideSlogan?: boolean }> = ({ size = 'lg', hideSlogan = false }) => {
  // Configuração para exibir a logo respeitando seu formato original.
  // 'lg': Splash Screen (Grande)
  // 'md': Login Screen (Médio - aprox 50% do lg)
  // 'sm': Header (Pequeno)
  
  let imgClasses = '';
  let titleSizeClass = '';
  let spacingClass = '';

  switch (size) {
    case 'lg':
      imgClasses = 'w-auto h-auto max-w-full max-h-[45vh] object-contain';
      titleSizeClass = 'text-4xl';
      spacingClass = 'mb-2'; // Distância reduzida entre logo e texto (era mb-6)
      break;
    case 'md':
      imgClasses = 'w-auto h-auto max-w-full max-h-[25vh] object-contain'; // 50% menor que lg
      titleSizeClass = 'text-2xl';
      spacingClass = 'mb-0.5';
      break;
    case 'sm':
    default:
      imgClasses = 'w-10 h-10 object-contain';
      titleSizeClass = 'text-lg';
      spacingClass = 'mb-0';
      break;
  }

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <img 
        src="https://i.postimg.cc/G2DYHjrv/P-(1).png" 
        alt="PANDORA AI Logo" 
        className={`${imgClasses} block ${spacingClass}`}
      />
      <div className="flex flex-col items-center">
        <h1 className={`${titleSizeClass} font-black tracking-tighter flex items-center`}>
          <span className="text-black">PANDORA</span>
          <span className="ml-2 bg-gradient-to-r from-[#8B2CF5] to-[#F52C99] bg-clip-text text-transparent">AI</span>
        </h1>
        {size !== 'sm' && !hideSlogan && (
          <p className="text-gray-400 text-[9px] md:text-[11px] tracking-[0.25em] mt-1 uppercase font-bold text-center">
            TRANSFORME SEU ESTILO COM A I.A
          </p>
        )}
      </div>
    </div>
  );
};

// --- Button Component ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  isLoading,
  ...props 
}) => {
  const baseStyles = "w-full py-3 px-6 rounded-full font-bold transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2 text-base shadow-sm";
  
  const variants = {
    primary: "bg-gradient-to-r from-[#8B2CF5] to-[#F52C99] text-white hover:shadow-lg hover:shadow-purple-500/40",
    outline: "border-2 border-purple-200 text-purple-700 bg-transparent hover:bg-purple-50",
    ghost: "bg-transparent text-purple-600 hover:text-purple-700 text-sm font-normal py-2"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className} ${isLoading ? 'opacity-80 cursor-wait' : ''}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Loader2 className="animate-spin" size={20} />}
      {!isLoading && children}
    </button>
  );
};

// --- Input Component ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  label?: string;
}

export const Input: React.FC<InputProps> = ({ icon, label, className = '', ...props }) => {
  return (
    <div className="w-full space-y-1">
      {label && <label className="text-xs font-semibold text-gray-500 uppercase ml-1">{label}</label>}
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-purple-500 transition-colors">
          {icon}
        </div>
        <input
          className={`
            w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 rounded-2xl
            focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500
            transition-all duration-200 placeholder:text-gray-400
            ${className}
          `}
          {...props}
        />
      </div>
    </div>
  );
};