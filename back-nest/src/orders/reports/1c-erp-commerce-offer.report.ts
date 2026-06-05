import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { TechnicalConditionsService } from '../../technical-conditions/technical-conditions.service.js';
import { OrderPositionsService } from '../order-positions.service.js';
import { CommerceOfferReportBase } from './commerce-offer-report.base.js';
import type { OrderReport } from './order-report.types.js';

const HEADERS = ['Штрихкод', 'Код', 'Артикул', 'Номенклатура', 'Характеристика', 'Количество', 'Цена'];

@Injectable()
export class _1C_ERP_Commerce_Offer extends CommerceOfferReportBase implements OrderReport {
    readonly id = '1C_ERP_Commerce_Offer';
    readonly name = '1С ERP Commerce Offer';

    constructor(positions: OrderPositionsService, tcs: TechnicalConditionsService) {
        super(positions, tcs);
    }

    async build(orderId: string): Promise<Buffer> {
        const items = await this.collectItems(orderId);
        const workbook = new ExcelJS.Workbook();
        const ws = this.createWorksheet(workbook, this.id, HEADERS);

        ws.columns = [
            { width: 18 },
            { width: 18 },
            { width: 18 },
            { width: 48 },
            { width: 24 },
            { width: 14 },
            { width: 14 },
        ];

        for (const item of items) {
            ws.addRow(['', '', '', item.nomenclature, '', item.position.data.quantity ?? '', '']);
        }

        return this.writeWorkbookBuffer(workbook);
    }
}
