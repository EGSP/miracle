import { Effect } from 'effect';

export const formatUnknown = (error: unknown, seen = new Set<unknown>()): string => {
    if (error instanceof Error) {
        if (seen.has(error)) return `${error.name}: ${error.message}`;
        seen.add(error);

        const cause = error.cause ? `\nCaused by: ${formatUnknown(error.cause, seen)}` : '';
        return `${error.name}: ${error.message}${cause}`;
    }

    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};

export const wrapUnknown =
    (label: string) =>
    (error: unknown): Error =>
        new Error(`${label}: ${formatUnknown(error)}`, { cause: error });

export const tryLabeledPromise = <Value>(
    label: string,
    promise: () => Promise<Value>,
): Effect.Effect<Value, Error> =>
    Effect.tryPromise({
        try: promise,
        catch: wrapUnknown(label),
    });
