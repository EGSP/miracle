/**
 * Примерная оценка числа токенов по тексту — общая для фронта и бэкенда.
 *
 * Грубая эвристика «символы ÷ symbolsPerToken»: точного токенайзера не нужно, оценка нужна лишь для
 * принятия решения о разбиении группы позиций на подгруппы (см. алгоритм анализа заказа v2).
 */
export function estimateTokens(text: string, symbolsPerToken = 4): number {
    return Math.ceil(text.length / symbolsPerToken);
}
