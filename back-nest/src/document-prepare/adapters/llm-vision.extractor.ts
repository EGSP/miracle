import { Effect } from 'effect';
import type { FileModel } from '@miracle/types';
import type { DocumentExtractor, ExtractError, PreparedResult } from '../extractor.port.js';

const NOT_IMPLEMENTED = 'LLM Vision extractor будет реализован в Фазе 3';

/** Адаптер LLM Vision (заглушка до Фазы 3). */
export class LlmVisionExtractor implements DocumentExtractor {
    readonly engine = 'llm-vision' as const;

    extract(_file: FileModel, _path: string): Effect.Effect<PreparedResult, ExtractError> {
        return Effect.fail({ _tag: 'ExtractError', message: NOT_IMPLEMENTED });
    }
}
