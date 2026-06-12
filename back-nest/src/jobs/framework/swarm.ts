import { Data, Effect, Either, type Types } from 'effect';
import { formatUnknown } from '../../common/effect-errors.js';

/**
 * Сигнал частичного успеха Swarm.
 *
 * Swarm не зависит от job runtime: он только сообщает, что часть независимых операций упала, а часть
 * завершилась успешно. Если Swarm используется внутри `Job`, runtime распознаёт этот сигнал и
 * пишет текущему `JobRun` статус `partial`.
 */
export class SwarmPartialError extends Data.TaggedError('SwarmPartialError')<{
    readonly failures: ReadonlyArray<unknown>;
    readonly message: string;
}> {}

/**
 * Политика свода независимых операций Swarm.
 *
 * - `all` — все операции обязательны: любая ошибка валит родителя, но остальные операции всё равно
 *   дожидаются завершения, чтобы ошибка содержала полный отчёт.
 * - `partial` — группа может завершиться частично: часть ошибок даёт {@link SwarmPartialError},
 *   все ошибки дают обычный `Error`, отсутствие ошибок — успех.
 * - `atLeastOne` — достаточно одного успешного результата; если не прошла ни одна операция,
 *   родитель падает.
 * - `bestEffort` — ошибки только попадают в summary, сам Swarm всегда успешен.
 */
export type SwarmFailureMode = 'all' | 'partial' | 'atLeastOne' | 'bestEffort';

/** Настройки запуска Swarm. */
export type SwarmOptions<Mode extends SwarmFailureMode = SwarmFailureMode> = {
    /**
     * Человекочитаемое описание группы операций. Используется в ошибках родительского `JobRun`.
     *
     * @example `анализ чанков приложения "app_42"`
     */
    readonly label: string;
    /**
     * Политика свода ошибок. По умолчанию `partial`, потому что это основной режим для независимых
     * дочерних операций: часть результата можно принять, но родитель должен стать `partial`.
     */
    readonly failureMode?: Mode;
    /**
     * Ограничение параллелизма Effect. `unbounded` повторяет прежний fanout, число ограничивает
     * количество одновременно исполняемых операций, `inherit` наследует настройку окружения Effect.
     */
    readonly concurrency?: Types.Concurrency;
};

/**
 * Полный итог Swarm: исходный порядок сохраняется в `results`, а `successes` / `failures` дают
 * удобные списки для продолжения сценария job.
 */
export type SwarmResult<Success, Failure> = {
    readonly results: ReadonlyArray<Either.Either<Success, Failure>>;
    readonly successes: ReadonlyArray<Success>;
    readonly failures: ReadonlyArray<Failure>;
};

const summarize = <Success, Failure>(results: ReadonlyArray<Either.Either<Success, Failure>>): SwarmResult<Success, Failure> => ({
    results,
    successes: results.flatMap((result) => (Either.isRight(result) ? [result.right] : [])),
    failures: results.flatMap((result) => (Either.isLeft(result) ? [result.left] : [])),
});

const failureDetail = (failures: ReadonlyArray<unknown>): string => failures.map((failure) => formatUnknown(failure)).join('; ');

function applyFailureMode<Success, Failure>(
    summary: SwarmResult<Success, Failure>,
    options: Required<Pick<SwarmOptions, 'label' | 'failureMode'>>,
): Effect.Effect<SwarmResult<Success, Failure>, SwarmPartialError | Error> {
    const total = summary.results.length;
    const failed = summary.failures.length;
    const detail = failureDetail(summary.failures);

    switch (options.failureMode) {
        case 'bestEffort':
            return Effect.succeed(summary);

        case 'atLeastOne':
            if (summary.successes.length > 0) return Effect.succeed(summary);
            return Effect.fail(new Error(`${options.label}: ни одна операция не завершилась успешно${detail ? `: ${detail}` : ''}`));

        case 'all':
            if (failed === 0) return Effect.succeed(summary);
            return Effect.fail(
                new Error(`${options.label}: ${failed} из ${total} операций завершились ошибкой${detail ? `: ${detail}` : ''}`),
            );

        case 'partial':
            if (failed === 0) return Effect.succeed(summary);
            if (failed === total) {
                return Effect.fail(
                    new Error(`${options.label}: все операции (${total}) завершились ошибкой${detail ? `: ${detail}` : ''}`),
                );
            }
            return Effect.fail(
                new SwarmPartialError({
                    failures: summary.failures,
                    message: `${options.label}: ${failed} из ${total} операций завершились ошибкой${detail ? `: ${detail}` : ''}`,
                }),
            );
    }
}

function run<Item, Success, Failure, Requirements>(
    items: ReadonlyArray<Item>,
    runOne: (item: Item, index: number) => Effect.Effect<Success, Failure, Requirements>,
    options: SwarmOptions<'bestEffort'>,
): Effect.Effect<SwarmResult<Success, Failure>, never, Requirements>;
function run<Item, Success, Failure, Requirements>(
    items: ReadonlyArray<Item>,
    runOne: (item: Item, index: number) => Effect.Effect<Success, Failure, Requirements>,
    options: SwarmOptions,
): Effect.Effect<SwarmResult<Success, Failure>, SwarmPartialError | Error, Requirements>;
/**
 * Запускает набор независимых Effect-операций как Swarm.
 *
 * Swarm нужен для мест, где job порождает группу однотипных независимых действий: чанки, файлы,
 * позиции, альтернативные извлекатели. В отличие от обычного `Effect.all`, Swarm не short-circuit-ит
 * при первой ошибке: каждая операция завершается в `Either`, после чего явно применяется
 * `failureMode`.
 *
 * @example Дочерние jobs с partial-политикой
 * ```ts
 * const jobs = yield* Jobs;
 * const summary = yield* Swarm.run(chunks, (chunk) =>
 *   jobs.run(extractChunk, [jobs.runId, 'chunk', chunk.key], chunk),
 *   { label: 'анализ чанков', failureMode: 'partial' },
 * );
 * ```
 *
 * @example JobTool с ограничением параллелизма
 * ```ts
 * const tools = yield* JobTools;
 * const summary = yield* Swarm.run(chunks, (chunk) =>
 *   tools.run(extractPositionsTool, chunk, { key: ['chunk', chunk.key] }),
 *   { label: 'извлечение позиций', failureMode: 'partial', concurrency: 4 },
 * );
 * ```
 */
function run<Item, Success, Failure, Requirements>(
    items: ReadonlyArray<Item>,
    runOne: (item: Item, index: number) => Effect.Effect<Success, Failure, Requirements>,
    options: SwarmOptions,
): Effect.Effect<SwarmResult<Success, Failure>, SwarmPartialError | Error, Requirements> {
    const mode = options.failureMode ?? 'partial';
    return Effect.gen(function* () {
        const results = yield* Effect.all(
            items.map((item, index) => Effect.either(runOne(item, index))),
            { concurrency: options.concurrency ?? 'unbounded' },
        );
        const summary = summarize(results);
        return yield* applyFailureMode(summary, { label: options.label, failureMode: mode });
    });
}

/** Namespace-форма для читаемого использования: `Swarm.run(...)`. */
export const Swarm = {
    run,
} as const;
