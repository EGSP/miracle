import { Injectable } from '@nestjs/common';
import { Chunk, Data, Effect, Stream } from 'effect';
import { FileDomain, getFileDomain, type OrderApplication, type Stored } from '@miracle/types';
import { formatUnknown, tryLabeledPromise } from '../common/effect-errors.js';
import { DocumentPrepareService } from '../document-prepare/document-prepare.service.js';
import { FilesService } from '../files/files.service.js';

/** Один чанк для извлечения позиций: стабильный ключ + JSON-сериализуемый кусок данных. */
export type ReadChunk = { chunkKey: string; chunk: unknown };

export class ApplicationReadError extends Data.TaggedError('ApplicationReadError')<{
    readonly message: string;
}> {}

const readError = (message: string): ApplicationReadError => new ApplicationReadError({ message });

/**
 * Читает приложение заказа в чанки для извлечения позиций (только Effect API).
 *
 * Текстовое приложение — один чанк `{ chunkKey: 'text', … }`.
 * Файловое — markdown из {@link PreparedDocument} (`succeed`) для всех доменов.
 * Подготовку запускает только DPS; ридер не ставит jobs и падает на неподготовленном файле.
 */
@Injectable()
export class ApplicationChunkReader {
    constructor(
        private readonly files: FilesService,
        private readonly documentPrepare: DocumentPrepareService,
    ) {}

    /**
     * Поток markdown подготовленного файла.
     *
     * Сейчас одна итерация — весь markdown. `Stream` даёт `for await` через
     * `Stream.toAsyncIterable` и в будущем позволит чанкование без смены API.
     */
    getMarkdown(fileId: string): Stream.Stream<string, ApplicationReadError> {
        return Stream.fromEffect(this.requireSucceededMarkdown(fileId));
    }

    read(application: Stored<OrderApplication>): Effect.Effect<ReadChunk[], ApplicationReadError> {
        return Effect.gen(this, function* () {
            switch (application.data.type) {
                case 'text': {
                    const text = application.data.text.trim();
                    return text ? [{ chunkKey: 'text', chunk: { text } }] : [];
                }
                case 'file': {
                    const fileId = application.data.fileId;
                    const file = yield* this.files.effects.require(fileId).pipe(
                        Effect.mapError(
                            (error): ApplicationReadError => readError(formatUnknown(error)),
                        ),
                    );
                    return yield* this.readFile(file);
                }
            }
        });
    }

    private readFile(
        file: Stored<{ readonly id: string; readonly extension?: string }>,
    ): Effect.Effect<ReadChunk[], ApplicationReadError> {
        return Effect.gen(this, function* () {
            switch (getFileDomain(file.extension ?? '')) {
                case FileDomain.SPREADSHEET:
                case FileDomain.DOCUMENT:
                case FileDomain.TEXT:
                case FileDomain.VISUAL:
                    return yield* this.readFromPreparedMarkdown(file.id);
                default:
                    return yield* Effect.fail(
                        readError(`Тип файла «${file.extension}» не поддерживается для анализа`),
                    );
            }
        });
    }

    private readFromPreparedMarkdown(
        fileId: string,
    ): Effect.Effect<ReadChunk[], ApplicationReadError> {
        return Effect.gen(this, function* () {
            const parts = yield* Stream.runCollect(this.getMarkdown(fileId));
            const markdown = Chunk.join(parts, '').trim();
            return markdown ? [{ chunkKey: 'markdown', chunk: { text: markdown } }] : [];
        });
    }

    private requireSucceededMarkdown(fileId: string): Effect.Effect<string, ApplicationReadError> {
        return Effect.gen(this, function* () {
            const prepared = yield* tryLabeledPromise(
                `загрузка PreparedDocument для "${fileId}"`,
                () => this.documentPrepare.getLatestByFile(fileId),
            ).pipe(Effect.mapError((error) => readError(formatUnknown(error))));

            if (!prepared) {
                return yield* Effect.fail(
                    readError(`Файл "${fileId}" не имеет подготовленного документа (PreparedDocument)`),
                );
            }

            switch (prepared.status) {
                case 'succeed': {
                    const markdown = (prepared.markdown ?? '').trim();
                    if (!markdown) {
                        return yield* Effect.fail(
                            readError(`Файл "${fileId}": подготовка завершена, но markdown пуст`),
                        );
                    }
                    return markdown;
                }
                case 'queued':
                    return yield* Effect.fail(
                        readError(`Файл "${fileId}" ожидает подготовку (PreparedDocument: queued)`),
                    );
                case 'running':
                    return yield* Effect.fail(
                        readError(`Файл "${fileId}" подготавливается (PreparedDocument: running)`),
                    );
                case 'failed':
                    return yield* Effect.fail(
                        readError(
                            `Файл "${fileId}" не подготовлен: ${prepared.error ?? 'PreparedDocument: failed'}`,
                        ),
                    );
                default:
                    return yield* Effect.fail(
                        readError(`Файл "${fileId}": неизвестный статус подготовки "${prepared.status}"`),
                    );
            }
        });
    }
}
