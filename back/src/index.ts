import './load-env.js'; // must be first — loads .env before any other module reads process.env
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { serverConfig } from './config.js';
import { defineApp, registerApp } from './app/index.js';
import { healthRouter } from './routers/health.router.js';
import { authRouter } from './routers/auth.router.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { sessionRouter } from './routers/session.router.js';
import { userRouter } from './routers/user.router.js';
import { fileRouter } from './routers/file.router.js';
import { logger } from './logger/logger.js';
import { orderRouter } from './routers/order.router.js';
import { filesContentRouter } from './routers/file-content.router.js';
import { workerPool } from './workers/worker-pool.js';
import { workersRouter } from './routers/workers.router.js';
import { productTypeRouter } from './routers/product-type.router.js';
import { adminRouter } from './routers/admin.router.js';

const app = express();
const PORT = serverConfig.PORT;

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser clients and same-origin calls without Origin header.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (serverConfig.CORS_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

const appDefinition = defineApp([
  healthRouter,
  authRouter,
  sessionRouter,
  userRouter,
  filesContentRouter,
  fileRouter,
  orderRouter,
  workersRouter,
  productTypeRouter,
  adminRouter,
] as const);

registerApp(app, appDefinition);
app.use(errorMiddleware);

try {
  await workerPool.restore();

  app.listen(PORT, () => {
    logger.info(`[back] Сервер запущен на http://localhost:${PORT}`);
    logger.info(`Время жизни access-токена: ${serverConfig.ACCESS_TOKEN_LIFETIME} (мс: ${serverConfig.ACCESS_TOKEN_LIFETIME_MS})`);
    logger.info(`Время жизни refresh-токена: ${serverConfig.REFRESH_TOKEN_LIFETIME} (мс: ${serverConfig.REFRESH_TOKEN_LIFETIME_MS})`);
    console.log('[VSCode Hook] Attach Debugger');
  });
} catch (error) {
  logger.error(`[back] Не удалось запустить сервер: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
