import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { serverConfig } from './config.js';
import { defineApp, registerApp } from './app/index.js';
import { healthRouter } from './routers/health.router.js';
import { authRouter } from './routers/auth.router.js';
import { errorMiddleware } from './middlewares/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = serverConfig.PORT;

app.use(cors({ origin: serverConfig.CORS_ORIGIN }));
app.use(express.json());

const appDefinition = defineApp([
  healthRouter,
  authRouter,
] as const);

registerApp(app, appDefinition);
app.use(errorMiddleware);

app.listen(PORT, () => {
  console.log(`[back] Server running on http://localhost:${PORT}`);
});
