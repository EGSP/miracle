import { DesignationWorkerInput, Order, OrderQuery, Stored, User } from "@miracle/types";
import { defineRouter, route } from "../app/router.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { err } from "../app/index.js";
import { filesService } from "../databases/file.db.js";
import { ordersService } from "../databases/order.db.js";
import { technicalConditionsService } from "../databases/technical-condition.db.js";
import { workerPool } from "../workers/worker-pool.js";
import { DesignationWorker } from "../workers/designation.worker.js";

type CreateOrderDTO = {
    fileId?: string;
};

type UpdateOrderDTO = Partial<Pick<Order, 'fileId' | 'details'>>;

type CanAnalyseOrderDetailsResponse = {
    canAnalyse: boolean;
    canForceReanalyse?: boolean;
    errorMessage?: string;
};

type AnalyseOrderDetailsQuery = {
    forceReanalyse?: boolean;
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
    validate: { params: true, query: true },
    handler: async ({ params, query }: { params: { id: string }, query: AnalyseOrderDetailsQuery }) => {
        await ordersService.analyseOrderDetails(params.id, {
            forceReanalyse: query.forceReanalyse === true,
        });
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

type AnalyseDesignationResponse = { workerId: string };

const analyseDesignation = route.post('/analyse-designation', {
    handler: async ({ body }: { body: DesignationWorkerInput }) => {
        if (!body?.orderId || !body?.tcId) {
            return err.badRequest('Тело запроса должно содержать orderId и tcId');
        }

        const order = await ordersService.get(body.orderId);
        if (!order) {
            return err.notFound('Order not found');
        }

        const tc = await technicalConditionsService.getById(body.tcId);
        if (!tc) {
            return err.notFound('Technical condition not found');
        }

        const hasEffectiveRequirement = (order.details?.requirements ?? []).some(
            (dual) => dual.human !== undefined || (dual.ai !== undefined && dual.ai.used !== false),
        );
        if (!hasEffectiveRequirement) {
            return err.badRequest('У заказа нет активных требований — сначала запустите анализ заявки');
        }

        if (!tc.designationSlots?.length) {
            return err.badRequest('У ТУ не заданы параметры условного обозначения');
        }

        const worker = new DesignationWorker({ data: null, input: body });
        workerPool.launch(worker);

        // mount() запускается асинхронно через workerPool.launch; на момент возврата
        // воркер ещё может не иметь записи в БД. Клиенту workerId нужен для UI-следилки,
        // но критично не блокировать ответ запуска.
        return { workerId: worker.getWorkerRecordId() ?? '' } satisfies AnalyseDesignationResponse;
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
        analyseDesignation,
    ],
});