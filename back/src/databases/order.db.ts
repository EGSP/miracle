import { Order, OrderQuery, Stored, WorkerStatus, orderDetailsHasAiLayer } from "@miracle/types";
import { JsonCollection, registerDb } from "./db.js";
import { userService } from "./user.db.js";
import { filesService } from "./file.db.js";
import { workersService } from "./workers.db.js";
import { workerPool } from "../workers/worker-pool.js";
import { OrderDetailsWorker } from "../workers/order-details-worker.js";
// import { runOrderRequirementIndexFix } from "./runners/order.run.js";

export type CanAnalyseOrderDetailsResult = {
    canAnalyse: boolean;
    errorMessage?: string;
};

// База данных заказов
const orderDb = registerDb('orders', await JsonCollection.create<Order>('orders'));

declare module './db.js' {
    interface DbRegistry {
        orders: typeof orderDb;
    }
}

// await runOrderRequirementIndexFix(orderDb);

export const ordersService = {
    // Создаёт новый заказ
    create: async (authorId: string, fileId?: string): Promise<Stored<Order>> => {
        const user = await userService.get(authorId);
        if (!user)
            throw new Error('Пользователь не найден');

        if (fileId) {
            const file = await filesService.get(fileId);
            if (!file)
                throw new Error('Файл не найден');
        }

        return await orderDb.create({ authorId, fileId, details: null });
    },

    // Получает заказ по id
    get: async (id: string): Promise<Stored<Order> | undefined> => {
        return await orderDb.getById(id);
    },

    // Получает список заказов по запросу
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

    // Обновляет заказ
    update: async (id: string, patch: Partial<Omit<Order, 'authorId'>>) => {
        const existing = await ordersService.get(id);
        if (!existing)
            throw new Error('Заказ не найден');

        const merged: Stored<Order> = { ...existing, ...patch };

        return await orderDb.update(id, merged);
    },

    // Очищает результаты анализа деталей заказа
    clearAnalysedDetails: async (id: string): Promise<Stored<Order>> => {
        const existing = await ordersService.get(id);
        if (!existing) {
            throw new Error('Заказ не найден');
        }

        const next: Stored<Order> = { ...existing, details: null };

        const updated = await orderDb.update(id, next);

        if (!updated) {
            throw new Error('Заказ не найден');
        }

        return updated;
    },

    // Проверяет, можно ли запустить анализ деталей заказа
    canAnalyseOrderDetails: async (id: string): Promise<CanAnalyseOrderDetailsResult> => {
        const order = await ordersService.get(id);
        if (!order) {
            return { canAnalyse: false, errorMessage: 'Заказ не найден' };
        }

        if (!order.fileId) {
            return { canAnalyse: false, errorMessage: 'У заказа не прикреплён файл' };
        }

        const file = await filesService.get(order.fileId);
        if (!file) {
            return { canAnalyse: false, errorMessage: 'Файл заказа не найден' };
        }

        const isFileAvailable = await filesService.checkFileAvailability(order.fileId);
        if (!isFileAvailable) {
            return { canAnalyse: false, errorMessage: 'Файл заказа недоступен' };
        }

        if (orderDetailsHasAiLayer(order.details)) {
            return {
                canAnalyse: false,
                errorMessage: 'Сначала очистите детали заказа, чтобы запустить анализ снова',
            };
        }

        const activeOrderDetailsWorkers = workersService.query(
            (w) => w.type === 'order-details-worker'
                && w.status === WorkerStatus.Active
                && w.orderId === id,
        );
        if (activeOrderDetailsWorkers.length > 0) {
            return { canAnalyse: false, errorMessage: 'Для заказа уже выполняется анализ' };
        }

        return { canAnalyse: true };
    },

    // Запускает анализ деталей заказа
    analyseOrderDetails: async (id: string): Promise<void> => {
        const availability = await ordersService.canAnalyseOrderDetails(id);
        if (!availability.canAnalyse) {
            throw new Error(availability.errorMessage ?? 'Анализ заказа недоступен');
        }

        workerPool.launch(new OrderDetailsWorker({ data: null, orderId: id }));
    },
}