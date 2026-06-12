import { Injectable, NotFoundException } from '@nestjs/common';
import type { FileContent, Stored } from '@miracle/types';
import { PrismaService } from '../database/prisma.service.js';
import { countTokens } from '../common/count-tokens.js';

export type CreateFileContentInput = Omit<FileContent, 'id'>;

/**
 * Слой данных над таблицей `file_contents`: создание/чтение/мягкое удаление записей извлечения.
 * Read-only для клиентов; новое извлечение — через Document Prepare Service, не через {@link ExtractionService}.
 */
@Injectable()
export class FilesContentService {
    constructor(private readonly prisma: PrismaService) {}

    async create(data: CreateFileContentInput): Promise<Stored<FileContent>> {
        const row = await this.prisma.fileContent.create({ data });
        return row as Stored<FileContent>;
    }

    async get(id: string): Promise<Stored<FileContent> | null> {
        const row = await this.prisma.fileContent.findUnique({ where: { id } });
        return row as Stored<FileContent> | null;
    }

    /**
     * Записи контента по `fileId`. По умолчанию только активные; при `includeDeleted` — все.
     * Сортировка: от новых к старым по `updatedAt`.
     */
    async getContent(fileId: string, options?: { includeDeleted?: boolean }): Promise<Stored<FileContent>[]> {
        const includeDeleted = options?.includeDeleted === true;
        const rows = await this.prisma.fileContent.findMany({
            where: {
                fileId,
                ...(includeDeleted ? {} : { deletedAt: null }),
            },
            orderBy: { updatedAt: 'desc' },
        });
        return rows as Stored<FileContent>[];
    }

    /** `mark=true` — пометить удалённой, `mark=false` — снять пометку. */
    async softDelete(contentId: string, mark: boolean): Promise<void> {
        const existing = await this.get(contentId);
        if (!existing) {
            throw new NotFoundException('Запись контента не найдена');
        }
        await this.prisma.fileContent.update({
            where: { id: contentId },
            data: { deletedAt: mark ? new Date() : null },
        });
    }

    async update(data: FileContent): Promise<Stored<FileContent> | null> {
        const existing = await this.get(data.id);
        if (!existing) {
            throw new NotFoundException('Содержимое не найдено');
        }
        const updated = await this.prisma.fileContent.update({
            where: { id: data.id },
            data: {
                fileId: data.fileId,
                content: data.content as object[] | undefined,
                meta: data.meta as object | undefined,
            },
        });
        return updated as Stored<FileContent>;
    }

    async delete(id: string): Promise<boolean> {
        try {
            await this.prisma.fileContent.delete({ where: { id } });
            return true;
        } catch {
            return false;
        }
    }

    /** Жёсткое удаление всех записей контента файла (для сброса вычиток при переанализе). */
    async deleteByFile(fileId: string): Promise<void> {
        await this.prisma.fileContent.deleteMany({ where: { fileId } });
    }

    /** Оценка числа токенов по сохранённому контенту записи. */
    async getTokenCount(contentId: string): Promise<number> {
        const record = await this.get(contentId);
        if (!record) {
            throw new NotFoundException('Запись контента не найдена');
        }
        if (!record.content?.length) {
            return 0;
        }
        return countTokens(record.content);
    }
}
