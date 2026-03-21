const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { GoogleAuth } = require("google-auth-library");
const admin = require("firebase-admin");

// Inicializa Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: "pandora-ai-7c070.firebasestorage.app"
  });
}

const PROJECT_ID = "pandora-ai-7c070";
const REGION = "us-central1";
const API_URL = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/publishers/google/models/virtual-try-on-001:predict`;

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

async function getAccessToken() {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

// ========== FUNÇÃO 1: GERAR TRY-ON ==========
exports.gerarTryOn = onCall({
  memory: "512MiB",
  timeoutSeconds: 120,
  region: "us-central1",
}, async (request) => {
  try {
    const { urlFotoCliente, urlFotoRoupa } = request.data;
    if (!urlFotoCliente || !urlFotoRoupa) throw new HttpsError("invalid-argument", "Envie as duas imagens.");
    
    const limparBase64 = (str) => str.includes(",") ? str.split(",")[1] : str;
    const accessToken = await getAccessToken();
    
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${accessToken}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        instances: [{
          personImage: { image: { bytesBase64Encoded: limparBase64(urlFotoCliente) } },
          productImages: [{ image: { bytesBase64Encoded: limparBase64(urlFotoRoupa) } }],
        }],
        parameters: { 
          sampleCount: 1, 
          baseSteps: 40,
          personGeneration: "allow_adult", 
          safetySetting: "block_only_high", 
          addWatermark: false,
          guidanceScale: 7.5
        },
      }),
    });
    
    const resultado = await response.json();
    if (!response.ok) throw new HttpsError("internal", resultado.error?.message || "Erro na API.");
    
    const imagemBase64 = resultado.predictions?.[0]?.bytesBase64Encoded;
    if (!imagemBase64) throw new HttpsError("not-found", "Nenhuma imagem gerada.");
    
    return { sucesso: true, imagemGerada: `data:image/png;base64,${imagemBase64}` };
  } catch (error) {
    console.error("Erro em gerarTryOn:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message);
  }
});

// ========== FUNÇÃO 1.1: GERAR 360 VIEW ==========
exports.gerar360View = onCall({
  memory: "2GiB",
  timeoutSeconds: 300,
  region: "us-central1",
}, async (request) => {
  console.log("🚀 Iniciando gerar360View...");
  try {
    const { frontImageB64, sideImageB64, backImageB64, clothingImageB64 } = request.data;
    if (!sideImageB64 || !backImageB64 || !clothingImageB64) {
      throw new HttpsError("invalid-argument", "Envie pelo menos as imagens de Lado, Costas e a Roupa.");
    }
    
    const limparBase64 = (str) => {
      if (!str) return null;
      return str.includes(",") ? str.split(",")[1] : str;
    };
    const accessToken = await getAccessToken();
    
    const chamarVertexAI = async (personImageB64, label) => {
      if (!personImageB64) return null;
      console.log(`📸 Gerando ângulo: ${label}...`);
      
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${accessToken}`, 
            "Content-Type": "application/json" 
          },
          body: JSON.stringify({
            instances: [{
              personImage: { image: { bytesBase64Encoded: limparBase64(personImageB64) } },
              productImages: [{ image: { bytesBase64Encoded: limparBase64(clothingImageB64) } }],
            }],
            parameters: { 
              sampleCount: 1, 
              baseSteps: 40,
              personGeneration: "allow_adult", 
              safetySetting: "block_only_high", 
              addWatermark: false,
              guidanceScale: 7.5
            },
          }),
        });
        
        const contentType = response.headers.get("content-type");
        let resultado;
        
        if (contentType && contentType.includes("application/json")) {
          resultado = await response.json();
        } else {
          const text = await response.text();
          console.error(`❌ Resposta não-JSON da Vertex AI (${label}):`, text);
          throw new Error(`Resposta inválida da API (Status: ${response.status})`);
        }

        if (!response.ok) {
          console.error(`❌ Erro Vertex AI (${label}) - Status ${response.status}:`, JSON.stringify(resultado));
          const msg = resultado.error?.message || `Erro na API Vertex (Status: ${response.status})`;
          throw new Error(msg);
        }
        
        const imagemBase64 = resultado.predictions?.[0]?.bytesBase64Encoded;
        if (!imagemBase64) {
          console.error(`❌ Sem predições para ${label}:`, JSON.stringify(resultado));
          throw new Error(`Nenhuma imagem gerada para o ângulo ${label}`);
        }
        
        return `data:image/png;base64,${imagemBase64}`;
      } catch (err) {
        console.error(`💥 Exceção em chamarVertexAI (${label}):`, err);
        throw err;
      }
    };

    // Chamadas sequenciais para evitar limites de cota e instabilidade
    // Se frontImageB64 for fornecido, gera. Se não, retorna null na primeira posição.
    const base64frente = frontImageB64 ? await chamarVertexAI(frontImageB64, "frente") : null;
    
    // Pequeno delay entre chamadas para evitar sobrecarga
    await new Promise(resolve => setTimeout(resolve, 8000));
    const base64lateral = await chamarVertexAI(sideImageB64, "lateral");
    
    await new Promise(resolve => setTimeout(resolve, 8000));
    const base64costas = await chamarVertexAI(backImageB64, "costas");
    
    console.log("✅ Imagens 360 processadas!");
    return { 
      sucesso: true, 
      imagens: [base64frente, base64lateral, base64costas] 
    };
  } catch (error) {
    console.error("💥 Erro fatal em gerar360View:", error);
    
    // Se for um erro do Firebase Functions, repassa
    if (error instanceof HttpsError) throw error;
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Se for um erro de timeout (comum em 360)
    if (errorMessage.includes("timeout") || errorMessage.includes("deadline")) {
      throw new HttpsError("deadline-exceeded", "O processamento 360 excedeu o tempo limite. Tente novamente.");
    }
    
    // Caso contrário, erro interno com mensagem detalhada
    throw new HttpsError("internal", `Erro no processamento 360: ${errorMessage}`);
  }
});

