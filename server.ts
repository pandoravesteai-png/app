import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!admin.apps.length) {
  admin.initializeApp();
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  // Serve a imagem gerada direto do Firestore
  app.get('/img/:shareId', async (req, res) => {
    try {
      const snap = await admin.firestore().collection('shares').doc(req.params.shareId).get();
      if (!snap.exists) return res.status(404).send('Not found');
      const { imageBase64 } = snap.data();
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const buffer = Buffer.from(base64Data, 'base64');
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
    } catch (err) {
      res.status(500).send('Error');
    }
  });

  // Página com OG tags para o WhatsApp mostrar a miniatura
  app.get('/share', async (req, res) => {
    const shareId = req.query.id;
    const destUrl = 'https://pandoraquizai.netlify.app/';
    if (!shareId) return res.redirect(destUrl);
    const serverUrl = req.protocol + '://' + req.get('host');
    const imageUrl = serverUrl + '/img/' + shareId;
    const pageUrl = serverUrl + '/share?id=' + shareId;
    res.set('Cache-Control', 'no-store');
    res.send('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta property="og:site_name" content="Pandora AI"><meta property="og:type" content="website"><meta property="og:url" content="' + pageUrl + '"><meta property="og:title" content="Olha como essa peça ficou em mim! ✨👗"><meta property="og:description" content="Experimentei a Pandora AI e ficou incrível! Tente você também."><meta property="og:image" content="' + imageUrl + '"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="600"><meta property="og:image:height" content="800"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="' + imageUrl + '"><title>Pandora AI</title><script>setTimeout(function(){window.location.href="' + destUrl + '"},800)</script></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f3e8ff"><div style="text-align:center"><div style="font-size:48px">✨</div><p style="color:#6A00F4;font-weight:bold;font-size:18px">Abrindo Pandora AI...</p></div></body></html>');
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => console.log('Server running on port ' + PORT));
}

startServer();
