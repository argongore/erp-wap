import express from 'express';
import { apiRouter } from './routes.ts';
import { dbManager } from './db.ts';
import { supabaseSyncEngine } from './supabase.ts';

const app = express();

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

const sendHealth = (_req: express.Request, res: express.Response) => {
  res.json({
    status: 'ok',
    app: 'ERP Wijaya Agro',
    mode: 'vercel-serverless',
    singleSource: supabaseSyncEngine.isConfigured() ? 'SUPABASE_CLOUD' : 'LOCAL_READY',
    timestamp: new Date().toISOString(),
  });
};

app.get('/api/health', sendHealth);
app.get('/health', sendHealth);

// Ensure latest Cloud Supabase snapshot is hydrated before serving any /api request
app.use(async (_req, _res, next) => {
  try {
    await supabaseSyncEngine.ensureFreshCloudState(dbManager, 3500);
    next();
  } catch (err) {
    next(err);
  }
});

// Mount on both /api and / so Vercel rewrites work regardless of prefix stripping
app.use('/api', apiRouter);
app.use('/', apiRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint API tidak ditemukan: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  const status = typeof err?.status === 'number' ? err.status : 500;
  res.status(status).json({
    success: false,
    message: err?.message || 'Terjadi kesalahan internal pada server API',
  });
});

export default function handler(req: any, res: any) {
  return app(req, res);
}
