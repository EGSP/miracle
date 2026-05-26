import { Module, forwardRef } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module.js';
import { TokensModule } from '../tokens/tokens.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Module({
    imports: [TokensModule, forwardRef(() => SessionsModule)],
    controllers: [AuthController],
    providers: [AuthService, AuthGuard],
    exports: [AuthGuard],
})
export class AuthModule {}
