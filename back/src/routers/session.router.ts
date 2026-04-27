import { Session, User } from "@miracle/types";
import { defineRouter, err, route } from "../app/index.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

type GetSessionResponse = {
    userId: string;
}

const getCookieSession =
    route.get('/cookie', async ({ locals }: { locals: Record<string, unknown> }) => {
        return { userId: (locals.user as User).id! } satisfies GetSessionResponse;
    });


export const sessionRouter = defineRouter('/sessions', {
    middlewares: [authMiddleware],
    routes: [
        getCookieSession,
    ],
} as const);