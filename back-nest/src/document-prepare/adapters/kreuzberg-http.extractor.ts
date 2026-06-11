import { Effect } from 'effect';
import type { FileModel } from '@miracle/types';
import type { DocumentExtractor, ExtractError, PreparedResult } from '../extractor.port.js';

const NOT_IMPLEMENTED = 'Kreuzberg HTTP extractor будет реализован в Фазе 2';

/** HTTP-адаптер kreuzberg (заглушка до Фазы 2). */
export class KreuzbergHttpExtractor implements DocumentExtractor {
    readonly engine = 'kreuzberg' as const;

    extract(_file: FileModel, _path: string): Effect.Effect<PreparedResult, ExtractError> {
        return Effect.fail({ _tag: 'ExtractError', message: NOT_IMPLEMENTED });
    }
}
