import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { TokensService } from '../tokens/tokens.service.js';

type AuthSuccessResponse = { status: 'success' };

@Controller('auth')
export class AuthController {
    constructor(
        private readonly auth: AuthService,
        private readonly tokens: TokensService,
    ) {}

    @Post('login')
    login(
        @Body() dto: LoginDto,
        @Res({ passthrough: true }) reply: FastifyReply,
    ): Promise<AuthSuccessResponse> {
        return this.auth.login(dto, reply);
    }

    @Post('register')
    register(@Body() dto: RegisterDto): Promise<AuthSuccessResponse> {
        return this.auth.register(dto);
    }

    @Post('refresh-tokens')
    refreshTokens(
        @Req() req: FastifyRequest,
        @Res({ passthrough: true }) reply: FastifyReply,
    ): Promise<AuthSuccessResponse> {
        const { refreshToken } = this.tokens.extractFromCookies(req.cookies);
        return this.auth.refreshTokens(refreshToken, reply);
    }

    @Post('logout')
    logout(@Res({ passthrough: true }) reply: FastifyReply): AuthSuccessResponse {
        return this.auth.logout(reply);
    }
}
