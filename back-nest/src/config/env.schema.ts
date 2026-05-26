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
    DB_DIR: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;
