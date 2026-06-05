import ExcelJS from 'exceljs';
import {
    renderDesignationTemplate,
    type Designation,
    type DisplayTemplate,
    type OrderPosition,
    type Stored,
    type TechnicalCondition,
} from '@miracle/types';
import { TechnicalConditionsService } from '../../technical-conditions/technical-conditions.service.js';
import { OrderPositionsService } from '../order-positions.service.js';

export type CommerceOfferReportItem = {
    position: Stored<OrderPosition>;
    designation: Stored<Designation>;
    tc: Stored<TechnicalCondition>;
    template: DisplayTemplate;
    nomenclature: string;
};

export abstract class CommerceOfferReportBase {
    protected constructor(
        protected readonly positions: OrderPositionsService,
        protected readonly tcs: TechnicalConditionsService,
    ) {}

    protected async collectItems(orderId: string): Promise<CommerceOfferReportItem[]> {
        const items = await this.positions.listByOrderWithDesignations(orderId);
        const tcById = new Map<string, Stored<TechnicalCondition> | null>();
        const result: CommerceOfferReportItem[] = [];

        for (const { position, designation } of items) {
            if (!designation) {
                continue;
            }

            const cached = tcById.has(designation.tcId) ? tcById.get(designation.tcId)! : undefined;
            const tc = cached === undefined ? await this.tcs.getById(designation.tcId) : cached;
            if (cached === undefined) {
                tcById.set(designation.tcId, tc);
            }
            if (!tc) {
                continue;
            }

            const template = this.resolveTemplate(tc);
            if (!template) {
                continue;
            }

            result.push({
                position,
                designation,
                tc,
                template,
                nomenclature: renderDesignationTemplate(designation, tc, template.format),
            });
        }

        return result;
    }

    protected resolveTemplate(tc: TechnicalCondition): DisplayTemplate | null {
        return (tc.displayTemplates ?? []).find((template) => template.format.trim()) ?? null;
    }

    protected createWorksheet(workbook: ExcelJS.Workbook, name: string, headers: string[]): ExcelJS.Worksheet {
        const ws = workbook.addWorksheet(name);
        const headerRow = ws.addRow(headers);
        headerRow.font = { bold: true };
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        return ws;
    }

    protected async writeWorkbookBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
        return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    }
}
