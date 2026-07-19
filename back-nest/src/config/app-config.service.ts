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

    /** Идентификатор авторизованного ключа сервис-аккаунта (поле `id`, идёт в `kid` JWT). */
    get yandexIamKeyId(): string | undefined {
        return this.config.get('YANDEX_CLOUD_IAM_ID', { infer: true });
    }

    /** Идентификатор сервис-аккаунта (поле `service_account_id`, идёт в `iss` JWT). */
    get yandexServiceAccountId(): string | undefined {
        return this.config.get('YANDEX_CLOUD_IAM_SERVICE_ID', { infer: true });
    }

    /**
     * Приватный ключ сервис-аккаунта (поле `private_key`). В `.env` переносы обычно экранированы
     * как `\n`; преамбулу `PLEASE DO NOT REMOVE THIS LINE! …` можно оставлять — для jose её срезает
     * {@link YandexAuthService}, исходное значение отдаёт {@link YandexAuthService.getRawPrivateKey}.
     */
    get yandexPrivateKey(): string | undefined {
        return this.config.get('YANDEX_CLOUD_IAM_PRIVATE_KEY', { infer: true });
    }

    get yandexFolderId(): string | undefined {
        return this.config.get('YANDEX_CLOUD_FOLDER_ID', { infer: true });
    }

    /** ID биллинг-аккаунта Yandex Cloud для виджета баланса (опционально). */
    get yandexBillingAccountId(): string | undefined {
        return this.config.get('YANDEX_CLOUD_BILLING_ACCOUNT_ID', { infer: true });
    }

    /** Базовый URL REST-сервиса Kreuzberg. */
    get kreuzbergUrl(): string {
        return this.config.get('KREUZBERG_URL', { infer: true });
    }

    /** Базовый URL сервиса конвертации legacy .doc → .docx (LibreOffice headless). */
    get libreofficeConvertUrl(): string {
        return this.config.get('LIBREOFFICE_CONVERT_URL', { infer: true });
    }

    /** Лимит одновременных конвертаций .doc → .docx (unoserver — один файл за раз). */
    get libreofficeConvertMaxConcurrency(): number {
        return this.config.get('LIBREOFFICE_CONVERT_MAX_CONCURRENCY', { infer: true });
    }

    /** Лимит одновременных HTTP-запросов к kreuzberg. */
    get dpsMaxConcurrency(): number {
        return this.config.get('DPS_MAX_CONCURRENCY', { infer: true });
    }

    /** Включена ли LLM Vision-разметка VISUAL-файлов (Yandex). По умолчанию выключена. */
    get llmVisionEnabled(): boolean {
        return this.config.get('LLM_VISION_ENABLED', { infer: true });
    }

    /** Глобальный лимит одновременных запросов к Yandex AI (поверх rate-лимитеров). */
    get yandexMaxConcurrency(): number {
        return this.config.get('YANDEX_MAX_CONCURRENCY', { infer: true });
    }
}
