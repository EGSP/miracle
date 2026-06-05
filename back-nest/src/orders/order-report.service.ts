import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
    buildDesignationDisplayParts,
    renderDesignationTemplate,
    type Designation,
    type DesignationDisplayTone,
    type DesignationValue,
    type OrderPosition,
    type Stored,
} from '@miracle/types';
import { OrderPositionsService } from './order-positions.service.js';
import { TechnicalConditionsService } from '../technical-conditions/technical-conditions.service.js';

/** Заливка ячеек обозначения/размышлений по тону уверенности (ARGB). */
const TONE_FILL: Record<Exclude<DesignationDisplayTone, 'none'>, string> = {
    warn: 'FFFFF1B8', // светло-жёлтый: «?» или 0.5 ≤ confidence < 0.7
    critical: 'FFF8C9C9', // светло-красный: confidence < 0.5
};

const EMDASH = '—';

/**
 * Формирование Excel-отчёта по распознанной продукции заказа.
 * На каждую позицию — блок строк (название, тип, количество, ед.изм., и при наличии обозначения —
 * слоты/значения/размышления/название по шаблону ТУ), разделённые пустыми строками.
 */
@Injectable()
export class OrderReportService {
    constructor(
        private readonly positions: OrderPositionsService,
        private readonly tcs: TechnicalConditionsService,
    ) {}

    async buildWorkbook(orderId: string): Promise<Buffer> {
        const items = await this.positions.listByOrderWithDesignations(orderId);

        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Распознанная продукция');
        ws.getColumn(1).width = 28;

        if (items.length === 0) {
            ws.addRow(['Нет распознанных позиций']);
        }

        let first = true;
        for (const { position, designation } of items) {
            if (!first) {
                ws.addRow([]);
                ws.addRow([]);
            }
            first = false;
            await this.writePositionBlock(ws, position, designation);
        }

        return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    }

    private async writePositionBlock(
        ws: ExcelJS.Worksheet,
        position: Stored<OrderPosition>,
        designation: Stored<Designation> | null,
    ): Promise<void> {
        ws.addRow(['Название продукции', position.name]).getCell(1).font = { bold: true };
        ws.addRow(['Тип продукции', position.productTypeName ?? EMDASH]);
        ws.addRow(['Количество', position.data.quantity ?? EMDASH]);
        ws.addRow(['Ед. изм.', position.data.unit ?? EMDASH]);

        if (!designation) {
            return; // нет обозначения → без блока обозначения (позиция вне номенклатуры / анализ не дошёл)
        }
        const tc = designation.tcId ? await this.tcs.getById(designation.tcId) : null;

        const slotNameByIndex = new Map<number, string>((tc?.slotRules ?? []).map((s) => [s.index, s.name]));
        const valueBySlot = new Map<number, DesignationValue>(designation.values.map((v) => [v.slotIndex, v]));
        const parts = buildDesignationDisplayParts(designation);
        if (parts.length === 0) {
            return;
        }

        // Имена слотов (заголовки колонок обозначения, со 2-й колонки).
        const namesRow = ws.addRow([
            'Параметр',
            ...parts.map((p) => slotNameByIndex.get(p.slotIndex) ?? `Слот ${p.slotIndex + 1}`),
        ]);
        namesRow.font = { bold: true };

        // Значения обозначения; заливка по тону.
        const valuesRow = ws.addRow(['Обозначение', ...parts.map((p) => p.text)]);
        parts.forEach((p, i) => {
            if (p.tone !== 'none') this.fillCell(valuesRow.getCell(i + 2), p.tone);
        });

        // Размышления ИИ — только под ячейками с тоном (не определено / низкая уверенность).
        const reasoningRow = ws.addRow([
            'Размышления ИИ',
            ...parts.map((p) =>
                p.tone === 'none' ? '' : (valueBySlot.get(p.slotIndex)?.reasoning ?? 'Параметр отсутствует в заявке'),
            ),
        ]);
        reasoningRow.alignment = { wrapText: true, vertical: 'top' };
        parts.forEach((p, i) => {
            if (p.tone !== 'none') this.fillCell(reasoningRow.getCell(i + 2), p.tone);
        });

        // Название по шаблону отображения [0], если есть.
        const template = tc?.displayTemplates?.[0];
        if (tc && template) {
            ws.addRow([
                `Обозначение по шаблону «${template.name}»`,
                renderDesignationTemplate(designation, tc, template.format),
            ]);
        }
    }

    private fillCell(cell: ExcelJS.Cell, tone: Exclude<DesignationDisplayTone, 'none'>): void {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TONE_FILL[tone] } };
    }
}
