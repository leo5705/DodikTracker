import 'dotenv/config';
import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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

  // Trust proxy for reverse proxy environments (Cloud Run, Nginx, AI Studio proxy)
  app.set('trust proxy', 1);

  // Security Headers (configured to allow Vite in dev and external images)
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled to prevent breaking Vite HMR and inline styles/scripts without complex setup
    crossOriginEmbedderPolicy: false,
  }));

  // General Rate Limiter (very lenient)
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      trustProxy: false,
      xForwardedForHeader: false,
      forwardedHeader: false,
    },
  });
  app.use('/api', generalLimiter);

  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

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

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
