const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { VertexAI } = require("@google-cloud/vertexai");
const admin = require("firebase-admin");
const { GoogleAuth } = require("google-auth-library");

// Inicializa Firebase Admin no topo
if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: "pandora-ai-7c070.firebasestorage.app"
  });
}

const logApiCost = async (userId, type, cost) => {
  try {
    await admin.firestore().collection('api_usage').add({
      userId,
      type,
      cost,
      date: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error("Erro ao logar custo de API:", e);
  }
};

// ========== FUNÇÃO 5: CRIAR PAGAMENTO (CAKTO) ==========
exports.criarPagamento = onCall({
  region: "us-central1",
  cors: true,
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login necessário.");

  try {
    const { plan, userId, userEmail } = request.data;
    
    // URLs de checkout do Cakto (Exemplos baseados no código do App.tsx)
    // O usuário pode precisar atualizar esses links no futuro
    let checkoutUrl = "";
    
    if (plan === '30' || plan === 'Premium') {
      checkoutUrl = `https://pay.cakto.com.br/wsopww7_808505?email=${encodeURIComponent(userEmail)}&external_id=${userId}`;
    } else {
      // Link para o plano básico (100 créditos)
      checkoutUrl = `https://pay.cakto.com.br/wsopww7_808505?email=${encodeURIComponent(userEmail)}&external_id=${userId}`;
    }

    return { url: checkoutUrl };
  } catch (error) {
    console.error('Payment Error:', error);
    throw new HttpsError('internal', error.message);
  }
});

// Inicializa Firebase Admin (já feito no topo, mas mantendo a verificação por segurança)
if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: "pandora-ai-7c070.firebasestorage.app"
  });
}

// Obtém o ID do projeto de forma dinâmica
let cachedProjectId;
const getProjectId = async () => {
  if (cachedProjectId) return cachedProjectId;
  try {
    const auth = new GoogleAuth();
    cachedProjectId = await auth.getProjectId();
    if (cachedProjectId) return cachedProjectId;
  } catch (e) {
    console.warn("⚠️ Erro ao obter project ID via GoogleAuth:", e);
  }
  cachedProjectId = admin.app().options.projectId || process.env.GCLOUD_PROJECT || "pandora-ai-7c070";
  return cachedProjectId;
};

const LOCATION = "us-central1";

