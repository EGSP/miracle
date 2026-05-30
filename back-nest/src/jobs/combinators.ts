import { brandJobId, makeSequence, type Job, type SequenceJob } from './job.js';

/**
 * Цепочка `self → next` (pipe + andThen). Тип: выход `self` обязан совпасть со входом `next`.
 * Плоский список детей (вложенные sequence разворачиваются на этом уровне).
 */
export const andThen =
    <Middle, Output, RequirementsNext>(next: Job<Middle, Output, RequirementsNext>) =>
    <Input, RequirementsSelf>(
        self: Job<Input, Middle, RequirementsSelf>,
    ): SequenceJob<Input, Output, RequirementsSelf | RequirementsNext> => {
        const children = self._tag === 'sequence' ? [...self.children, next] : [self, next];
        return makeSequence<Input, Output, RequirementsSelf | RequirementsNext>(self.id, children);
    };

/** Присваивает Job брендированный id (обычно — имя составного пайплайна). */
export const named =
    (id: string) =>
    <Input, Output, Requirements>(self: Job<Input, Output, Requirements>): Job<Input, Output, Requirements> => {
        if (self._tag === 'sequence') {
            return makeSequence<Input, Output, Requirements>(brandJobId(id), self.children);
        }
        return { ...self, id: brandJobId(id) } as Job<Input, Output, Requirements>;
    };
