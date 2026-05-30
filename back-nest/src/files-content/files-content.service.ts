import { Injectable, NotFoundException } from '@nestjs/common';
import { hasDeletion, type FileContent, type Stored } from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';
import type { CreateEntityInput } from '../database/json-collection.js';
import { countTokens } from './count-tokens.js';

/**
 * Слой данных над коллекцией `file-content`: создание/чтение/мягкое удаление записей извлечения.
 * Оркестрацию самого извлечения см. в {@link ExtractionService}.
 */
@Injectable()
export class FilesContentService {
    constructor(private readonly db: DatabaseService) {}

    create(data: CreateEntityInput<FileContent>): Promise<Stored<FileContent>> {
        return this.db.collections.filesContent.create(data);
    }

    get(id: string): Stored<FileContent> | undefined {
        return this.db.collections.filesContent.getById(id);
    }

    /**
     * Записи контента по `fileId`. По умолчанию только активные; при `includeDeleted` — все.
     * Сортировка: от новых к старым по `updatedAt`.
     */
    getContent(fileId: string, options?: { includeDeleted?: boolean }): Stored<FileContent>[] {
        const includeDeleted = options?.includeDeleted === true;
        const rows = this.db.collections.filesContent.ref().filter((content) => {
            if (content.fileId !== fileId) {
                return false;
            }
            if (!includeDeleted && hasDeletion(content)) {
                return false;
            }
            return true;
        });
        return [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
    }

    /** `mark=true` — пометить удалённой, `mark=false` — снять пометку. */
    async softDelete(contentId: string, mark: boolean): Promise<void> {
        const existing = this.get(contentId);
        if (!existing) {
            throw new NotFoundException('Запись контента не найдена');
        }
        await this.db.collections.filesContent.softDelete(contentId, mark);
    }

    async update(data: FileContent): Promise<Stored<FileContent> | undefined> {
        const existing = this.get(data.id);
        if (!existing) {
            throw new NotFoundException('Содержимое не найдено');
        }
        return this.db.collections.filesContent.update(data.id, data);
    }

    delete(id: string): Promise<boolean> {
        return this.db.collections.filesContent.delete(id);
    }

    /** Оценка числа токенов по сохранённому контенту записи. */
    getTokenCount(contentId: string): number {
        const record = this.get(contentId);
        if (!record) {
            throw new NotFoundException('Запись контента не найдена');
        }
        if (!record.content?.length) {
            return 0;
        }
        return countTokens(record.content);
    }
}
