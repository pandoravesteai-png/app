import React from 'react';
import { Loader2 } from 'lucide-react';

// --- Logo Component ---
export const AppLogo: React.FC<{ size?: 'sm' | 'md' | 'lg', hideSlogan?: boolean }> = ({ size = 'lg', hideSlogan = false }) => {
  // Configuração para exibir a logo respeitando seu formato original.
  // 'lg': Splash Screen (Grande)
  // 'md': Login Screen (Médio)
  // 'sm': Header (Pequeno)
  
  let imgClasses = '';
  let titleSizeClass = '';
  let containerClasses = 'flex items-center justify-center w-full';
  let textContainerClasses = 'flex flex-col items-start';

  switch (size) {
    case 'lg':
      imgClasses = 'w-32 h-32 md:w-40 md:h-40 object-contain drop-shadow-2xl';
      titleSizeClass = 'text-4xl md:text-5xl';
      containerClasses = 'flex flex-col items-center justify-center w-full gap-4';
      textContainerClasses = 'flex flex-col items-center';
      break;
    case 'md':
      imgClasses = 'w-20 h-20 md:w-24 md:h-24 object-contain';
      titleSizeClass = 'text-3xl';
      containerClasses = 'flex flex-col items-center justify-center w-full gap-2';
      textContainerClasses = 'flex flex-col items-center';
      break;
    case 'sm':
    default:
      imgClasses = 'w-8 h-8 object-contain';
      titleSizeClass = 'text-xl';
      containerClasses = 'flex items-center justify-center gap-2';
      textContainerClasses = 'flex flex-col items-start';
      break;
  }

  return (
    <div className={containerClasses}>
      <img 
        src="https://i.postimg.cc/G2DYHjrv/P-(1).png" 
        alt="PANDORA AI Logo" 
        className={`${imgClasses} block animate-float`}
      />
      <div className={textContainerClasses}>
        <h1 className={`${titleSizeClass} font-black tracking-tighter flex items-center whitespace-nowrap`}>
          <span className="text-[#2E0249]">PANDORA</span>
          <span className="ml-2 bg-gradient-to-r from-[#8B2CF5] to-[#F52C99] bg-clip-text text-transparent">AI</span>
        </h1>
        {size !== 'sm' && !hideSlogan && (
          <p className="text-gray-400 text-[10px] md:text-[12px] tracking-[0.3em] mt-1 uppercase font-bold text-center">
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
            w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 text-[#2E0249] rounded-2xl
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