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

export const generateFashionTip = async (prompt: string): Promise<string> => {
  const ai = getAiClient();
  
  if (!ai) {
    return "A moda é sobre expressar quem você é. Sinta-se confiante com suas escolhas!";
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Você é um assistente de moda especialista da Pandora AI. Responda de forma curta, estilosa e encorajadora em português. Pergunta: ${prompt}`,
    });
    
    return response.text || "Experimente combinar cores vibrantes com acessórios minimalistas para um look moderno.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "A moda é sobre conforto e confiança. Arrase com seu look!";
  }
};

const STRICT_SYSTEM_PROMPT = `
You are a professional virtual try-on AI.
Apply the clothing item to the person in the image.

CRITICAL RULES - MUST FOLLOW:
1. PRESERVE the person's exact body shape and size
2. PRESERVE body type: if person is thin, keep thin. 
   If person is heavy, keep heavy. NO changes to body.
3. PRESERVE the person's face, skin tone, hair exactly
4. PRESERVE the person's height and proportions
5. ALWAYS generate a FULL BODY photo, from head to toe. Ensure the feet and shoes are fully visible and NOT cut off.
6. The clothing must ADAPT to the person's body,
   NOT the body adapting to the clothing
7. Make the clothing fit naturally on their real body
8. Keep background exactly the same
9. Result must look like a real photo, photorealistic
`;

export const generateTryOnLook = async (
  userImageBase64: string,
  clothingImageBase64: string,
  category: string
): Promise<string | null> => {
  try {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { app } = await import('./firebase');
    
    const functions = getFunctions(app, 'us-central1');
    const gerarTryOn = httpsCallable(functions, 'gerarTryOn', { timeout: 120000 }); // 120s
    
    const result = await gerarTryOn({
      urlFotoCliente: userImageBase64,
      urlFotoRoupa: clothingImageBase64,
    });
    
    const data = result.data as any;
    
    if (data.sucesso && data.imagemGerada) {
      return data.imagemGerada;
    }
    
    console.error('Erro Try-On:', data.erro);
    return null;
    
  } catch (error) {
    console.error('Erro no Try-On:', error);
    return null;
  }
};

export const generate360View = async (
  frontImageB64: string | null,
  sideImageB64: string,
  backImageB64: string,
  clothingImageB64: string,
  category: string
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
      clothingImageB64
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
