import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobToolType, type JobTool } from '../../../framework/job-tool.js';
import { ToolMemo } from '../../../framework/context.js';
import { formatUnknown } from '../../../../common/effect-errors.js';
import { FilesService } from '../../../../files/files.service.js';
import { KreuzbergHttpExtractor } from '../../../../document-prepare/adapters/kreuzberg-http.extractor.js';
import type { ExtractError, PreparedPage, PreparedResult } from '../../../../document-prepare/extractor.port.js';

type KreuzbergExtractInput = {
    readonly fileId: string;
};

type KreuzbergExtractMemo = {
    markdown?: string;
    pages?: PreparedPage[];
    meta?: Record<string, unknown>;
};

/** JobTool: извлечение markdown через kreuzberg REST API. */
@Injectable()
export class KreuzbergExtractTool
    implements JobTool<KreuzbergExtractInput, PreparedResult, KreuzbergExtractMemo, ExtractError>
{
    readonly type = brandJobToolType('kreuzberg.extract.v1');

    constructor(
        private readonly files: FilesService,
        private readonly extractor: KreuzbergHttpExtractor,
    ) {}

    run = (input: KreuzbergExtractInput) =>
        Effect.gen(this, function* () {
            const memo = yield* ToolMemo.typed<KreuzbergExtractMemo>();
            const cachedMarkdown = yield* memo.get((m) => m.markdown);
            if (cachedMarkdown) {
                const pages = yield* memo.get((m) => m.pages);
                const meta = yield* memo.get((m) => m.meta);
                return { markdown: cachedMarkdown, pages, meta };
            }

            const file = yield* this.files.effects.get(input.fileId).pipe(
                Effect.mapError(
                    (error): ExtractError => ({
                        _tag: 'ExtractError',
                        message: formatUnknown(error),
                    }),
                ),
            );
            if (!file) {
                return yield* Effect.fail({
                    _tag: 'ExtractError',
                    message: `Файл "${input.fileId}" не найден`,
                } satisfies ExtractError);
            }

            const filePath = this.files.getFilePath(file);
            const result = yield* this.extractor.extract(file, filePath);

            yield* memo.set((m) => m.markdown, result.markdown);
            if (result.pages) {
                yield* memo.set((m) => m.pages, result.pages);
            }
            if (result.meta) {
                yield* memo.set((m) => m.meta, result.meta);
            }

            return result;
        });
}
