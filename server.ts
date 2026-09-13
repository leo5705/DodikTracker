import 'dotenv/config';
import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './src/server/api.ts';
import { telegramBot } from './src/server/telegram.ts';
import { initDbSettings } from './src/server/init.ts';
import { startMessageCleanupCron } from './src/server/services/messageCleanup.ts';

async function startServer() {
  await initDbSettings();

  // Start background services
  startMessageCleanupCron();

  const app = express();
  const PORT = 3000;
  const httpServer = http.createServer(app);

  app.use(cookieParser());
  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Dodik Tracker API' });
  });

  // Mount API router
  app.use('/api', apiRouter);

  // Fallback 404 for unhandled API endpoints so they never return HTML
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Vite middleware for development or static file serving for production
  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server: httpServer },
        watch: isHmrDisabled ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Dodik Tracker server running on http://0.0.0.0:${PORT}`);
    telegramBot.init().catch((err) => {
      console.error('[Telegram] Init error:', err);
    });
  });
}

startServer();
