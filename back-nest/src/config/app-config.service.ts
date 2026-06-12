import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import path from 'path';
import ms from 'ms';
import type { StringValue } from 'ms';
import type { EnvConfig } from './env.schema.js';

@Injectable()
export class AppConfigService {
    constructor(private readonly config: ConfigService<EnvConfig, true>) {}

    get port(): number {
        return this.config.get('PORT', { infer: true });
    }

    get corsOpen(): boolean {
        return this.config.get('CORS_OPEN', { infer: true });
    }

    get corsOrigins(): string[] {
        return this.config
            .get('CORS_ORIGIN', { infer: true })
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }

    get accessTokenSecret(): string {
        return this.config.get('ACCESS_TOKEN_SECRET', { infer: true });
    }

    get refreshTokenSecret(): string {
        return this.config.get('REFRESH_TOKEN_SECRET', { infer: true });
    }

    get accessTokenLifetime(): string {
        return this.config.get('ACCESS_TOKEN_LIFETIME', { infer: true });
    }

    get refreshTokenLifetime(): string {
        return this.config.get('REFRESH_TOKEN_LIFETIME', { infer: true });
    }

    get accessTokenLifetimeMs(): number {
        return ms(this.accessTokenLifetime as StringValue);
    }

    get refreshTokenLifetimeMs(): number {
        return ms(this.refreshTokenLifetime as StringValue);
    }

    get databaseUrl(): string {
        return this.config.get('DATABASE_URL', { infer: true });
    }

    /** Директория для хранения загружаемых файлов. */
    get uploadsDir(): string {
        const dir = this.config.get('UPLOADS_DIR', { infer: true });
        return dir ? path.resolve(dir) : path.resolve(process.cwd(), 'uploads');
    }

    get yandexApiKey(): string | undefined {
        return this.config.get('YANDEX_CLOUD_API_KEY', { infer: true });
    }

    get yandexFolderId(): string | undefined {
        return this.config.get('YANDEX_CLOUD_FOLDER_ID', { infer: true });
    }

    /** Базовый URL REST-сервиса Kreuzberg. */
    get kreuzbergUrl(): string {
        return this.config.get('KREUZBERG_URL', { infer: true });
    }

    /** Лимит одновременных HTTP-запросов к kreuzberg. */
    get dpsMaxConcurrency(): number {
        return this.config.get('DPS_MAX_CONCURRENCY', { infer: true });
    }

    /** Глобальный лимит одновременных запросов к Yandex AI (поверх rate-лимитеров). */
    get yandexMaxConcurrency(): number {
        return this.config.get('YANDEX_MAX_CONCURRENCY', { infer: true });
    }
}
