import type { Content } from '@miracle/types';

/**
 * Грубая оценка числа токенов: ~`symbolsPerToken` символов на токен.
 *
 * Пока живёт в `files-content` (единственный потребитель — `getTokens`). В слое 4 её начнут
 * использовать воркеры `orders`/`technical-conditions` — тогда поднять в `common/count-tokens.ts`.
 */
export function countTokens(text: string | Content[], symbolsPerToken = 4): number {
    const raw = Array.isArray(text) ? text.map((c) => c.text ?? '').join(' ') : text;
    return Math.ceil(raw.length / symbolsPerToken);
}
