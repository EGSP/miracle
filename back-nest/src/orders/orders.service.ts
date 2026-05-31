import { Injectable, NotFoundException } from '@nestjs/common';
import type { Order, OrderQuery, Stored } from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';
import { FilesService } from '../files/files.service.js';

export type OrderAnalysisAvailability = {
    canAnalyse: boolean;
    canForceReanalyse?: boolean;
    errorMessage?: string;
};

@Injectable()
export class OrdersService {
    constructor(
        private readonly db: DatabaseService,
        private readonly files: FilesService,
    ) {}

    async create(authorId: string, fileId?: string): Promise<Stored<Order>> {
        if (fileId && !this.files.get(fileId)) {
            throw new NotFoundException('Файл не найден');
        }
        return this.db.collections.orders.create({ authorId, fileId, details: null });
    }

    get(id: string): Stored<Order> | undefined {
        return this.db.collections.orders.getById(id);
    }

    getOrThrow(id: string): Stored<Order> {
        const order = this.get(id);
        if (!order) {
            throw new NotFoundException('Заказ не найден');
        }
        return order;
    }

    getOrders(query: OrderQuery): Stored<Order>[] {
        return this.db.collections.orders.ref().filter((order) => {
            if (query.id !== undefined && order.id !== query.id) return false;
            if (query.authorId !== undefined && order.authorId !== query.authorId) return false;
            if (query.fileId !== undefined && order.fileId !== query.fileId) return false;
            return true;
        });
    }

    async update(id: string, patch: Partial<Omit<Order, 'authorId'>>): Promise<Stored<Order>> {
        this.getOrThrow(id);
        const updated = await this.db.collections.orders.update(id, patch);
        if (!updated) {
            throw new NotFoundException('Заказ не найден');
        }
        return updated;
    }

    async clearAnalysedDetails(id: string): Promise<Stored<Order>> {
        this.getOrThrow(id);
        const updated = await this.db.collections.orders.update(id, { details: null });
        if (!updated) {
            throw new NotFoundException('Заказ не найден');
        }
        return updated;
    }

    /** Можно ли запустить анализ деталей: файл доступен и нет активного прогона `order-analyse`. */
    canAnalyseOrderDetails(id: string): OrderAnalysisAvailability {
        const order = this.get(id);
        if (!order) {
            return { canAnalyse: false, errorMessage: 'Заказ не найден' };
        }
        if (!order.fileId) {
            return { canAnalyse: false, errorMessage: 'У заказа не прикреплён файл' };
        }
        if (!this.files.get(order.fileId)) {
            return { canAnalyse: false, errorMessage: 'Файл заказа не найден' };
        }
        if (!this.files.checkFileAvailability(order.fileId)) {
            return { canAnalyse: false, errorMessage: 'Файл заказа недоступен' };
        }

        const active = this.db.collections.jobRuns
            .ref()
            .some(
                (run) =>
                    run.job === 'order-analyse'
                    && run.status === 'running'
                    && (run.input as { orderId?: string } | undefined)?.orderId === id,
            );
        if (active) {
            return { canAnalyse: false, canForceReanalyse: false, errorMessage: 'Для заказа уже выполняется анализ' };
        }

        if (order.details != null) {
            return { canAnalyse: false, canForceReanalyse: true };
        }
        return { canAnalyse: true, canForceReanalyse: false };
    }
}
