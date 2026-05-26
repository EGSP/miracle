import {
    ConflictException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { USER_ROLES } from '@miracle/types';
import type { FastifyReply } from 'fastify';
import { DatabaseService } from '../database/database.service.js';
import type { UserInternal } from '../database/collections.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { TokensService } from '../tokens/tokens.service.js';

type AuthSuccessResponse = { status: 'success' };

@Injectable()
export class AuthService {
    constructor(
        private readonly db: DatabaseService,
        private readonly tokens: TokensService,
        private readonly sessions: SessionsService,
    ) {}

    async login(dto: LoginDto, reply: FastifyReply): Promise<AuthSuccessResponse> {
        const user = this.getInternalByLogin(dto.login);
        if (!user?.id) {
            throw new NotFoundException(`User "${dto.login}" not found`);
        }

        const isPasswordValid = await this.tokens.verifyPassword(
            dto.password,
            user.password,
        );
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid login or password');
        }

        const tokenPair = await this.sessions.createSession(user.id);
        this.tokens.setCookies(reply, tokenPair);
        return { status: 'success' };
    }

    async register(dto: RegisterDto): Promise<AuthSuccessResponse> {
        if (this.getInternalByLogin(dto.login)) {
            throw new ConflictException(`Login "${dto.login}" is already taken`);
        }

        const hashedPassword = await this.tokens.hashPassword(dto.password);
        await this.db.collections.users.create({
            login: dto.login,
            password: hashedPassword,
            role: USER_ROLES.EMPLOYEE,
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

        const session = this.sessions.getByRefreshToken(refreshToken);
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

    logout(reply: FastifyReply): AuthSuccessResponse {
        this.tokens.clearCookies(reply);
        return { status: 'success' };
    }

    private getInternalByLogin(login: string): UserInternal | undefined {
        return this.db.collections.users
            .ref()
            .find((user) => user.login === login);
    }
}
