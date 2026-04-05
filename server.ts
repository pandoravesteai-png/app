import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // CSP Header for Cloud Run
  app.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy-Report-Only',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://*.google.com https://*.gstatic.com https://*.googleapis.com https://*.firebaseapp.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: blob: https://*.google.com https://*.gstatic.com https://*.googleapis.com https://*.firebaseapp.com https://picsum.photos; " +
      "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com wss://*.run.app; " +
      "frame-src 'self' https://*.google.com https://*.firebaseapp.com; " +
      "worker-src 'self' blob:;"
    );
    next();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
