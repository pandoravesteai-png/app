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
**REGRA ESTRITA E ABSOLUTA:** Você deve preservar a identidade exata da pessoa. É expressamente proibido alterar, modificar ou redesenhar os pixels correspondentes ao rosto, olhos, boca, cabelo, tom de pele, mãos e o cenário de fundo. A pessoa deve permanecer 100% idêntica à foto original. Apenas a área da roupa atual deve ser substituída, ajustando a nova peça à pose, caimento e iluminação originais de forma realista.

**Instruções Adicionais:**
1. **Entrada:** Receba uma imagem de corpo completo da pessoa (imagem_base) e, subsequentemente, as instruções de modificação de vestuário (peca_alvo).
2. **Execução:** Aplique as alterações solicitadas com precisão, substituindo a blusa, calça, look completo, vestido, saia, tênis, sapato, meia, bermuda ou short, conforme descrito.
3. **Restrições:**
   * **Características Pessoais:** Em hipótese alguma altere as características físicas da pessoa, incluindo cor da pele, cabelo, traços faciais, biotipo ou acessórios. O rosto deve ser preservado exatamente como na imagem original.
   * **Contexto e Qualidade:** Mantenha o ambiente e o contexto inalterados. A imagem gerada deve ter qualidade e realismo padrão.
   * **Liberdade de Estilo:** Se um usuário solicitar uma peça de roupa que tradicionalmente não corresponde ao seu gênero (ex: homem pedindo vestido, mulher pedindo smoking), EXECUTE O PEDIDO SEM HESITAÇÃO. Adapte o caimento da peça ao corpo da pessoa de forma realista.
   * **Itens Específicos:** Se a peça for um calçado (tênis, sapato, meia), certifique-se de que ele esteja nos pés. Se for uma peça inferior (calça, saia, bermuda), na parte inferior. Se for superior (blusa, camisa), na parte superior. Se for look completo, substitua tudo.
`;

export const generateTryOnLook = async (
  userImageBase64: string,
  clothingImageBase64: string,
  category: string
): Promise<string | null> => {
  try {
    console.log("Enviando fotos para o servidor Firebase...");

    const response = await fetch('https://us-central1-pandora-ai-7c070.cloudfunctions.net/gerarTryOn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          urlFotoCliente: userImageBase64,
          urlFotoRoupa: clothingImageBase64
        }
      })
    });

    const json = await response.json();

    if (json.result && json.result.sucesso) {
      console.log("Imagem recebida com sucesso!");
      return json.result.imagemGerada;
    } else {
      console.error("Erro no servidor:", json);
      return null;
    }
  } catch (error) {
    console.error("Erro ao chamar o servidor Firebase:", error);
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
        Substitua a ${category} (area_de_troca) da pessoa na imagem_base pela peça de roupa fornecida na peca_alvo.
        Esta é uma visão ${view} (frente/lado/costas) da pessoa.
      `;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: personImage } },
            { inlineData: { mimeType: 'image/jpeg', data: clothingImageB64 } },
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
