import { User, type UserRole } from "@miracle/types";
import { defineRouter, route } from "../app/index.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { resolveUserRole } from "../lib/user-role.util.js";

type GetSessionResponse = {
    userId: string;
    role: UserRole;
}

const getCookieSession =
    route.get('/cookie', async ({ locals }: { locals: Record<string, unknown> }) => {
        const user = locals.user as User | undefined;
        if (!user?.id) {
            throw new Error('Authenticated user is missing in session context');
        }

        return {
            userId: user.id,
            role: resolveUserRole(user),
        } satisfies GetSessionResponse;
    });


export const sessionRouter = defineRouter('/sessions', {
    middlewares: [authMiddleware],
    routes: [
        getCookieSession,
    ],
} as const);