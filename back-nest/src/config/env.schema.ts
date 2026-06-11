import { z } from 'zod';

export const envSchema = z.object({
    PORT: z.coerce.number().default(3001),
    CORS_OPEN: z.coerce.boolean().default(false),
    CORS_ORIGIN: z.string().default('http://localhost:8081'),
    ACCESS_TOKEN_LIFETIME: z.string().default('15m'),
    REFRESH_TOKEN_LIFETIME: z.string().default('7d'),
    /**
     * Дефолты повторяют back/src/config.ts — нужны для совместимости с уже выпущенными
     * cookies на dev-окружении. В production обязательно перекрыть через .env.
     */
    ACCESS_TOKEN_SECRET: z.string().min(1).default('access_token_secret'),
    REFRESH_TOKEN_SECRET: z.string().min(1).default('refresh_token_secret'),
    DATABASE_URL: z.string().min(1),
    // Директория для загружаемых файлов. По умолчанию — <cwd>/uploads.
    UPLOADS_DIR: z.string().optional(),
    /**
     * Yandex Cloud — опциональны на старте: приложение поднимается без них, но Job, использующие
     * Yandex (OCR/LLM/Vision), упадут с понятной ошибкой при первом обращении (см. YandexService).
     */
    YANDEX_CLOUD_API_KEY: z.string().optional(),
    YANDEX_CLOUD_FOLDER_ID: z.string().optional(),
    /** Базовый URL REST-сервиса Kreuzberg (Docker). */
    KREUZBERG_URL: z.string().url().default('http://localhost:8000'),
    /** Лимит одновременных HTTP-запросов к kreuzberg (Фаза 2+). */
    DPS_MAX_CONCURRENCY: z.coerce.number().int().positive().default(4),
});

export type EnvConfig = z.infer<typeof envSchema>;
