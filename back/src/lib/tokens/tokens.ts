import type { Content } from '@miracle/types';

export function countTokens(text: string | Content[], symbolsPerToken: number = 4): number {
    const raw = Array.isArray(text)
        ? text.map((c) => c.text ?? '').join(' ')
        : text;

    return Math.ceil(raw.length / symbolsPerToken);
}
