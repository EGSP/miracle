import { err } from "../app/index.js";
import { defineRouter, route } from "../app/router.js";
import { sessionsService } from "../databases/session.db.js";
import { userService } from "../databases/user.db.js";
import { logger } from "../logger/logger.js";
import { USER_ROLES } from "@miracle/types";
import { PASSWORD, signTokens, TOKENS } from "../middlewares/tokensTools.js";
import type { Response } from "express";

type LoginDTO = {
    login: string;
    password: string;
}

type LoginResponse = {
    status: 'success';
}

const login =
    route.post('/login', async ({ body, res }: { body: LoginDTO, res: Response }) => {
        const { login, password } = body;
        if (!login) {
            return err.validation('Login is required');
        }
        if (!password) {
            return err.validation('Password is required');
        }

        const user = await userService.getByLogin(login);
        if (!user || !user.id) {
            return err.notFound(`User "${login}" not found`);
        }

        const isPasswordValid = await userService.verifyPassword(user, password);
        if (!isPasswordValid) {
            return err.unauthorized('Invalid login or password');
        }

        const tokens = await sessionsService.createSession(user.id);
        logger.info(`[auth] User "${user.login}" logged in. Tokens: ${tokens.accessToken}, ${tokens.refreshToken}`);
        TOKENS.setCookies(res, tokens);

        return { status: 'success' } satisfies LoginResponse;
    });

type RefreshTokensResponse = {
    status: 'success';
}

const refreshTokens = route.post('/refresh-tokens', async ({ cookies, res }: { cookies: unknown, res: Response }) => {
    const { refreshToken } = TOKENS.extractFromCookies(cookies);
    if (!refreshToken) {
        return err.unauthorized('Refresh token is required');
    }

    const session = await sessionsService.getByRefreshToken(refreshToken);
    if (!session || !session.id) {
        return err.unauthorized('Invalid refresh token');
    }

    const accessToken = await signTokens({ sub: session.userId });
    await sessionsService.updateSession(session.id, accessToken.accessToken, refreshToken);
    TOKENS.setCookies(res, { accessToken: accessToken.accessToken, refreshToken: refreshToken });

    logger.info(`[auth] User "${session.userId}" refreshed tokens. Tokens: ${accessToken.accessToken}, ${refreshToken}`);
    return { status: 'success' } satisfies RefreshTokensResponse;
});

type RegisterDTO = {
    login: string;
    password: string;
}

type RegisterResponse = {
    status: 'success';
}

const register = route.post('/register', async ({ body }: { body: RegisterDTO }) => {
    const { login, password } = body;
    if (!login) {
        return err.validation('Login is required');
    }
    if (!password) {
        return err.validation('Password is required');
    }

    const existingUser = await userService.getByLogin(login);
    if (existingUser) {
        return err.conflict(`Login "${login}" is already taken`);
    }

    await userService.create({ login, password, role: USER_ROLES.EMPLOYEE });
    return { status: 'success' } satisfies RegisterResponse;
});

type LogoutResponse = {
    status: 'success';
}

const logout = route.post('/logout', async ({ res }: { res: Response }) => {
    TOKENS.clearCookies(res);
    return { status: 'success' } satisfies LogoutResponse;
});

export const authRouter = defineRouter('/auth', [
    login,
    refreshTokens,
    register,
    logout,
] as const);