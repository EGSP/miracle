import { BadRequestException, Injectable } from '@nestjs/common';
import type { OrderReportInfo } from '@miracle/types';
import { _1C_ERP_Commerce_Offer } from './reports/1c-erp-commerce-offer.report.js';
import { _1C_ERP_Commerce_Offer_Extended } from './reports/1c-erp-commerce-offer-extended.report.js';
import type { OrderReport } from './reports/order-report.types.js';
import { toOrderReportInfo } from './reports/order-report.types.js';

@Injectable()
export class OrderReportService {
    private readonly reports: OrderReport[];

    constructor(
        commerceOffer: _1C_ERP_Commerce_Offer,
        commerceOfferExtended: _1C_ERP_Commerce_Offer_Extended,
    ) {
        this.reports = [commerceOffer, commerceOfferExtended];
    }

    listAvailable(): OrderReportInfo[] {
        return this.reports.map(toOrderReportInfo);
    }

    async buildWorkbook(orderId: string, reportId: string | undefined): Promise<Buffer> {
        const report = this.resolveReport(reportId);
        return report.build(orderId);
    }

    private resolveReport(reportId: string | undefined): OrderReport {
        if (!reportId) {
            throw new BadRequestException('Не передан id отчёта');
        }

        const report = this.reports.find((candidate) => candidate.id === reportId);
        if (!report) {
            throw new BadRequestException(`Неизвестный id отчёта: ${reportId}`);
        }

        return report;
    }
}