// ========== FUNÇÃO 3: WEBHOOK CAKTO (CORRIGIDO) ==========
exports.webhookCakto = onRequest({ 
  region: "us-central1",
  cors: true 
}, async (req, res) => {
  console.log('🔔 WEBHOOK CAKTO - BUSCA POR EMAIL');
  console.log('📅 Timestamp:', new Date().toISOString());
  
  try {
    const { event, data } = req.body;
    
    console.log('📦 Event:', event);
    console.log('📊 Data recebida:', JSON.stringify(data, null, 2));
    
    if (event !== 'purchase_approved') {
      console.log('⚠️ Evento ignorado:', event);
      return res.status(200).json({
        success: true,
        message: 'Evento ignorado'
      });
    }
    
    const { customer, amount, status, id: orderId, refId, paymentMethod } = data;
    const email = customer?.email;
    
    console.log('📧 Email:', email);
    console.log('💰 Valor:', amount);
    console.log('📦 Status:', status);
    
    if (!email) {
      console.error('❌ Email não encontrado');
      return res.status(400).json({ success: false, error: 'Email não encontrado' });
    }
    
    if (status !== 'paid') {
      console.log('⚠️ Status não é paid:', status);
      return res.status(200).json({ success: true, message: 'Pagamento não aprovado' });
    }
    
    const valor = parseFloat(
      String(amount).replace(',', '.')
    );
    
    console.log('💵 Valor raw:', amount);
    console.log('💵 Valor convertido:', valor);
    
    let plano = '';
    let creditos = 0;
    
    if (valor >= 19.80 && valor <= 20.10) {
      plano = 'Básico';
      creditos = 100;
    } else if (valor >= 29.80 && valor <= 30.10) {
      plano = 'Premium';
      creditos = 300;
    } else {
      console.error('❌ Valor inválido:', valor);
      return res.status(400).json({ success: false, error: 'Valor inválido' });
    }
    
    console.log('✅ Plano:', plano);
    console.log('💎 Créditos:', creditos);
    
    try {
      // ========== BUSCAR USUÁRIO POR EMAIL (NÃO USAR EMAIL COMO ID) ==========
      const db = admin.firestore();
      console.log('✅ Usando banco padrão do Firestore');
      
      // BUSCAR usuário pelo campo 'email'
      const usersRef = db.collection('users');
      const snapshot = await usersRef.where('email', '==', email).get();
      
      let userRef;
      let creditosAtuais = 0;
      let userDocId = '';
      
      if (!snapshot.empty) {
        // Usuário encontrado! Usar documento existente (UID)
        const userDoc = snapshot.docs[0];
        userRef = userDoc.ref;
        userDocId = userDoc.id;
        creditosAtuais = userDoc.data().credits || 0;
        console.log('✅ Usuário encontrado! ID:', userDocId);
        console.log('📊 Créditos atuais:', creditosAtuais);
      } else {
        // Usuário não existe
        console.log('⚠️ Usuário não encontrado, criando novo');
        userRef = usersRef.doc();
        userDocId = userRef.id;
        creditosAtuais = 0;
      }
      
      const novoTotal = creditosAtuais + creditos;
      console.log('➕ Adicionando:', creditos);
      console.log('🎯 Novo total:', novoTotal);
      
      // Atualizar documento EXISTENTE
      await userRef.set({
        email: email,
        nome: customer?.name || '',
        credits: novoTotal,
        lastPurchase: admin.firestore.FieldValue.serverTimestamp(),
        lastPurchaseAmount: valor,
        lastPurchasePlan: plano,
        lastPurchaseOrderId: orderId || '',
        lastPurchaseRefId: refId || '',
        lastPurchaseCredits: creditos,
        lastPurchasePaymentMethod: paymentMethod || ''
      }, { merge: true });
      
      console.log('✅ Documento atualizado:', userDocId);
      
      // Salvar histórico
      await db.collection('payment_history').add({
        userId: email,
        userDocId: userDocId,
        transactionId: orderId || '',
        refId: refId || '',
        amount: valor,
        credits: creditos,
        plan: plano,
        status: status,
        paymentMethod: paymentMethod || '',
        caktoData: data,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('✅ SUCESSO!');
      
      return res.status(200).json({
        success: true,
        message: 'Créditos adicionados',
        data: {
          email: email,
          userDocId: userDocId,
          plano: plano,
          creditosAdicionados: creditos,
          creditosAnteriores: creditosAtuais,
          creditosNovos: novoTotal,
          orderId: orderId || '',
          refId: refId || ''
        }
      });
      
    } catch (firestoreError) {
      console.error('❌ Erro Firestore:', firestoreError);
      return res.status(500).json({
        success: false,
        error: 'Erro ao atualizar: ' + firestoreError.message
      });
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========== FUNÇÃO 4: SALVAR IMAGEM NO STORAGE ==========
exports.salvarImagemStorage = onCall({
  region: "us-central1",
}, async (request) => {
  if (!request.auth) {
    console.error("Tentativa de salvamento sem autenticação");
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  try {
    const { imagemBase64, userId } = request.data;
    if (!imagemBase64 || !userId) {
      console.error("Dados incompletos recebidos:", { hasImage: !!imagemBase64, userId });
      throw new HttpsError("invalid-argument", "Dados incompletos.");
    }
    
    const bucket = admin.storage().bucket();
    const nomeArquivo = `looks/${userId}/${Date.now()}.jpg`;
    const arquivo = bucket.file(nomeArquivo);

    console.log(`Tentando salvar imagem para o usuário ${userId} no caminho ${nomeArquivo}`);

    const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    await arquivo.save(buffer, {
      metadata: { 
        contentType: 'image/jpeg',
        metadata: {
          firebaseStorageDownloadTokens: Date.now().toString()
        }
      }
    });

    console.log(`Imagem salva com sucesso: ${nomeArquivo}`);

    const urlPublica = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(nomeArquivo)}?alt=media`;

    return { 
      sucesso: true, 
      url: urlPublica 
    };

  } catch (error) {
    console.error('Erro detalhado ao salvar imagem:', error);
    throw new HttpsError('internal', `Erro ao salvar imagem: ${error.message}`);
  }
});
