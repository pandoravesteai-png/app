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
      model: 'gemini-3-flash-preview',
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
5. The clothing must ADAPT to the person's body,
   NOT the body adapting to the clothing
6. Make the clothing fit naturally on their real body
7. Keep background exactly the same
8. Result must look like a real photo, photorealistic
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
    const gerarTryOn = httpsCallable(functions, 'gerarTryOn');
    
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
  frontImageB64: string,
  sideImageB64: string,
  backImageB64: string,
  clothingImageB64: string,
  category: string
): Promise<string[]> => {
  const ai = getAiClient();

  if (!ai) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80",
          "https://images.unsplash.com/photo-1509631179647-b849389274e6?w=600&q=80",
          "https://images.unsplash.com/photo-1503342394128-c104d54dba01?w=600&q=80"
        ]); 
      }, 4000);
    });
  }

  try {
    const generateAngle = async (personImage: string, view: string) => {
      const prompt = `
        ${STRICT_SYSTEM_PROMPT}

        TAREFA ESPECÍFICA:
        Apply the clothing item to the person in the image.
        Category: ${category}
        This is a ${view} (front/side/back) view of the person.
        
        Generate a photorealistic result where the clothing 
        fits naturally on this person's exact body type.
      `;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: personImage.split(',')[1] || personImage } },
            { inlineData: { mimeType: 'image/jpeg', data: clothingImageB64.split(',')[1] || clothingImageB64 } },
            { text: prompt }
          ]
        }
      });
      
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      return null;
    };

    const [resFront, resSide, resBack] = await Promise.all([
      generateAngle(frontImageB64, "front"),
      generateAngle(sideImageB64, "side"),
      generateAngle(backImageB64, "back"),
    ]);

    return [resFront || "", resSide || "", resBack || ""].filter(Boolean);

  } catch (error) {
    console.error("Gemini 360 Gen Error:", error);
    return [];
  }
};
