/** Диапазон страниц: [начало, конец] включительно, оба >= 1. */
export type PageRange = [number, number];

/**
 * Парсит строку вида "1-3, 5, 6-9" в массив диапазонов.
 * Пробелы вокруг дефиса допустимы: "1 - 3" → [[1,3]].
 * Пустая строка → [].
 * Выбрасывает Error при невалидном синтаксисе.
 */
export function parsePageRanges(spec: string): PageRange[] {
    const trimmed = spec.trim();
    if (!trimmed) return [];

    return trimmed
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((token) => {
            const match = token.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
            if (!match) throw new Error(`Неверный формат сегмента: "${token}"`);

            const start = parseInt(match[1], 10);
            if (start < 1) throw new Error(`Номер страницы должен быть ≥ 1: "${token}"`);

            if (!match[2]) return [start, start] as PageRange;

            const end = parseInt(match[2], 10);
            if (start > end) throw new Error(`Начало диапазона больше конца: "${token}"`);

            return [start, end] as PageRange;
        });
}

/**
 * Разворачивает диапазоны в отсортированный плоский список без дубликатов.
 * [[1,3],[5,5]] → [1,2,3,5]
 */
export function expandPageRanges(ranges: PageRange[]): number[] {
    const pages = new Set<number>();
    for (const [start, end] of ranges) {
        for (let p = start; p <= end; p++) pages.add(p);
    }
    return [...pages].sort((a, b) => a - b);
}

/**
 * Валидирует строку диапазонов и опционально проверяет что все страницы ≤ totalPages.
 * При totalPages не задан — проверяет только синтаксис.
 */
export function validatePageRanges(
    spec: string,
    totalPages?: number,
): { ok: true; ranges: PageRange[]; pages: number[] } | { ok: false; message: string } {
    try {
        const ranges = parsePageRanges(spec);
        const pages = expandPageRanges(ranges);

        if (totalPages !== undefined && pages.length > 0) {
            const max = pages[pages.length - 1];
            if (max > totalPages) {
                return {
                    ok: false,
                    message: `Страница ${max} превышает количество страниц в документе (${totalPages})`,
                };
            }
        }

        return { ok: true, ranges, pages };
    } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
}
