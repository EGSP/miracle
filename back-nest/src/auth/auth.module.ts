import { Module } from '@nestjs/common';
import { TokensService } from './tokens.service.js';
import { AuthGuard } from './auth.guard.js';

@Module({
    providers: [TokensService, AuthGuard],
    exports: [TokensService, AuthGuard],
})
export class AuthModule {}
