import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobToolType, type JobTool } from '../../../framework/job-tool.js';
import { ToolMemo } from '../../../framework/context.js';
import { formatUnknown } from '../../../../common/effect-errors.js';
import { FilesService } from '../../../../files/files.service.js';
import { KreuzbergHttpExtractor } from '../../../../document-prepare/adapters/kreuzberg-http.extractor.js';
import { ExtractError } from '../../../../document-prepare/errors.js';
import type { PreparedPage, PreparedResult } from '../../../../document-prepare/extractor.port.js';

type KreuzbergExtractInput = { readonly fileId: string };

type KreuzbergExtractMemo = {
    markdown?: string;
    pages?: PreparedPage[];
    meta?: Record<string, unknown>;
};

/** JobTool: извлечение markdown через kreuzberg (single-step + кэш результата в ToolMemo). */
@Injectable()
export class KreuzbergExtractTool
    implements JobTool<KreuzbergExtractInput, PreparedResult, KreuzbergExtractMemo, ExtractError>
{
    readonly type = brandJobToolType('document.extract.kreuzberg.v1');

    constructor(
        private readonly files: FilesService,
        private readonly extractor: KreuzbergHttpExtractor,
    ) {}

    run = (input: KreuzbergExtractInput) =>
        Effect.gen(this, function* () {
            const memo = yield* ToolMemo.typed<KreuzbergExtractMemo>();
            const cached = yield* memo.get();
            if (cached.markdown) {
                return { markdown: cached.markdown, pages: cached.pages, meta: cached.meta };
            }

            const file = yield* this.files.effects
                .require(input.fileId)
                .pipe(Effect.mapError((error) => new ExtractError({ message: formatUnknown(error) })));

            const result = yield* this.extractor.extract(file, this.files.getFilePath(file));

            yield* memo.set((m) => m.markdown, result.markdown);
            if (result.pages) yield* memo.set((m) => m.pages, result.pages);
            if (result.meta) yield* memo.set((m) => m.meta, result.meta);

            return result;
        });
}
