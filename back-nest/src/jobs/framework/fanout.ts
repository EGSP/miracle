import { Effect, Either } from 'effect';
import { formatUnknown } from '../../common/effect-errors.js';
import type { JobEnv } from './job.js';
import { JobPartialError } from './runtime.js';

/**
 * Запускает веер дочерних эффектов в режиме best-effort: КАЖДЫЙ исполняется до конца, падение
 * одного НЕ короткозамыкает остальных (в отличие от обычного `Effect.all`, который fail-fast).
 * Возвращает исходы как `Either` (Right — успех, Left — ошибка) в исходном порядке.
 *
 * Решение о статусе родителя (`succeed`/`partial`/`failed`) принимает {@link decideFanout} —
 * оркестратор с несколькими этапами может собрать `Either` из всех вееров и свести их вместе.
 */
export const runFanout = <A>(
    effects: ReadonlyArray<Effect.Effect<A, unknown, JobEnv>>,
): Effect.Effect<ReadonlyArray<Either.Either<A, unknown>>, never, JobEnv> =>
    Effect.all(
        effects.map((effect) => Effect.either(effect)),
        { concurrency: 'unbounded' },
    );

/**
 * Сводит исходы веера(ов) в статус родителя:
 * - нет падений (или веер пуст) → успех (`void` → узел `succeed`);
 * - упали все → `Effect.fail(Error)` → узел `failed`;
 * - упала часть → `Effect.fail(JobPartialError)` → узел `partial`.
 *
 * `label` — человекочитаемое описание родителя для сообщения об ошибке (попадёт в `error` узла).
 */
export const decideFanout = (
    label: string,
    results: ReadonlyArray<Either.Either<unknown, unknown>>,
): Effect.Effect<void, JobPartialError | Error> =>
    Effect.gen(function* () {
        const failures = results.flatMap((result) => (Either.isLeft(result) ? [result.left] : []));
        if (failures.length === 0) return;

        const total = results.length;
        const detail = failures.map((failure) => formatUnknown(failure)).join('; ');
        if (failures.length === total) {
            return yield* Effect.fail(
                new Error(`${label}: все дочерние операции (${total}) завершились ошибкой: ${detail}`),
            );
        }
        return yield* Effect.fail(
            new JobPartialError(
                failures,
                `${label}: ${failures.length} из ${total} дочерних операций завершились ошибкой: ${detail}`,
            ),
        );
    });
