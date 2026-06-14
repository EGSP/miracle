import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { PrismaService } from '../database/prisma.service.js';
import type { PreparedResult } from './extractor.port.js';

/**
 * Переходы статуса `PreparedDocument` — общий владелец записи для движка ({@link DpsPipeline}) и
 * vision-джобы. Вынесен отдельно, чтобы оба писали статус без циклической зависимости
 * (pipeline ↔ service). Все методы effectful.
 */
@Injectable()
export class PreparedDocumentStore {
    constructor(private readonly prisma: PrismaService) {}

    /** Разрешён ли LLM Vision для файла ручным запросом (флаг `allowVision` актуальной записи). */
    loadAllowVision(fileId: string): Effect.Effect<boolean> {
        return Effect.promise(() =>
            this.prisma.preparedDocument
                .findFirst({ where: { fileId, deletedAt: null }, orderBy: { updatedAt: 'desc' } })
                .then((row) => row?.allowVision ?? false),
        );
    }

    markRunning(fileId: string): Effect.Effect<void> {
        return Effect.promise(() =>
            this.prisma.preparedDocument
                .updateMany({ where: { fileId, deletedAt: null }, data: { status: 'running', error: null } })
                .then(() => undefined),
        );
    }

    markSucceeded(
        fileId: string,
        result: Pick<PreparedResult, 'markdown' | 'pages' | 'meta'>,
    ): Effect.Effect<void> {
        return Effect.promise(() =>
            this.prisma.preparedDocument
                .updateMany({
                    where: { fileId, deletedAt: null },
                    data: {
                        status: 'succeed',
                        markdown: result.markdown,
                        pages: result.pages as object | undefined,
                        meta: result.meta as object | undefined,
                        error: null,
                    },
                })
                .then(() => undefined),
        );
    }

    markFailed(fileId: string, error: string): Effect.Effect<void> {
        return Effect.promise(() =>
            this.prisma.preparedDocument
                .updateMany({ where: { fileId, deletedAt: null }, data: { status: 'failed', error } })
                .then(() => undefined),
        );
    }
}
