const { onCall, onRequest } = require("firebase-functions/v2/https");
const { GoogleAuth } = require("google-auth-library");
const admin = require("firebase-admin");

// Inicializa Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
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
    if (!urlFotoCliente || !urlFotoRoupa) throw new Error("Envie as duas imagens.");
    
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
          baseSteps: 20, 
          personGeneration: "allow_adult", 
          safetySetting: "block_medium_and_above", 
          addWatermark: false 
        },
      }),
    });
    
    const resultado = await response.json();
    if (!response.ok) throw new Error(resultado.error?.message || "Erro na API.");
    
    const imagemBase64 = resultado.predictions?.[0]?.bytesBase64Encoded;
    if (!imagemBase64) throw new Error("Nenhuma imagem gerada.");
    
    return { sucesso: true, imagemGerada: `data:image/png;base64,${imagemBase64}` };
  } catch (error) {
    console.error("Erro:", error.message);
    return { sucesso: false, erro: error.message };
  }
});

// ========== FUNÇÃO 2: CRIAR PAGAMENTO ==========
exports.criarPagamento = onCall({
  region: 'us-central1',
}, async (request) => {
  const { userId, plan, userEmail } = request.data;
  const amount = plan === '20' ? 1990 : 2990;
  const credits = plan === '20' ? 20 : 30;

  try {
    const response = await fetch('https://api.abacatepay.com/v1/billing/create', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer abc_dev_qeMChtHJdjFJsjQzzsqUCgur',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        frequency: 'ONE_TIME',
        methods: ['PIX'],
        products: [{
          externalId: plan === '20' ? 'prod_sX2xfLW0Pqjmcg2DRPM5SnYR' : 'prod_gne1zpe0ARwQp2AcKSdzYSAK',
          name: `${credits} Créditos Pandora AI`,
          quantity: 1,
          price: amount,
        }],
        customer: {
          name: userEmail || 'Cliente Pandora AI',
          cellphone: '83999999999',
          email: userEmail,
        },
        returnUrl: `https://pandora-ai-7c070.web.app?payment=success&userId=${userId}&credits=${credits}`,
        completionUrl: `https://pandora-ai-7c070.web.app?payment=success&userId=${userId}&credits=${credits}`,
      }),
    });

    const data = await response.json();
    const url = data?.data?.url;
    if (!url) {
      console.error('AbacatePay Error:', data);
      throw new Error('URL de pagamento não gerada');
    }
    return { url };
  } catch (error) {
    console.error('Function Error:', error);
    throw error;
  }
});

// ========== FUNÇÃO 3: WEBHOOK PAGAMENTO (NOVA!) ==========
exports.webhookPagamento = onRequest({ 
  region: "us-central1",
  cors: true 
}, async (req, res) => {
  try {
    console.log("📩 Webhook recebido:", JSON.stringify(req.body));
    
    const { event, data } = req.body;
    
    // Verifica se é um pagamento confirmado
    if (event === "billing.paid") {
      const email = data?.customer?.email;
      const amount = data?.products?.[0]?.price || 0;
      
      // Determina quantos créditos dar baseado no valor
      let credits = 0;
      if (amount === 1990) credits = 20;
      if (amount === 2990) credits = 30;
      
      console.log(`💰 Pagamento detectado: ${email} - R$${amount/100} - ${credits} créditos`);
      
      if (email && credits > 0) {
        // Busca usuário por email no Firestore
        const usersRef = admin.firestore().collection("users");
        const snapshot = await usersRef.where("email", "==", email).get();
        
        if (!snapshot.empty) {
          const userDoc = snapshot.docs[0];
          await userDoc.ref.update({
            credits: admin.firestore.FieldValue.increment(credits)
          });
          console.log(`✅ ${credits} créditos adicionados para ${email}`);
        } else {
          console.warn(`⚠️ Usuário não encontrado no Firestore: ${email}`);
        }
      }
    }
    
    res.status(200).send("ok");
  } catch (error) {
    console.error("❌ Erro no webhook:", error);
    res.status(500).send("error");
  }
});