// Função auxiliar para obter token de acesso de forma robusta
async function getAccessToken() {
  try {
    const auth = new GoogleAuth({
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token;
  } catch (error) {
    console.error("❌ Erro ao obter token de acesso (GoogleAuth):", error);
    // Fallback para admin.credential
    try {
      const accessToken = await admin.credential.applicationDefault().getAccessToken();
      return accessToken.access_token;
    } catch (fallbackError) {
      console.error("❌ Erro no fallback de token:", fallbackError);
      throw new Error("Falha na autenticação com Google Cloud.");
    }
  }
}

// Inicializa Vertex AI SDK (opcional, se for usar Gemini)
const initVertexAI = async () => {
  const PROJECT_ID = await getProjectId();
  return new VertexAI({ project: PROJECT_ID, location: LOCATION });
};

// ========== FUNÇÃO 1: GERAR TRY-ON (SDK VERSION) ==========
exports.gerarTryOn = onCall({
  memory: "1GiB",
  timeoutSeconds: 180,
  region: "us-central1",
  cors: true,
}, async (request) => {
  if (!request.auth) {
    console.error("❌ [Try-On] Usuário não autenticado.");
    throw new HttpsError("unauthenticated", "Você deve estar logado para usar o provador virtual.");
  }

  try {
    const { urlFotoCliente, urlFotoRoupa, prompt: customPrompt, category } = request.data;
    if (!urlFotoCliente || !urlFotoRoupa) {
      throw new HttpsError("invalid-argument", "Imagens do cliente e da roupa são obrigatórias.");
    }
    
    const limparBase64 = (str) => {
      if (!str) return "";
      // Remove prefixos como 'data:image/jpeg;base64,' se existirem
      return str.includes(",") ? str.split(",")[1] : str;
    };
    
    const defaultPrompt = "High-quality virtual try-on. CRITICAL: DO NOT MODIFY the person's face, head, hair, skin tone, or facial features. The person's identity must remain 100% identical to the original photo. ONLY the clothing should be replaced. Keep the person's body shape, pose, and background exactly as they are. ABSOLUTELY NO modifications to the face or head area.";
    const finalPrompt = customPrompt || defaultPrompt;
    
    let accessToken;
    try {
      accessToken = await getAccessToken();
      console.log("🔑 [Try-On] Token de acesso obtido com sucesso.");
    } catch (authErr) {
      console.error("❌ [Try-On] Erro de autenticação:", authErr);
      throw new HttpsError("unauthenticated", `Erro de autenticação IA: ${authErr.message}`);
    }
    
    const PROJECT_ID = await getProjectId();
    const API_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/virtual-try-on-001:predict`;
    
    // Mapeamento de categoria para o Vertex AI
    let clothingCategory = "TOP";
    if (category === "calca" || category === "short") clothingCategory = "BOTTOM";
    if (category === "looks" || category === "saia") clothingCategory = "ONE_PIECE";

    console.log(`🚀 [Try-On] Iniciando geração para categoria: ${clothingCategory}...`);

    const chamarTryOn = async (retryCount = 0) => {
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${accessToken}`, 
            "Content-Type": "application/json" 
          },
          body: JSON.stringify({
            instances: [{
              person_image: { image: { bytes_base64_encoded: limparBase64(urlFotoCliente) } },
              product_image: { image: { bytes_base64_encoded: limparBase64(urlFotoRoupa) } }
            }],
            parameters: { 
              prompt: finalPrompt,
              clothing_category: clothingCategory
            },
          }),
        });
        
        const resText = await response.text();
        let resultado;
        try {
          resultado = JSON.parse(resText);
        } catch (e) {
          console.error("❌ [Try-On] Resposta inválida do Vertex AI:", resText);
          throw new Error("Resposta inválida do servidor de IA.");
        }

        if (!response.ok) {
          console.error(`❌ [Try-On] Erro ${response.status}:`, resultado);
          // Se for erro de quota ou sobrecarga, tentamos novamente
          if ((response.status === 429 || response.status === 503 || response.status === 500) && retryCount < 2) {
            console.log(`⚠️ [Try-On] Erro ${response.status}, tentando novamente em 5s...`);
            await new Promise(r => setTimeout(r, 5000));
            return chamarTryOn(retryCount + 1);
          }
          throw new Error(resultado.error?.message || `Erro na API Vertex AI (${response.status})`);
        }
        
        const imagemBase64 = resultado.predictions?.[0]?.image?.bytesBase64Encoded || 
                             resultado.predictions?.[0]?.bytesBase64Encoded || 
                             resultado.predictions?.[0]?.bytes_base64_encoded;
        if (!imagemBase64) {
          if (retryCount < 1) {
            console.log("⚠️ [Try-On] Vazio, tentando novamente em 5s...");
            await new Promise(r => setTimeout(r, 5000));
            return chamarTryOn(retryCount + 1);
          }
          throw new Error("Não foi possível gerar a imagem. Verifique se a pessoa e a roupa estão visíveis.");
        }
        
        return imagemBase64;
      } catch (err) {
        console.error("❌ [Try-On] Exceção:", err);
        if (retryCount < 2) {
          console.log("⚠️ [Try-On] Falha na requisição, tentando novamente em 5s...");
          await new Promise(r => setTimeout(r, 5000));
          return chamarTryOn(retryCount + 1);
        }
        throw err;
      }
    };

    const imagemBase64 = await chamarTryOn();
    
    console.log("✅ [Try-On] Imagem gerada com sucesso!");
    
    // Log de custo (estimado $0.05 por try-on)
    await logApiCost(request.auth.uid, "try-on", 0.05);

    return { sucesso: true, imagemGerada: `data:image/png;base64,${imagemBase64}` };
  } catch (error) {
    console.error("Erro em gerarTryOn:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", `Erro no Try-On: ${error.message || "Erro desconhecido"}`);
  }
});

