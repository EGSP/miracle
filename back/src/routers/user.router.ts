import { err } from "../app/index.js";
import { defineRouter, route } from "../app/router.js";
import { userService } from "../databases/user.db.js";

const getUser = route.get('/user/:id',
    async ({ params }: { params: { id: string } }) => {
        if (!params.id) {
            return err.validation('User id parameter is required');
        }

        const user = await userService.get(params.id);
        if(!user)
            return err.notFound(`User with id "${params.id}" not found`);
        return user;
    }
);

export const userRouter = defineRouter('/user', {
    routes: [
        getUser,
    ],
} as const);