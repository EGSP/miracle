import { Injectable, NotFoundException } from '@nestjs/common';
import type { ApplicationData, OrderApplication, Stored } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
import type { CreateFileInput } from '../files/files.service.js';

@Injectable()
export class OrderApplicationsService {
    constructor(private readonly prisma: PrismaService) {}

    async listByOrder(orderId: string): Promise<Stored<OrderApplication>[]> {
        const rows = await this.prisma.orderApplication.findMany({
            where: { orderId, deletedAt: null },
        });
        return rows as Stored<OrderApplication>[];
    }

    async get(id: string): Promise<Stored<OrderApplication> | null> {
        const row = await this.prisma.orderApplication.findUnique({ where: { id } });
        return row as Stored<OrderApplication> | null;
    }

    async getOrThrow(id: string): Promise<Stored<OrderApplication>> {
        const app = await this.get(id);
        if (!app) {
            throw new NotFoundException('Приложение не найдено');
        }
        return app;
    }

    async createText(orderId: string, authorId: string, text: string): Promise<Stored<OrderApplication>> {
        const data: ApplicationData = { type: 'text', text };
        const row = await this.prisma.orderApplication.create({
            data: { orderId, authorId, data },
        });
        return row as Stored<OrderApplication>;
    }

    /**
     * Атомарно создаёт запись `File` (по уже записанному на диск файлу) и `OrderApplication`,
     * ссылающееся на неё. Сам файл пишется на диск заранее — {@link FilesService.writeUploadToDisk}.
     * Транзакция гарантирует, что не появится `File` без приложения.
     */
    async createFile(orderId: string, fileInput: CreateFileInput): Promise<Stored<OrderApplication>> {
        const row = await this.prisma.$transaction(async (tx) => {
            const file = await tx.file.create({ data: fileInput });
            const data: ApplicationData = { type: 'file', fileId: file.id };
            return tx.orderApplication.create({
                data: { orderId, authorId: fileInput.authorId, data },
            });
        });
        return row as Stored<OrderApplication>;
    }

    /**
     * Мягко удаляет приложение. Для файлового приложения мягко удаляет и сам `File`
     * (файл на диске остаётся). Обе записи правятся в одной транзакции.
     */
    async softDelete(id: string): Promise<Stored<OrderApplication>> {
        const app = await this.getOrThrow(id);
        const now = new Date();
        const row = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.orderApplication.update({
                where: { id },
                data: { deletedAt: now },
            });
            const data = app.data as ApplicationData;
            if (data.type === 'file') {
                await tx.file.update({ where: { id: data.fileId }, data: { deletedAt: now } });
            }
            return updated;
        });
        return row as Stored<OrderApplication>;
    }
}
