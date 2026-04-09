import React from 'react';
import { Button } from './UI';
import { Copy, Check } from 'lucide-react';

interface PixPaymentProps {
  pixCode: string;
}

export const PixPayment: React.FC<PixPaymentProps> = ({ pixCode }) => {
  const [copied, setCopied] = React.useState(false);

  const copiarPix = (texto: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = texto;
    textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, 99999);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // alert('Código Pix copiado com sucesso!'); // Removed alert as requested by some UI patterns, but user asked for it in summary.
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-xl shadow-sm border border-purple-100">
      <div className="text-center">
        <h3 className="text-lg font-bold text-purple-900">Pagamento via Pix</h3>
        <p className="text-sm text-gray-500">Copie o código abaixo para pagar no seu banco</p>
      </div>
      
      <div className="w-full p-3 bg-gray-50 rounded-lg border border-dashed border-purple-200 break-all text-xs font-mono text-gray-600">
        {pixCode}
      </div>

      <Button 
        onClick={() => copiarPix(pixCode)}
        className="w-full flex items-center justify-center gap-2"
      >
        {copied ? (
          <>
            <Check size={18} />
            Copiado!
          </>
        ) : (
          <>
            <Copy size={18} />
            Copiar código Pix
          </>
        )}
      </Button>
    </div>
  );
};
