/**
 * Постпроцесс markdown-таблиц: гасит горизонтальные дубли ячеек.
 *
 * Kreuzberg для настоящего OOXML-merge (`gridSpan`/`vMerge`) уже отдаёт пустые континуации,
 * НЕ размножая текст. Но если в исходном DOCX «объединение» нарисовано копипастой одного значения
 * в несколько реальных ячеек, span-метаданных нет — восстановить можно только эвристически:
 * если ячейка дословно равна левому соседу, считаем её продолжением объединения и гасим.
 *
 * Сравнение строго по тримнутому значению и только с непосредственным левым соседом —
 * это безопаснее вертикального дедупа (там легко затереть легитимно повторяющийся столбец).
 */

/** Место, где была погашена дублирующая ячейка. */
export type TableDedupeSpot = {
    /** Индекс строки в исходном markdown (0-based). */
    line: number;
    /** Индекс колонки внутри строки таблицы (0-based). */
    column: number;
    /** Значение, продублированное слева и поэтому погашенное. */
    value: string;
};

export type TableDedupeResult = {
    /** Markdown с погашенными дублями (дубль слева → пустая ячейка). */
    markdown: string;
    /** Тот же markdown, но погашенные ячейки помечены ~~зачёркиванием~~ (рендерится через GFM). */
    marked: string;
    /** Координаты и значения всех погашенных ячеек. */
    spots: TableDedupeSpot[];
};

/** Строка похожа на строку GFM-таблицы: начинается и заканчивается на `|`. */
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** Ячейка строки-разделителя GFM-таблицы: `---`, `:--`, `--:`, `:-:`. */
const SEPARATOR_CELL = /^:?-{1,}:?$/;

/** Делит строку таблицы на ячейки, не разрывая по экранированному `\|`. */
const splitCells = (line: string): string[] =>
    line
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split(/(?<!\\)\|/);

const isSeparatorRow = (cells: string[]): boolean =>
    cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell.trim()));

/**
 * Гасит горизонтально соседние одинаковые ячейки во всех GFM-таблицах документа.
 * Строки вне таблиц и строки-разделители не трогаются.
 */
export function dedupeMarkdownTableCells(markdown: string): TableDedupeResult {
    const spots: TableDedupeSpot[] = [];
    const clean: string[] = [];
    const marked: string[] = [];

    markdown.split('\n').forEach((line, lineIdx) => {
        if (!TABLE_ROW.test(line)) {
            clean.push(line);
            marked.push(line);
            return;
        }

        const cells = splitCells(line);
        if (isSeparatorRow(cells)) {
            clean.push(line);
            marked.push(line);
            return;
        }

        const cleanCells: string[] = [];
        const markedCells: string[] = [];
        // Логическое значение левого соседа: для серий «A | A | A» сравниваем с исходным A,
        // а не с уже погашенной ячейкой, поэтому prev обновляем тримнутым значением всегда.
        let prev: string | null = null;

        cells.forEach((cell, column) => {
            const value = cell.trim();
            const isDuplicate = prev !== null && value !== '' && value === prev;

            if (isDuplicate) {
                spots.push({ line: lineIdx, column, value });
                cleanCells.push(' ');
                markedCells.push(` ~~${value}~~ `);
            } else {
                cleanCells.push(cell);
                markedCells.push(cell);
            }

            prev = value;
        });

        clean.push(`|${cleanCells.join('|')}|`);
        marked.push(`|${markedCells.join('|')}|`);
    });

    return {
        markdown: clean.join('\n'),
        marked: marked.join('\n'),
        spots,
    };
}
