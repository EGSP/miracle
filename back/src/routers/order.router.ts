import { Order, OrderQuery, Stored, User } from "@miracle/types";
import { defineRouter, route } from "../app/router.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { err } from "../app/index.js";
import { filesService } from "../databases/file.db.js";
import { ordersService } from "../databases/order.db.js";

type CreateOrderDTO = {
    fileId?: string;
};

type UpdateOrderDTO = Partial<Pick<Order, 'fileId' | 'details'>>;

type CanAnalyseOrderDetailsResponse = {
    canAnalyse: boolean;
    errorMessage?: string;
};

const createOrder = route.post('/create', {
    handler: async ({ locals, body }: { locals: Record<string, unknown>, body: CreateOrderDTO }) => {
        const user = locals.user as User | undefined;
        if (!user?.id) {
            return err.unauthorized('Authenticated user is missing');
        }

        const order = await ordersService.create(user.id, body.fileId);
        return order satisfies Stored<Order>;
    },
});

const getOrder = route.get('/:id', {
    validate: { params: true },
    handler: async ({ params }: { params: { id: string } }) => {
        const order = await ordersService.get(params.id);
        if (!order) {
            return err.notFound('Order not found');
        }

        return order satisfies Stored<Order>;
    },
});

const getOrders = route.get('/', {
    validate: { query: true },
    handler: async ({ query }: { query: OrderQuery }) => {
        const orders = await ordersService.getOrders(query);
        return orders satisfies Stored<Order>[];
    },
});

const updateOrder = route.put('/:id', {
    handler: async ({ params, body }: { params: { id: string }, body: UpdateOrderDTO }) => {
        const existingOrder = await ordersService.get(params.id);
        if (!existingOrder) {
            return err.notFound('Order not found');
        }

        if (body.fileId != null) {
            const file = await filesService.get(body.fileId);
            if (!file) {
                return err.notFound('File not found');
            }
        }

        const updated = await ordersService.update(params.id, {
            fileId: body.fileId,
            details: body.details,
        });

        if (!updated) {
            return err.notFound('Order not found');
        }

        return updated satisfies Stored<Order>;
    },
});

const analyseOrderDetails = route.post('/:id/analyse-details', {
    validate: { params: true },
    handler: async ({ params }: { params: { id: string } }) => {
        await ordersService.analyseOrderDetails(params.id);
    },
});

const clearAnalysedDetails = route.post('/:id/clear-analysed-details', {
    validate: { params: true },
    handler: async ({ params }: { params: { id: string } }) => {
        const updated = await ordersService.clearAnalysedDetails(params.id);
        return updated satisfies Stored<Order>;
    },
});

const canAnalyseOrderDetails = route.get('/:id/can-analyse-details', {
    validate: { params: true },
    handler: async ({ params }: { params: { id: string } }) => {
        const result = await ordersService.canAnalyseOrderDetails(params.id);
        return result satisfies CanAnalyseOrderDetailsResponse;
    },
});

export const orderRouter = defineRouter('/order', {
    middlewares: [
        authMiddleware,
    ],
    routes: [
        createOrder,
        getOrder,
        getOrders,
        updateOrder,
        canAnalyseOrderDetails,
        analyseOrderDetails,
        clearAnalysedDetails,
    ],
});