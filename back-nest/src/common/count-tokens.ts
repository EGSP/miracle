import type { Content } from '@miracle/types';

/** Грубая оценка числа токенов по тексту/контенту (символы ÷ symbolsPerToken). */
export function countTokens(text: string | Content[], symbolsPerToken = 4): number {
    const raw = Array.isArray(text) ? text.map((c) => c.text ?? '').join(' ') : text;
    return Math.ceil(raw.length / symbolsPerToken);
}