// ========== FUNÇÃO 1.1: GERAR 360 VIEW (OTIMIZADA) ==========
exports.gerar360View = onCall({
  memory: "2GiB",
  timeoutSeconds: 300,
  region: "us-central1",
  cors: true,
}, async (request) => {
  if (!request.auth) {
    console.error("❌ [360] Usuário não autenticado.");
    throw new HttpsError("unauthenticated", "Você deve estar logado para usar o provador 360.");
  }

  console.log("🚀 [360] Iniciando processamento otimizado (Lado e Costas)...");
  
  try {
    const { frontImageB64, sideImageB64, backImageB64, clothingImageB64, category, clothingBackImageB64 } = request.data;
    
    if (!sideImageB64 || !backImageB64 || !clothingImageB64) {
      throw new HttpsError("invalid-argument", "Imagens de Lado, Costas e Roupa são obrigatórias.");
    }

    // Mapeamento de categoria para o Vertex AI
    let clothingCategory = "TOP";
    if (category === "calca" || category === "short") clothingCategory = "BOTTOM";
    if (category === "looks" || category === "saia") clothingCategory = "ONE_PIECE";

    const limparBase64 = (str) => {
      if (!str) return null;
      return str.includes(",") ? str.split(",")[1] : str;
    };

    let accessToken;
    try {
      accessToken = await getAccessToken();
    } catch (authErr) {
      console.error("❌ [360] Erro de autenticação:", authErr);
      throw new HttpsError("unauthenticated", `Erro de autenticação IA (360): ${authErr.message}`);
    }
    
    const PROJECT_ID = await getProjectId();
    const API_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/virtual-try-on-001:predict`;

    const chamarVertexAI = async (personImageB64, label, customClothingB64 = null, retryCount = 0) => {
      if (!personImageB64) return null;
      console.log(`📸 [360] Gerando ângulo: ${label} (Tentativa ${retryCount + 1})...`);
      
      const currentClothingB64 = customClothingB64 || clothingImageB64;
      
      // Prompt customizado para o ângulo de costas se houver imagem específica da roupa
      const basePrompt = "High-quality virtual try-on. CRITICAL: DO NOT MODIFY the person's face, head, hair, skin tone, or facial features. The person's identity must remain 100% identical to the original photo. ONLY the clothing should be replaced. Keep the person's body shape, pose, and background exactly as they are. ABSOLUTELY NO modifications to the face or head area.";
      const backPrompt = "High-quality virtual try-on of the BACK view. STICK STRICTLY to the provided BACK product image. MANDATORY: Preserve all pockets, labels, tags, seams, and logos exactly as shown in the clothing image. Ensure the back design is 100% accurate. DO NOT alter the person's face, head, identity, body shape, or background.";
      
      const prompt = (label === "costas" && customClothingB64) ? backPrompt : basePrompt;
      const currentGuidanceScale = (label === "costas") ? 20.0 : 12.0;
      
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${accessToken}`, 
            "Content-Type": "application/json" 
          },
          body: JSON.stringify({
            instances: [{
              person_image: { image: { bytes_base64_encoded: limparBase64(personImageB64) } },
              product_image: { image: { bytes_base64_encoded: limparBase64(currentClothingB64) } }
            }],
            parameters: { 
              prompt: prompt,
              clothing_category: clothingCategory
            },
          }),
        });
        
        const resText = await response.text();
        let resJson;
        try {
          resJson = JSON.parse(resText);
        } catch (e) {
          throw new Error(`Resposta inválida do Vertex AI no ângulo ${label}`);
        }

        if (!response.ok) {
          console.error(`❌ [360] Erro ${response.status} (${label}):`, resJson);
          // Se for erro de quota ou sobrecarga, tentamos novamente
          if (response.status === 429 || response.status === 503 || response.status === 500) {
            if (retryCount < 2) {
              console.log(`⚠️ [360] Erro ${response.status} para ${label}, tentando novamente em 8s...`);
              await new Promise(r => setTimeout(r, 8000));
              return chamarVertexAI(personImageB64, label, customClothingB64, retryCount + 1);
            }
          }
          throw new Error(resJson.error?.message || `Erro no ângulo ${label} (${response.status})`);
        }
        
        const prediction = resJson.predictions?.[0]?.image?.bytesBase64Encoded ||
                           resJson.predictions?.[0]?.bytesBase64Encoded || 
                           resJson.predictions?.[0]?.bytes_base64_encoded ||
                           resJson.predictions?.[0]?.bytes_base_64_encoded;
        
        if (!prediction) {
          if (retryCount < 2) {
            console.log(`⚠️ [360] Vazio para ${label}, tentando novamente em 8s...`);
            await new Promise(r => setTimeout(r, 8000));
            return chamarVertexAI(personImageB64, label, customClothingB64, retryCount + 1);
          }
          throw new Error(`Nenhuma imagem gerada para ${label}. Tente tirar uma foto mais nítida ou com fundo mais simples.`);
        }
        
        return `data:image/png;base64,${prediction}`;
      } catch (err) {
        console.error(`❌ [360] Exceção (${label}):`, err);
        if (retryCount < 2) {
          console.log(`⚠️ [360] Falha na requisição para ${label}, tentando novamente em 8s...`);
          await new Promise(r => setTimeout(r, 8000));
          return chamarVertexAI(personImageB64, label, customClothingB64, retryCount + 1);
        }
        throw err;
      }
    };

    // --- EXECUÇÃO OTIMIZADA (PARALELA) ---
    
    // 1. A imagem de frente já existe, então apenas a mantemos
    const imgFrente = frontImageB64; 
    console.log("⏩ [360] Pulando geração da frente (já existente).");

    // Executamos as gerações em paralelo com um pequeno atraso de 3s entre elas
    // Isso reduz drasticamente o tempo total de espera do usuário
    const [imgLateral, imgCostas] = await Promise.all([
      chamarVertexAI(sideImageB64, "lateral"),
      new Promise(resolve => setTimeout(resolve, 3000)).then(() => 
        chamarVertexAI(backImageB64, "costas", clothingBackImageB64)
      )
    ]);

    console.log("✅ [360] Visualização 360° concluída com sucesso.");
    
    // Log de custo (estimado $0.15 por 360 - 3 imagens)
    await logApiCost(request.auth.uid, "360", 0.15);

    return { 
      sucesso: true, 
      imagens: [imgFrente, imgLateral, imgCostas] 
    };

  } catch (error) {
    console.error("💥 [360] Erro:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", `Erro no 360: ${error.message || "Erro desconhecido"}`);
  }
});

