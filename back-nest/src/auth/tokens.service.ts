import { Injectable } from '@nestjs/common';
import { jwtVerify, errors } from 'jose';
import type { JwtPayload } from '@miracle/types';
import { AppConfigService } from '../config/app-config.service.js';

export type VerifyResult = JwtPayload | 'expired' | 'invalid';

@Injectable()
export class TokensService {
    constructor(private readonly config: AppConfigService) {}

    async verifyAccessToken(token: string | undefined): Promise<VerifyResult> {
        if (!token) return 'invalid';
        try {
            const secret = new TextEncoder().encode(this.config.accessTokenSecret);
            const result = await jwtVerify(token, secret);
            return result.payload as JwtPayload;
        } catch (error) {
            if (error instanceof errors.JWTExpired) return 'expired';
            return 'invalid';
        }
    }
}
