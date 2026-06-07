import { Effect, Duration, Option } from 'effect';
import { Memo, Progress } from '../jobs/framework/context.js';
import { wrapUnknown } from './effect-errors.js';

/**
 * Помощники для листьев Job, работающих с облачными операциями (отправка → опрос).
 * Это НЕ часть Job-фреймворка (он остаётся общим): помощники generic и живут в common,
 * т.к. их используют LLM/OCR-джобы нескольких доменов (files-content, technical-conditions, orders).
 */

/**
 * Идемпотентная отправка операции через `memo`: при возобновлении возвращает сохранённый `opId`
 * и НЕ отправляет повторно. `extraMemo` (напр. `{ finalPrompt }`) сохраняется ДО отправки.
 *
 * Если заданы `submitProgressLabel` / `pollProgressLabel` — пишет прогресс через {@link Progress}:
 * только label + `determined: false`, percent наследуется от последнего push джоба.
 */
type SubmitOnceOptions = {
    label?: string;
    extraMemo?: Record<string, unknown>;
    submitProgressLabel?: string;
    pollProgressLabel?: string;
};

type PollUntilDoneOptions = {
    label?: string;
    intervalMs?: number;
};

const isSubmitOnceOptions = (
    options: SubmitOnceOptions | Record<string, unknown> | undefined,
): options is SubmitOnceOptions =>
    !!options &&
    ('label' in options ||
        'extraMemo' in options ||
        'submitProgressLabel' in options ||
        'pollProgressLabel' in options);

const hasProgressLabels = (options: SubmitOnceOptions): boolean =>
    options.submitProgressLabel !== undefined || options.pollProgressLabel !== undefined;

export const submitOnce = (
    submit: () => Promise<string>,
    options?: SubmitOnceOptions | Record<string, unknown>,
): Effect.Effect<string, Error, Memo | Progress> =>
    Effect.gen(function* () {
        const normalizedOptions: SubmitOnceOptions = isSubmitOnceOptions(options) ? options : { extraMemo: options };
        const memo = yield* Memo;
        const reportProgress = hasProgressLabels(normalizedOptions);
        const submitProgressLabel = normalizedOptions.submitProgressLabel ?? 'отправка запроса';
        const pollProgressLabel = normalizedOptions.pollProgressLabel ?? 'ожидание ответа';

        const saved = yield* memo.get<string>('opId');
        if (Option.isSome(saved)) {
            if (reportProgress) {
                const progress = yield* Progress;
                yield* progress.push({ label: pollProgressLabel, determined: false });
            }
            return saved.value;
        }

        if (normalizedOptions.extraMemo) {
            for (const [key, value] of Object.entries(normalizedOptions.extraMemo)) {
                yield* memo.set(key, value);
            }
        }

        if (reportProgress) {
            const progress = yield* Progress;
            yield* progress.push({ label: submitProgressLabel, determined: false });
        }

        const label = normalizedOptions.label ?? 'submit cloud operation';
        const opId = yield* Effect.tryPromise({
            try: submit,
            catch: wrapUnknown(label),
        });
        yield* memo.set('opId', opId); // memo durable ДО опроса

        if (reportProgress) {
            const progress = yield* Progress;
            yield* progress.push({ label: pollProgressLabel, determined: false });
        }

        return opId;
    });

/**
 * Опрос облачной операции до готовности. Цикл прерываемый: `Effect.sleep` реагирует на отмену волокна.
 * Прогресс ожидания выставляет {@link submitOnce} через `pollProgressLabel`.
 */
export const pollUntilDone = <Output>(
    check: () => Promise<{ done: boolean; result?: Output }>,
    options?: PollUntilDoneOptions | number,
): Effect.Effect<Output, Error> =>
    Effect.gen(function* () {
        const normalizedOptions = typeof options === 'number' ? { intervalMs: options } : (options ?? {});
        const intervalMs = normalizedOptions.intervalMs ?? 3000;
        const label = normalizedOptions.label ?? 'poll cloud operation';
        while (true) {
            const result = yield* Effect.tryPromise({
                try: check,
                catch: wrapUnknown(label),
            });
            if (result.done) {
                return result.result as Output;
            }
            yield* Effect.sleep(Duration.millis(intervalMs));
        }
    });
