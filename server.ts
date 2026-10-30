import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;
  const distPath = path.resolve(__dirname, 'dist');
  const distIndexPath = path.resolve(distPath, 'index.html');

  const isDevCommand =
    process.env.NODE_ENV === 'development' ||
    process.env.npm_lifecycle_event === 'dev';

  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start' ||
    (!isDevCommand && fs.existsSync(distIndexPath));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Lazy-initialize ERP backend modules asynchronously so HTTP port 3000 binds in <50ms
  let apiRouterInstance: express.Router | null = null;
  let supabaseConfiguredFlag = false;

  let supabaseEngineRef: { isConfigured: () => boolean } | null = null;

  const backendReadyPromise = (async () => {
    const [{ apiRouter }, { dbManager }, { supabaseSyncEngine }] = await Promise.all([
      import('./src/server/routes.ts'),
      import('./src/server/db.ts'),
      import('./src/server/supabase.ts'),
    ]);
    apiRouterInstance = apiRouter;
    supabaseEngineRef = supabaseSyncEngine;
    supabaseConfiguredFlag = supabaseSyncEngine.isConfigured();

    supabaseSyncEngine
      .initOnServerStart(dbManager)
      .then(() => {
        supabaseConfiguredFlag = supabaseSyncEngine.isConfigured();
      })
      .catch((err) => {
        console.warn('[SupabaseSyncEngine] Error during initOnServerStart:', err);
      });

    return { apiRouter, dbManager, supabaseSyncEngine };
  })();

  // Instant health check (responds immediately during cold start)
  app.get('/api/health', (_req, res) => {
    const isCloud = supabaseEngineRef ? supabaseEngineRef.isConfigured() : supabaseConfiguredFlag;
    res.json({
      status: 'ok',
      app: 'ERP Wijaya Agro',
      mode: isProduction ? 'production' : 'development',
      singleSource: isCloud ? 'SUPABASE_CLOUD' : 'LOCAL_READY',
      timestamp: new Date().toISOString(),
    });
  });

  // Ensure backend modules & fresh Cloud Supabase hydration settle before serving /api/* routes
  app.use('/api', async (req, res, next) => {
    try {
      const { dbManager, supabaseSyncEngine } = await backendReadyPromise;
      await supabaseSyncEngine.ensureFreshCloudState(dbManager, 4000);
      if (apiRouterInstance) {
        return apiRouterInstance(req, res, next);
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  // Strict JSON 404 catch-all for unmatched /api/* routes so they NEVER fall through to SPA index.html
  app.use('/api', (req, res) => {
    res.status(404).json({
      success: false,
      message: `Endpoint API tidak ditemukan: ${req.method} ${req.originalUrl}`,
    });
  });

  if (!isProduction) {
    // Development mode: attach Vite middleware lazily so port 3000 listens immediately
    let viteMiddleware: any = null;
    const viteInitPromise = import('vite')
      .then(({ createServer }) =>
        createServer({
          server: {
            middlewareMode: {
              server: httpServer,
            },
            ws: {
              server: httpServer,
            },
            hmr:
              process.env.DISABLE_HMR === 'true'
                ? false
                : {
                    server: httpServer,
                    overlay: false,
                  },
            watch:
              process.env.DISABLE_HMR === 'true'
                ? null
                : {
                    ignored: ['**/data/**', '**/dist/**'],
                  },
          },
          appType: 'spa',
        })
      )
      .then((vite) => {
        viteMiddleware = vite.middlewares;
      });

    app.use(async (req, res, next) => {
      try {
        if (!viteMiddleware) {
          await viteInitPromise;
        }
        return viteMiddleware(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    // Production mode: serve prebuilt static files from dist/
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexPath);
    });
  }

  // Global error handler — always return valid JSON for /api/* errors
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }
    if (req.originalUrl.startsWith('/api')) {
      const status = typeof err?.status === 'number' ? err.status : 500;
      return res.status(status).json({
        success: false,
        message: err?.message || 'Terjadi kesalahan internal pada server API',
      });
    }
    next(err);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[ERP Wijaya Agro] Server started on port ${PORT} (isProd: ${isProduction})`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