// ========== FUNÇÃO 3: WEBHOOK CAKTO ==========
exports.webhookCakto = onRequest({ 
  region: "us-central1",
  cors: true 
}, async (req, res) => {
  try {
    const { event, data } = req.body;
    if (event !== 'purchase_approved') return res.status(200).send('Ignored');
    
    const { customer, amount, status, id: orderId, external_id } = data;
    const email = customer?.email?.toLowerCase().trim();
    if (!email || status !== 'paid') return res.status(400).send('Invalid data');
    
    const valor = parseFloat(String(amount).replace(',', '.'));
    let creditos = valor >= 29.80 ? 300 : 100;
    const plano = valor >= 29.80 ? 'Premium' : 'Basic';
    
    const db = admin.firestore();
    let userRef;

    if (external_id) {
      userRef = db.collection('users').doc(external_id);
    } else {
      const snapshot = await db.collection('users').where('email', '==', email).get();
      if (!snapshot.empty) {
        userRef = snapshot.docs[0].ref;
      } else {
        // Se não encontrar por email, cria um novo com ID aleatório (fallback)
        userRef = db.collection('users').doc();
      }
    }
    
    const purchaseData = {
      email,
      credits: admin.firestore.FieldValue.increment(creditos),
      lastPurchasePlan: plano,
      lastPurchaseAmount: valor,
      lastPurchaseCredits: creditos,
      lastPurchaseDate: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (plano === 'Premium') {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      purchaseData.subscriptionTier = 'premium';
      purchaseData.subscriptionExpiresAt = expiresAt.toISOString();
      purchaseData.subscriptionStartDate = now.toISOString();
    }

    // Usamos set com merge para garantir que o documento exista ou seja atualizado
    await userRef.set(purchaseData, { merge: true });
    
    await db.collection('transactions').add({
      userId: userRef.id,
      email,
      amount: valor,
      credits: creditos,
      plan: plano,
      orderId,
      date: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).send(error.message);
  }
});

// ========== FUNÇÃO 4: SALVAR IMAGEM NO STORAGE ==========
exports.salvarImagemStorage = onCall({
  memory: "1GiB",
  region: "us-central1",
  cors: true,
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login necessário.");

  try {
    const { imagemBase64, userId } = request.data;
    if (!imagemBase64 || !userId) throw new HttpsError("invalid-argument", "Dados incompletos.");
    
    const bucket = admin.storage().bucket();
    const nomeArquivo = `looks/${userId}/${Date.now()}.jpg`;
    const arquivo = bucket.file(nomeArquivo);

    const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    await arquivo.save(buffer, {
      metadata: { 
        contentType: 'image/jpeg',
      }
    });

    const urlPublica = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(nomeArquivo)}?alt=media`;

    return { sucesso: true, url: urlPublica };
  } catch (error) {
    console.error('Storage Error:', error);
    throw new HttpsError('internal', error.message);
  }
});

// ========== FUNÇÃO 5: ENVIAR EMAIL DE BOAS-VINDAS ==========
exports.enviarEmailBoasVindas = onRequest({
  cors: true,
  maxInstances: 10,
}, async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).send('Email is required');
  }

  try {
    console.log(`📧 Enviando email de boas-vindas para: ${email}`);
    // Aqui você integraria com SendGrid, Mailgun, etc.
    // Por enquanto, apenas logamos o sucesso.
    return res.status(200).json({ sucesso: true, mensagem: 'Email enviado com sucesso (simulado)' });
  } catch (error) {
    console.error('❌ Erro ao enviar email:', error);
    return res.status(500).json({ sucesso: false, erro: error.message });
  }
});
