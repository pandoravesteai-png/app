import { GoogleGenAI } from "@google/genai";

// Initialize Gemini AI
const getAiClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.warn("API Key not found.");
        return null;
    }
    return new GoogleGenAI({ apiKey });
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callGeminiWithRetry(fn: () => Promise<any>, maxRetries = 3): Promise<any> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isQuotaError = error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED");
      if (isQuotaError && i < maxRetries - 1) {
        const waitTime = Math.pow(2, i) * 1000 + Math.random() * 1000;
        console.warn(`Gemini Quota exceeded. Retrying in ${Math.round(waitTime)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const generateFashionTip = async (prompt: string): Promise<string> => {
  const ai = getAiClient();
  
  if (!ai) {
    return "A moda é sobre expressar quem você é. Sinta-se confiante com suas escolhas!";
  }

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Você é um assistente de moda especialista da Pandora AI. Responda de forma curta, estilosa e encorajadora em português. Pergunta: ${prompt}`,
    }));
    
    return response.text || "Experimente combinar cores vibrantes com acessórios minimalistas para um look moderno.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "A moda é sobre conforto e confiança. Arrase com seu look!";
  }
};

export const extractStyleTags = async (imageBase64: string): Promise<string[]> => {
  const ai = getAiClient();
  if (!ai) return [];

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: imageBase64.split(',')[1] || imageBase64
          }
        },
        {
          text: "Analise esta peça de roupa e retorne apenas 3 a 5 palavras-chave de estilo, cor ou material separadas por vírgula. Exemplo: Linho, Minimalista, Tons Pastéis, Verão. Retorne apenas as palavras."
        }
      ]
    }));

    const text = response.text || "";
    return text.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  } catch (error) {
    console.error("Error extracting style tags:", error);
    return ["Estilo", "Moda", "Tendência"]; // Fallback tags
  }
};

export const generateCompliment = async (clothingImageBase64: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "Você tem um ótimo gosto para moda!";

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: clothingImageBase64.split(',')[1] || clothingImageBase64
          }
        },
        {
          text: "Analise esta peça de roupa. Identifique se é masculina, feminina ou unissex e qual é a peça. Em seguida, gere um elogio curto, criativo e entusiasmado em português (máximo 15 palavras) sobre o estilo da peça. FOCO APENAS NA ROUPA. Não mencione o corpo ou o rosto do usuário. Não use sempre as mesmas palavras, seja variado e estiloso. Retorne apenas o elogio."
        }
      ]
    }));

    return response.text || "Essa peça é incrível e combina perfeitamente com seu estilo!";
  } catch (error) {
    console.error("Error generating compliment:", error);
    return "Você tem um ótimo gosto para moda!";
  }
};

import { functions, httpsCallable } from './firebase';

const STRICT_SYSTEM_PROMPT = `
You are a professional virtual try-on AI.
Apply the clothing item to the person in the image.

CRITICAL RULES - MUST FOLLOW:
1. ABSOLUTELY NO MODIFICATIONS TO THE FACE, HEAD, HAIR, OR FACIAL FEATURES.
2. PRESERVE the person's exact identity, skin tone, and appearance 100%.
3. PRESERVE the person's exact body shape, size, and type.
4. PRESERVE the person's height and proportions.
5. ALWAYS generate a FULL BODY photo, from head to toe. Ensure the feet and shoes are fully visible and NOT cut off.
6. The clothing must ADAPT to the person's body, NOT the body adapting to the clothing.
7. Make the clothing fit naturally on their real body.
8. Keep the background exactly the same.
9. Result must look like a real photo, photorealistic.
`;

export const generateTryOnLook = async (
  userImageBase64: string,
  clothingImageBase64: string,
  category: string
): Promise<string | null> => {
  try {
    console.log('🚀 [Try-On] Preparando chamada para Cloud Function...');
    console.log('DEBUG [geminiService] generateTryOnLook args:', {
      userImageLen: userImageBase64?.length,
      clothingImageLen: clothingImageBase64?.length,
      userImageType: typeof userImageBase64,
      clothingImageType: typeof clothingImageBase64,
      category
    });

    if (!userImageBase64 || userImageBase64.length < 100) {
      console.error('❌ [Try-On] Imagem do usuário inválida ou muito curta:', userImageBase64?.length);
      throw new Error("A sua foto é obrigatória e não foi processada corretamente.");
    }

    if (!clothingImageBase64 || clothingImageBase64.length < 100) {
      console.error('❌ [Try-On] Imagem da roupa inválida ou muito curta:', clothingImageBase64?.length);
      throw new Error("A imagem da roupa é obrigatória e não foi processada corretamente.");
    }

    const gerarTryOn = httpsCallable(functions, 'gerarTryOn', { timeout: 180000 }); // Aumentado para 180s (3 min)
    
    console.log('📤 [Try-On] Chamando Cloud Function com:', {
      userLen: userImageBase64.length,
      clothingLen: clothingImageBase64.length,
      category
    });

    const result = await gerarTryOn({
      urlFotoCliente: userImageBase64,
      urlFotoRoupa: clothingImageBase64,
      category: category,
      prompt: STRICT_SYSTEM_PROMPT
    });
    
    const data = result.data as any;
    
    if (data.sucesso && data.imagemGerada) {
      return data.imagemGerada;
    }
    
    console.error('Erro Try-On (Data):', data);
    throw new Error(data.erro || 'Não foi possível aplicar a roupa. Verifique se a pessoa e a peça estão bem visíveis.');
    
  } catch (error: any) {
    console.error('Erro no Try-On (Catch):', error);
    // Repassa o erro original para que o App.tsx possa tratar (ex: quota, timeout)
    throw error;
  }
};

export const generate360View = async (
  frontImageB64: string | null,
  sideImageB64: string,
  backImageB64: string,
  clothingImageB64: string,
  category: string,
  clothingBackImageB64: string | null = null
): Promise<string[]> => {
  try {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { app } = await import('./firebase');
    
    const functions = getFunctions(app, 'us-central1');
    const gerar360View = httpsCallable(functions, 'gerar360View', { timeout: 300000 }); // 300s
    
    const result = await gerar360View({
      frontImageB64,
      sideImageB64,
      backImageB64,
      clothingImageB64,
      category,
      clothingBackImageB64
    });
    
    const data = result.data as any;
    
    if (data.sucesso && data.imagens) {
      return data.imagens;
    }
    
    console.error('Erro 360 View (Data):', data);
    throw new Error(data.erro || 'Erro no processamento do 360 View');
    
  } catch (error: any) {
    console.error("360 View Error:", error);
    throw new Error(
      error.message || "Erro ao gerar view 360°"
    );
  }
};
