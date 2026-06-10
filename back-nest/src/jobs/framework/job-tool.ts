import type { Effect } from 'effect';
import type { JobToolKey, JobToolType } from '@miracle/types';
import type { ToolMemo } from './context.js';

export type { JobRunTools, JobToolKey, JobToolKeyPart, JobToolType, ToolCall } from '@miracle/types';

/**
 * Брендирует строковый тип JobTool.
 *
 * `type` связывает durable-слот `JobRun.memo.tool_calls` с классом тула и версией его модели
 * памяти. Если меняется смысл `MemoModel`, промпт или алгоритм восстановления — заведите новый
 * type, например `order.extractPositions.llm.v2`.
 */
export const brandJobToolType = (type: string): JobToolType => type as JobToolType;

/**
 * Опции вызова JobTool из тела job.
 *
 * `key` задаёт семантическую идентичность вызова внутри текущего `JobRun`. Если ключ не передан,
 * используется `[]`, то есть один default-слот для данного `tool.type`.
 */
export type JobToolRunOptions = {
    readonly key?: JobToolKey;
};

/**
 * Typed-инструмент, исполняемый внутри `JobRun` без создания дочернего узла дерева.
 *
 * JobTool получает только {@link ToolMemo}: без `Jobs`, без `Progress`. Поэтому он подходит для
 * LLM/OCR/API-вызовов, парсинга и apply-шагов, которым нужна typed durable-память, но не нужна
 * отдельная видимость и retry-граница в дереве.
 *
 * @example
 * ```ts
 * type ExtractMemo = {
 *   opId?: string;
 *   rawResponse?: string;
 *   result?: OrderPosition[];
 * };
 *
 * type ExtractError = ParseError | CloudError;
 *
 * export class ExtractPositionsTool implements JobTool<Input, OrderPosition[], ExtractMemo, ExtractError> {
 *   readonly type = brandJobToolType('order.extractPositions.llm.v1');
 *
 *   run(input: Input) {
 *     return Effect.gen(function* () {
 *       const memo = yield* ToolMemo.typed<ExtractMemo>();
 *       const cached = yield* memo.get((m) => m.result);
 *       if (cached) return cached;
 *       // ... выполнить работу и сохранить checkpoints
 *     });
 *   }
 * }
 * ```
 */
export interface JobTool<Input, Output, MemoModel extends ToolMemo.Model, Error = unknown> {
    readonly type: JobToolType;
    readonly run: (input: Input) => Effect.Effect<Output, Error, ToolMemo>;
}

/** JobTool с произвольными параметрами — удобно для generic-хелперов и реестров. */
export type AnyJobTool = JobTool<any, any, ToolMemo.Model, any>;
