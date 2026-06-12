import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { brandJobToolType, type JobTool } from '../../../framework/job-tool.js';
import { ToolMemo } from '../../../framework/context.js';
import { tryLabeledPromise } from '../../../../common/effect-errors.js';
import { DocumentPrepareService } from '../../../../document-prepare/document-prepare.service.js';
import type { PreparedResult } from '../../../../document-prepare/extractor.port.js';

type PrepareApplyInput = {
    readonly fileId: string;
    readonly result: PreparedResult;
};

type PrepareApplyMemo = {
    applied?: boolean;
};

/** JobTool: запись успешного результата в PreparedDocument (idempotent через ToolMemo). */
@Injectable()
export class PrepareApplyTool implements JobTool<PrepareApplyInput, void, PrepareApplyMemo, Error> {
    readonly type = brandJobToolType('prepare.apply.v1');

    constructor(private readonly documentPrepare: DocumentPrepareService) {}

    run = (input: PrepareApplyInput) =>
        Effect.gen(this, function* () {
            const memo = yield* ToolMemo.typed<PrepareApplyMemo>();
            const applied = yield* memo.get((m) => m.applied);
            if (applied) {
                return;
            }

            yield* tryLabeledPromise('отметка успешной подготовки', () =>
                this.documentPrepare.markSucceeded(input.fileId, {
                    markdown: input.result.markdown,
                    pages: input.result.pages,
                    meta: input.result.meta,
                }),
            );
            yield* memo.set((m) => m.applied, true);
        });
}
