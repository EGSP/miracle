import {
    ConflictException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { USER_ROLES } from '@miracle/types';
import type { FastifyReply } from 'fastify';
import { PrismaService } from '../database/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { TokensService } from '../tokens/tokens.service.js';

type AuthSuccessResponse = { status: 'success' };

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly tokens: TokensService,
        private readonly sessions: SessionsService,
    ) {}

    async login(dto: LoginDto, reply: FastifyReply): Promise<AuthSuccessResponse> {
        const user = await this.prisma.user.findFirst({ where: { login: dto.login } });
        if (!user?.id) {
            throw new NotFoundException(`User "${dto.login}" not found`);
        }
        if (!user.password) {
            throw new UnauthorizedException('Invalid login or password');
        }

        const isPasswordValid = await this.tokens.verifyPassword(dto.password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid login or password');
        }

        const tokenPair = await this.sessions.createSession(user.id);
        this.tokens.setCookies(reply, tokenPair);
        return { status: 'success' };
    }

    async register(dto: RegisterDto): Promise<AuthSuccessResponse> {
        const existing = await this.prisma.user.findFirst({ where: { login: dto.login } });
        if (existing) {
            throw new ConflictException(`Login "${dto.login}" is already taken`);
        }

        const hashedPassword = await this.tokens.hashPassword(dto.password);
        await this.prisma.user.create({
            data: {
                login: dto.login,
                password: hashedPassword,
                role: USER_ROLES.EMPLOYEE,
            },
        });
        return { status: 'success' };
    }

    async refreshTokens(
        refreshToken: string | undefined,
        reply: FastifyReply,
    ): Promise<AuthSuccessResponse> {
        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token is required');
        }

        const session = await this.sessions.getByRefreshToken(refreshToken);
        if (!session) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const tokenPair = await this.tokens.signTokens({ sub: session.userId });
        await this.sessions.updateSession(
            session.id,
            tokenPair.accessToken,
            refreshToken,
        );
        this.tokens.setCookies(reply, {
            accessToken: tokenPair.accessToken,
            refreshToken,
        });
        return { status: 'success' };
    }

    async logout(
        refreshToken: string | undefined,
        reply: FastifyReply,
    ): Promise<AuthSuccessResponse> {
        if (refreshToken) {
            await this.sessions.deleteByRefreshToken(refreshToken);
        }
        this.tokens.clearCookies(reply);
        return { status: 'success' };
    }
}
