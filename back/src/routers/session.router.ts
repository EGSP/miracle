import { Session, User } from "@miracle/types";
import { defineRouter, route } from "../app/index.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

type GetSessionResponse = {
    userId: string;
}

const getCookieSession =
    route.get('/cookie', async ({ locals }: { locals: Record<string, unknown> }) => {
        const user = locals.user as User | undefined;
        if (!user?.id) {
            throw new Error('Authenticated user is missing in session context');
        }

        return { userId: user.id } satisfies GetSessionResponse;
    });


export const sessionRouter = defineRouter('/sessions', {
    middlewares: [authMiddleware],
    routes: [
        getCookieSession,
    ],
} as const);