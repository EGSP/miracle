import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
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
import { logger } from './logger/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = serverConfig.PORT;

app.use(cors({ origin: serverConfig.CORS_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json());

const appDefinition = defineApp([
  healthRouter,
  authRouter,
  sessionRouter,
  userRouter,
] as const);

registerApp(app, appDefinition);
app.use(errorMiddleware);

app.listen(PORT, () => {
  logger.info(`[back] Server running on http://localhost:${PORT}`);
  logger.info(`Access token lifetime: ${serverConfig.ACCESS_TOKEN_LIFETIME} (ms: ${serverConfig.ACCESS_TOKEN_LIFETIME_MS})`);
  logger.info(`Refresh token lifetime: ${serverConfig.REFRESH_TOKEN_LIFETIME} (ms: ${serverConfig.REFRESH_TOKEN_LIFETIME_MS})`);
});
