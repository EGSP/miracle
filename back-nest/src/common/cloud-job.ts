import { Effect, Duration, Option } from 'effect';
import { Memo } from '../jobs/context.js';

/**
 * Помощники для листьев Job, работающих с облачными операциями (отправка → опрос).
 * Это НЕ часть Job-фреймворка (он остаётся общим): помощники generic и живут в common,
 * т.к. их используют LLM/OCR-джобы нескольких доменов (files-content, technical-conditions, orders).
 */

/**
 * Идемпотентная отправка операции через `memo`: при возобновлении возвращает сохранённый `opId`
 * и НЕ отправляет повторно. `extraMemo` (напр. `{ finalPrompt }`) сохраняется ДО отправки.
 */
export const submitOnce = (
    submit: () => Promise<string>,
    extraMemo?: Record<string, unknown>,
): Effect.Effect<string, unknown, Memo> =>
    Effect.gen(function* () {
        const memo = yield* Memo;
        const saved = yield* memo.get<string>('opId');
        if (Option.isSome(saved)) {
            return saved.value;
        }
        if (extraMemo) {
            for (const [key, value] of Object.entries(extraMemo)) {
                yield* memo.set(key, value);
            }
        }
        const opId = yield* Effect.tryPromise(submit);
        yield* memo.set('opId', opId); // memo durable ДО опроса
        return opId;
    });

/**
 * Опрос облачной операции до готовности. Цикл прерываемый: `Effect.sleep` реагирует на отмену волокна.
 */
export const pollUntilDone = <Output>(
    check: () => Promise<{ done: boolean; result?: Output }>,
    intervalMs = 3000,
): Effect.Effect<Output, unknown> =>
    Effect.gen(function* () {
        while (true) {
            const result = yield* Effect.tryPromise(check);
            if (result.done) {
                return result.result as Output;
            }
            yield* Effect.sleep(Duration.millis(intervalMs));
        }
    });
