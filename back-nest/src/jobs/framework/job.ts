import type { Effect } from 'effect';
import type { JobId } from '@miracle/types';
import type { Jobs, Memo, Progress } from './context.js';

export type { JobId } from '@miracle/types';

/**
 * Брендирование строки в {@link JobId}. Единственная точка приведения — используется
 * {@link defineJob}; вручную id не конструируют.
 */
export const brandJobId = (id: string): JobId => id as JobId;

/**
 * Окружение (Effect requirements), доступное телу любого джоба:
 * - {@link Memo} — контрольные точки внутри одного джоба (durable get/set);
 * - {@link Progress} — отчёт о прогрессе (наблюдаемость);
 * - {@link Jobs} — запуск дочерних джобов (`Jobs.run`).
 *
 * Все три сервиса провайдит рантайм, замыкая их на строку текущего прогона.
 */
export type JobEnv = Memo | Progress | Jobs;

/**
 * Job — единица работы. Это плоское значение (без деревьев/последовательностей): id плюс тело,
 * возвращающее Effect. Оркестрация (запуск под-джобов) живёт ВНУТРИ тела через `Jobs.run`,
 * а не в структуре описания.
 *
 * @example
 * ```ts
 * const extractText = defineJob(
 *   'extract-text',
 *   (input: { applicationId: string }) =>
 *     Effect.gen(function* () {
 *       const progress = yield* Progress;
 *       yield* progress.set(0, 'чтение источника');
 *       // ... вернуть текст
 *       return text;
 *     }),
 * );
 * ```
 */
export interface Job<Input, Output> {
    readonly id: JobId;
    readonly run: (input: Input) => Effect.Effect<Output, unknown, JobEnv>;
}

/** Job с произвольными параметрами — для хранения в реестре и рантайме. */
export type AnyJob = Job<any, any>;

/**
 * Создаёт джоб: брендирует id и оборачивает тело. Заменяет прежние `leaf`/`andThen`/`named` —
 * композиции на уровне описания больше нет, под-джобы запускаются из тела через `Jobs.run`.
 *
 * @example
 * ```ts
 * const orderAnalyse = defineJob(
 *   'order-analyse',
 *   (input: { applicationId: string }) =>
 *     Effect.gen(function* () {
 *       const jobs = yield* Jobs;
 *       const text = yield* jobs.run(extractText, 'extract', { applicationId: input.applicationId });
 *       const positions = yield* jobs.run(llmPositions, 'llm', { text });
 *       return positions;
 *     }),
 * );
 * ```
 */
export function defineJob<Input, Output>(
    id: string,
    run: (input: Input) => Effect.Effect<Output, unknown, JobEnv>,
): Job<Input, Output> {
    return { id: brandJobId(id), run };
}
