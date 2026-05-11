import { Order, OrderQuery, Stored, WorkerStatus } from "@miracle/types";
import { JsonCollection, registerDb } from "./db.js";
import { userService } from "./user.db.js";
import { filesService } from "./file.db.js";
import { workersService } from "./workers.db.js";
import { workerPool } from "../workers/worker-pool.js";
import { OrderDetailsWorker } from "../workers/order-details-worker.js";

const orderDb = registerDb('orders', await JsonCollection.create<Order>('orders'));

declare module './db.js' {
    interface DbRegistry {
        orders: typeof orderDb;
    }
}

export const ordersService = {
    create: async (authorId: string, fileId?: string): Promise<Stored<Order>> => {
        const user = await userService.get(authorId);
        if (!user)
            throw new Error('User not found');

        if (fileId) {
            const file = await filesService.get(fileId);
            if (!file)
                throw new Error('File not found');
        }

        return await orderDb.create({ authorId, fileId, analysedDetails: null, redactedDetails: null });
    },

    get: async (id: string): Promise<Stored<Order> | undefined> => {
        return await orderDb.getById(id);
    },

    getOrders: async (query: OrderQuery): Promise<Stored<Order>[]> => {
        return orderDb.ref().filter((order) => {
            if (query.id !== undefined && order.id !== query.id) {
                return false;
            }

            if (query.authorId !== undefined && order.authorId !== query.authorId) {
                return false;
            }

            if (query.fileId !== undefined && order.fileId !== query.fileId) {
                return false;
            }

            return true;
        });
    },

    update: async (id: string, patch: Partial<Omit<Order, 'authorId'>>) => {
        const existing = await ordersService.get(id);
        if (!existing)
            throw new Error('Order not found');

        return await orderDb.update(id, { ...existing, ...patch });
    },

    analyseOrderDetails: async (id: string): Promise<void> => {
        const order = await ordersService.get(id);
        if (!order)
            throw new Error('Order not found');

        if (!order.fileId)
            throw new Error('Order has no file attached');

        const existing = workersService.query(
            (w) => w.type === 'order-details-worker'
                && w.status === WorkerStatus.Active
                && w.orderId === id,
        );
        if (existing.length > 0)
            throw new Error('Analysis worker already running for this order');

        workerPool.launch(new OrderDetailsWorker({ orderId: id }));
    },
}