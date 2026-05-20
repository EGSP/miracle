import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { parseEnv } from './env.js';
import { banner, fatal, info, step, success, summary, warn } from './logger.js';
import { detectLanIp } from './steps/detect-ip.js';
import { validateEnv } from './steps/validate.js';
import { buildBack, buildFront } from './steps/build.js';
import { genPm2Config } from './steps/gen-pm2.js';
import { startPm2 } from './steps/start-pm2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// tools/src/deploy/ → ../../.. → project root
const ROOT = resolve(__dirname, '../../..');

async function deploy(): Promise<void> {
    banner('miracle — деплой');

    // ── Шаг 1: Определение IP ───────────────────────────────────────────────
    step('Определение IP');
    const lanIp = detectLanIp();
    if (lanIp) {
        success(`LAN IP: ${lanIp}`);
    } else {
        warn('Не удалось определить LAN IP — продолжаем без него');
    }

    // ── Шаг 2: Проверка окружения ───────────────────────────────────────────
    step('Проверка окружения');
    let env;
    try {
        env = parseEnv(ROOT);
    } catch (err) {
        fatal(err instanceof Error ? err.message : String(err));
    }

    info(`PORT=${env.PORT}  VITE_PORT=${env.VITE_PORT}  NODE_ENV=${env.NODE_ENV}`);
    info(`CORS_ORIGIN=${env.CORS_ORIGIN}`);
    info(`VITE_API_URL=${env.VITE_API_URL}`);

    validateEnv(env);
    success('Конфигурация прочитана');

    // ── Шаг 3: Сборка бекенда ───────────────────────────────────────────────
    step('Сборка бекенда');
    buildBack(ROOT);
    success('Бекенд собран');

    // ── Шаг 4: Сборка фронтенда ─────────────────────────────────────────────
    step('Сборка фронтенда');
    buildFront(ROOT);
    success('Фронтенд собран');

    // ── Шаг 5: Генерация конфига PM2 ─────────────────────────────────────────
    step('Генерация конфига PM2');
    genPm2Config(env, ROOT);

    // ── Шаг 6: Запуск PM2 ───────────────────────────────────────────────────
    step('Запуск PM2');
    startPm2(ROOT);
    success('Приложение запущено');

    // ── Итог ─────────────────────────────────────────────────────────────────
    banner('Деплой завершён');

    summary([
        ['Фронтенд', `http://localhost:${env.VITE_PORT}`],
        ['Бекенд',   `http://localhost:${env.PORT}`],
    ]);

    console.log('');
}

deploy().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
});
