import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

    get dbDir(): string | undefined {
        return this.config.get('DB_DIR', { infer: true });
    }
}
