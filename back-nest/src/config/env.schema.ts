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
     * Yandex Cloud — авторизованный ключ сервис-аккаунта (IAM). Опциональны на старте: приложение
     * поднимается без них, но Job/биллинг, использующие Yandex, упадут с понятной ошибкой при первом
     * обращении (см. YandexAuthService). Поля соответствуют скачанному `authorized_key.json`:
     *   YANDEX_CLOUD_IAM_ID         ← `id`                 (идентификатор ключа, kid в JWT)
     *   YANDEX_CLOUD_IAM_SERVICE_ID ← `service_account_id` (идентификатор сервис-аккаунта, iss в JWT)
     *   YANDEX_CLOUD_IAM_PRIVATE_KEY← `private_key`        (PEM PKCS8; `\n` экранируются в одну строку)
     */
    YANDEX_CLOUD_IAM_ID: z.string().optional(),
    YANDEX_CLOUD_IAM_SERVICE_ID: z.string().optional(),
    YANDEX_CLOUD_IAM_PRIVATE_KEY: z.string().optional(),
    YANDEX_CLOUD_FOLDER_ID: z.string().optional(),
    /**
     * ID биллинг-аккаунта Yandex Cloud для виджета баланса. Опционален: если не задан,
     * {@link YandexBillingService} берёт первый доступный аккаунт через `BillingAccountService.List`.
     */
    YANDEX_CLOUD_BILLING_ACCOUNT_ID: z.string().optional(),
    /** Базовый URL REST-сервиса Kreuzberg (Docker). */
    KREUZBERG_URL: z.string().url().default('http://localhost:8000'),
    /** Базовый URL сервиса конвертации legacy .doc → .docx (Docker, LibreOffice unoserver REST). */
    LIBREOFFICE_CONVERT_URL: z.string().url().default('http://localhost:2004'),
    /**
     * Лимит одновременных конвертаций .doc → .docx. unoserver обрабатывает один файл за раз и без
     * балансировки — по умолчанию 1. Поднимать только при нескольких репликах конвертера.
     */
    LIBREOFFICE_CONVERT_MAX_CONCURRENCY: z.coerce.number().int().positive().default(1),
    /** Лимит одновременных HTTP-запросов к kreuzberg. */
    DPS_MAX_CONCURRENCY: z.coerce.number().int().positive().default(4),
    /**
     * Включает LLM Vision-разметку VISUAL-файлов (Yandex). По умолчанию ВЫКЛ: vision-джоба
     * помечает запрос ошибкой, автоматическая разметка не идёт. Для включения — `=true`.
     */
    LLM_VISION_ENABLED: z.coerce.boolean().default(false),
    /**
     * Глобальный лимит одновременных запросов к Yandex AI (поверх rate-лимитеров).
     * Yandex отклоняет более ~10 параллельных запросов; держим запас.
     */
    YANDEX_MAX_CONCURRENCY: z.coerce.number().int().positive().default(8),
});

export type EnvConfig = z.infer<typeof envSchema>;
