import type { Effect } from 'effect';
import { pipeArguments, type Pipeable } from 'effect/Pipeable';
import type { JobId } from '@miracle/types';

export type { JobId, JobRun, JobStatus } from '@miracle/types';

/** Брендирование идентификатора Job (единственная точка приведения строки к JobId). */
export const brandJobId = (id: string): JobId => id as JobId;

/**
 * Job — это инспектируемое ОПИСАНИЕ задачи, которое раннер компилирует в Effect.
 * Лист несёт Effect-тело; составной Job хранит детей как значения (для durable-обхода/возобновления).
 */
export interface LeafJob<Input, Output, Requirements = never> extends Pipeable {
    readonly _tag: 'leaf';
    readonly id: JobId;
    readonly run: (input: Input) => Effect.Effect<Output, unknown, Requirements>;
}

export interface SequenceJob<Input, Output, Requirements = never> extends Pipeable {
    readonly _tag: 'sequence';
    readonly id: JobId;
    readonly children: ReadonlyArray<AnyJob>;
}

export type Job<Input, Output, Requirements = never> =
    | LeafJob<Input, Output, Requirements>
    | SequenceJob<Input, Output, Requirements>;

export type AnyJob = Job<any, any, any>;

function withPipe<T extends object>(obj: T): T & Pipeable {
    return Object.assign(obj, {
        pipe(this: unknown) {
            // eslint-disable-next-line prefer-rest-params
            return pipeArguments(this, arguments as unknown as IArguments);
        },
    }) as T & Pipeable;
}

/** Создаёт листовой Job: брендированный id + Effect-тело. */
export function leaf<Input, Output, Requirements = never>(
    id: string,
    run: (input: Input) => Effect.Effect<Output, unknown, Requirements>,
): LeafJob<Input, Output, Requirements> {
    return withPipe({ _tag: 'leaf', id: brandJobId(id), run }) as LeafJob<Input, Output, Requirements>;
}

/** Внутренний конструктор составного Job (используется комбинаторами). */
export function makeSequence<Input, Output, Requirements = never>(
    id: JobId,
    children: ReadonlyArray<AnyJob>,
): SequenceJob<Input, Output, Requirements> {
    return withPipe({ _tag: 'sequence', id, children }) as SequenceJob<Input, Output, Requirements>;
}
