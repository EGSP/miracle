import type { OrderReportInfo } from '@miracle/types';

export interface OrderReport {
    readonly id: string;
    readonly name: string;
    build(orderId: string): Promise<Buffer>;
}

export function toOrderReportInfo(report: OrderReport): OrderReportInfo {
    return {
        id: report.id,
        name: report.name,
    };
}
