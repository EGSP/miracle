import ms from 'ms';
import type { StringValue } from 'ms';

export type ServerConfig = {

    PORT: number;
    CORS_ORIGINS: string[];

    ACCESS_TOKEN_LIFETIME: string;
    REFRESH_TOKEN_LIFETIME: string;
    ACCESS_TOKEN_LIFETIME_MS: number;
    REFRESH_TOKEN_LIFETIME_MS: number;
    ACCESS_TOKEN_SECRET: string;
    REFRESH_TOKEN_SECRET: string;
}

const ACCESS_TOKEN_LIFETIME = (process.env.ACCESS_TOKEN_LIFETIME ?? '15m') as StringValue;
const REFRESH_TOKEN_LIFETIME = (process.env.REFRESH_TOKEN_LIFETIME ?? '7d') as StringValue;

export const serverConfig: ServerConfig = {
    PORT: Number(process.env.PORT ?? 3001),
    CORS_ORIGINS: (process.env.CORS_ORIGIN ?? 'http://localhost:8081')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean),
    
    ACCESS_TOKEN_LIFETIME,
    REFRESH_TOKEN_LIFETIME,
    ACCESS_TOKEN_LIFETIME_MS: ms(ACCESS_TOKEN_LIFETIME),
    REFRESH_TOKEN_LIFETIME_MS: ms(REFRESH_TOKEN_LIFETIME),
    ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET ?? 'access_token_secret',
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET ?? 'refresh_token_secret',
}