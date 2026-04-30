import { Order, OrderQuery, Stored } from "@miracle/types";
import { JsonCollection, registerDb } from "./db.js";
import { userService } from "./user.db.js";
import { filesService } from "./file.db.js";

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

        return await orderDb.create({ authorId, fileId });
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
        }).map((order) => {
            if (query.includeRequirements) {
                return order;
            }

            return {
                ...order,
                requirements: undefined,
            };
        });
    },

    update: async (order: Stored<Order>) => {
        const existingOrder = await ordersService.get(order.id);
        if(!existingOrder)
            throw new Error('Order not found');

        return await orderDb.update(order.id, order);
    }


}