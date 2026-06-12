import { Data } from 'effect';

/** Файл с заданным id не найден в БД. */
export class FileNotFoundError extends Data.TaggedError('FileNotFoundError')<{ readonly id: string }> {
    override get message(): string {
        return `Файл "${this.id}" не найден`;
    }
}
