const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { VertexAI } = require("@google-cloud/vertexai");
const admin = require("firebase-admin");
const { GoogleAuth } = require("google-auth-library");
 
if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: "pandora-ai-7c070.firebasestorage.app"
  });
}
 
const logApiCost = async (userId, type, cost) => {
  try {
    await admin.firestore().collection('api_usage').add({
      userId, type, cost,
      date: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error("Erro ao logar custo de API:", e);
  }
};
 
exports.criarPagamento = onCall({
  region: "us-central1",
  cors: true,
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login necessário.");
  try {
    const { plan, userId, userEmail } = request.data;
    let checkoutUrl = `https://pay.cakto.com.br/wsopww7_808505?email=${encodeURIComponent(userEmail)}&external_id=${userId}`;
    return { url: checkoutUrl };
  } catch (error) {
    console.error('Payment Error:', error);
    throw new HttpsError('internal', error.message);
  }
});
 
const PROJECT_ID = "pandora-ai-7c070";
const LOCATION = "us-central1";
const API_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/virtual-try-on-001:predict`;
 
// ✅ base64 JPEG começa com /9j/ — não rejeitar strings que começam com /
const limparBase64 = (str) => {
  if (!str || typeof str !== 'string' || str.trim() === '') return null;
  if (str.startsWith('http://') || str.startsWith('https://')) {
    console.error('Imagem é URL, não base64:', str.substring(0, 80));
    return null;
  }
  if (str.includes(',')) {
    const parte = str.split(',')[1];
    return parte?.trim() || null;
  }
  if (str.length < 100) {
    console.error('Base64 muito curto:', str.length);
    return null;
  }
  return str.trim();
};
 
async function getAccessToken() {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}
 
// ✅ Parâmetros otimizados para melhor qualidade
const getParametros = () => ({
  sampleCount: 1,
  addWatermark: false,
  baseSteps: 40,
  personGeneration: "allow_adult",
  safetySetting: "block_only_high",
  outputOptions: {
    mimeType: "image/jpeg",
    compressionQuality: 90
  }
});
 
exports.gerarTryOn = onCall({
  memory: "1GiB",
  timeoutSeconds: 180,
  region: "us-central1",
  cors: true,
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Você deve estar logado.");
 
  try {
    const { urlFotoCliente, urlFotoRoupa, prompt: customPrompt, category } = request.data;
 
    const imagemCliente = limparBase64(urlFotoCliente);
    const imagemRoupa = limparBase64(urlFotoRoupa);
 
    console.log('imagemCliente length:', imagemCliente?.length ?? 'NULL');
    console.log('imagemRoupa length:', imagemRoupa?.length ?? 'NULL');
    console.log('urlFotoCliente inicio:', urlFotoCliente?.substring(0, 60));
    console.log('urlFotoRoupa inicio:', urlFotoRoupa?.substring(0, 60));
 
    if (!imagemCliente) throw new HttpsError("invalid-argument", "Foto da pessoa inválida. Envie em base64.");
    if (!imagemRoupa) throw new HttpsError("invalid-argument", "Foto da roupa inválida. Envie em base64.");
 
    const finalPrompt = customPrompt || "CRITICAL INSTRUCTION: You MUST preserve the person's face, eyes, hair, skin tone and all facial features EXACTLY as they appear in the original photo. DO NOT blur, alter, modify or touch the face or eyes in any way. The face must be 100% identical to the original. ONLY replace the clothing item on the body. The result must look like a real photo of the same person wearing different clothes.";
 
    const accessToken = await getAccessToken();
 
    const chamarTryOn = async (retryCount = 0) => {
      try {
        const requestBody = {
          instances: [{
            personImage: { image: { bytesBase64Encoded: imagemCliente } },
            productImages: [{ image: { bytesBase64Encoded: imagemRoupa } }]
          }],
          // ✅ Parâmetros otimizados aplicados
          parameters: getParametros()
        };
 
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
 
        const resText = await response.text();
        console.log('Vertex AI Status:', response.status);
        console.log('Vertex AI Resposta:', resText.substring(0, 500));
 
        let resultado;
        try { resultado = JSON.parse(resText); } catch (e) { throw new Error("Resposta inválida do Vertex AI"); }
 
        if (!response.ok) {
          if ((response.status === 429 || response.status === 503 || response.status === 500) && retryCount < 2) {
            await new Promise(r => setTimeout(r, 5000));
            return chamarTryOn(retryCount + 1);
          }
          throw new Error(resultado.error?.message || `Erro Vertex AI (${response.status})`);
        }
 
        const imagemBase64 =
          resultado.predictions?.[0]?.image?.bytesBase64Encoded ||
          resultado.predictions?.[0]?.bytesBase64Encoded ||
          resultado.predictions?.[0]?.bytes_base64_encoded ||
          resultado.predictions?.[0]?.generated_image?.bytesBase64Encoded;
 
        if (!imagemBase64) {
          if (retryCount < 1) { await new Promise(r => setTimeout(r, 5000)); return chamarTryOn(retryCount + 1); }
          throw new Error("Não foi possível gerar a imagem.");
        }
 
        return imagemBase64;
      } catch (err) {
        if (retryCount < 2) { await new Promise(r => setTimeout(r, 5000)); return chamarTryOn(retryCount + 1); }
        throw err;
      }
    };
 
    const imagemBase64 = await chamarTryOn();
    await logApiCost(request.auth.uid, "try-on", 0.05);
    return { sucesso: true, imagemGerada: `data:image/jpeg;base64,${imagemBase64}` };
 
  } catch (error) {
    console.error("Erro em gerarTryOn:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", `Erro no Try-On: ${error.message || "Erro desconhecido"}`);
  }
});
 
exports.gerar360View = onCall({
  memory: "2GiB",
  timeoutSeconds: 300,
  region: "us-central1",
  cors: true,
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Você deve estar logado.");
 
  try {
    const { frontImageB64, sideImageB64, backImageB64, clothingImageB64, category, clothingBackImageB64 } = request.data;
 
    if (!sideImageB64 || !backImageB64 || !clothingImageB64) {
      throw new HttpsError("invalid-argument", "Imagens de Lado, Costas e Roupa são obrigatórias.");
    }
 
    const accessToken = await getAccessToken();
 
    const chamarVertexAI = async (personImageB64, label, customClothingB64 = null, retryCount = 0) => {
      if (!personImageB64) return null;
      const pessoaLimpa = limparBase64(personImageB64);
      const roupaLimpa = limparBase64(customClothingB64 || clothingImageB64);
      if (!pessoaLimpa || !roupaLimpa) throw new Error(`Imagem inválida no ângulo ${label}`);
 
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [{
              personImage: { image: { bytesBase64Encoded: pessoaLimpa } },
              productImages: [{ image: { bytesBase64Encoded: roupaLimpa } }]
            }],
            // ✅ Mesmos parâmetros otimizados no 360
            parameters: getParametros()
          }),
        });
 
        const resJson = JSON.parse(await response.text());
        if (!response.ok) {
          if ((response.status === 429 || response.status === 503 || response.status === 500) && retryCount < 2) {
            await new Promise(r => setTimeout(r, 8000));
            return chamarVertexAI(personImageB64, label, customClothingB64, retryCount + 1);
          }
          throw new Error(resJson.error?.message || `Erro ${response.status}`);
        }
 
        const prediction =
          resJson.predictions?.[0]?.image?.bytesBase64Encoded ||
          resJson.predictions?.[0]?.bytesBase64Encoded ||
          resJson.predictions?.[0]?.bytes_base64_encoded;
 
        if (!prediction) {
          if (retryCount < 2) { await new Promise(r => setTimeout(r, 8000)); return chamarVertexAI(personImageB64, label, customClothingB64, retryCount + 1); }
          throw new Error(`Sem imagem gerada para ${label}.`);
        }
        return `data:image/jpeg;base64,${prediction}`;
      } catch (err) {
        if (retryCount < 2) { await new Promise(r => setTimeout(r, 8000)); return chamarVertexAI(personImageB64, label, customClothingB64, retryCount + 1); }
        throw err;
      }
    };
 
    const imgFrente = frontImageB64;
    const [imgLateral, imgCostas] = await Promise.all([
      chamarVertexAI(sideImageB64, "lateral"),
      new Promise(resolve => setTimeout(resolve, 3000)).then(() =>
        chamarVertexAI(backImageB64, "costas", clothingBackImageB64)
      )
    ]);
 
    await logApiCost(request.auth.uid, "360", 0.15);
    return { sucesso: true, imagens: [imgFrente, imgLateral, imgCostas] };
 
  } catch (error) {
    console.error("Erro 360:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", `Erro no 360: ${error.message || "Erro desconhecido"}`);
  }
});
 
exports.liberarCreditosDiarios = onRequest({ region: "us-central1", cors: true }, async (req, res) => {
  try {
    const db = admin.firestore();
    const agora = new Date();
    const usuarios = await db.collection('users').get();
    let totalLiberados = 0;

    for (const doc of usuarios.docs) {
      const dados = doc.data();
      const schedule = dados.creditSchedule;
      if (!schedule || !Array.isArray(schedule)) continue;

      let creditosParaLiberar = 0;
      let scheduleAtualizado = false;
      const novoSchedule = schedule.map(item => {
        if (!item.released && new Date(item.releaseDate) <= agora) {
          creditosParaLiberar += item.credits;
          scheduleAtualizado = true;
          return { ...item, released: true, releasedAt: agora.toISOString() };
        }
        return item;
      });

      if (scheduleAtualizado && creditosParaLiberar > 0) {
        await doc.ref.update({
          credits: admin.firestore.FieldValue.increment(creditosParaLiberar),
          creditsReleased: admin.firestore.FieldValue.increment(creditosParaLiberar),
          creditSchedule: novoSchedule,
          pendingCredits: creditosParaLiberar,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        totalLiberados += creditosParaLiberar;
      }
    }

    return res.status(200).json({ success: true, totalLiberados });
  } catch (error) {
    console.error('Erro ao liberar créditos:', error);
    return res.status(500).json({ error: error.message });
  }
});

exports.webhookCakto = onRequest({ region: "us-central1", cors: true }, async (req, res) => {
  try {
    const { event, data } = req.body;
    if (event !== 'purchase_approved') return res.status(200).send('Ignored');
    const { customer, amount, status, id: orderId, external_id } = data;
    const email = customer?.email?.toLowerCase().trim();
    if (!email || status !== 'paid') return res.status(400).send('Invalid data');
    const valor = parseFloat(String(amount).replace(',', '.'));

    // Define plano e cronograma de liberação
    let creditosTotal, creditosImediatos, cronograma, plano;

    if (valor >= 29.80) {
      plano = 'Premium';
      creditosTotal = 300;
      creditosImediatos = 100;
      cronograma = [
        { dia: 2, creditos: 70 },
        { dia: 4, creditos: 70 },
        { dia: 6, creditos: 60 }
      ];
    } else {
      plano = 'Basic';
      creditosTotal = 100;
      creditosImediatos = 40;
      cronograma = [
        { dia: 2, creditos: 30 },
        { dia: 4, creditos: 30 }
      ];
    }

    const now = new Date();

    const db = admin.firestore();
    let userRef;
    if (external_id) {
      userRef = db.collection('users').doc(external_id);
    } else {
      const snapshot = await db.collection('users').where('email', '==', email).get();
      userRef = !snapshot.empty ? snapshot.docs[0].ref : db.collection('users').doc();
    }
    const purchaseData = {
      email,
      credits: admin.firestore.FieldValue.increment(creditosImediatos),
      totalPurchased: admin.firestore.FieldValue.increment(creditosTotal),
      creditsReleased: admin.firestore.FieldValue.increment(creditosImediatos),
      lastPurchasePlan: plano,
      lastPurchaseAmount: valor,
      lastPurchaseCredits: creditosTotal,
      lastPurchaseDate: admin.firestore.FieldValue.serverTimestamp(),
      subscriptionStartDate: now.toISOString(),
      subscriptionTier: plano.toLowerCase(),
      subscriptionExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Cronograma de liberação futura
      creditSchedule: cronograma.map(item => ({
        releaseDate: new Date(now.getTime() + item.dia * 24 * 60 * 60 * 1000).toISOString(),
        credits: item.creditos,
        released: false,
        notified: false
      }))
    };
    await userRef.set(purchaseData, { merge: true });
    await db.collection('transactions').add({
      userId: userRef.id, email, amount: valor, credits: creditosTotal,
      plan: plano, orderId, date: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).send(error.message);
  }
});
 
exports.salvarImagemStorage = onCall({ memory: "1GiB", region: "us-central1", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login necessário.");
  try {
    const { imagemBase64, userId } = request.data;
    if (!imagemBase64 || !userId) throw new HttpsError("invalid-argument", "Dados incompletos.");
    const bucket = admin.storage().bucket();
    const nomeArquivo = `looks/${userId}/${Date.now()}.jpg`;
    const arquivo = bucket.file(nomeArquivo);
    const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await arquivo.save(buffer, { metadata: { contentType: 'image/jpeg' } });
    const urlPublica = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(nomeArquivo)}?alt=media`;
    return { sucesso: true, url: urlPublica };
  } catch (error) {
    console.error('Storage Error:', error);
    throw new HttpsError('internal', error.message);
  }
});
 
exports.enviarEmailBoasVindas = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { email } = req.body;
  if (!email) return res.status(400).send('Email is required');
  try {
    console.log(`Email de boas-vindas para: ${email}`);
    return res.status(200).json({ sucesso: true, mensagem: 'Email enviado (simulado)' });
  } catch (error) {
    return res.status(500).json({ sucesso: false, erro: error.message });
  }
});