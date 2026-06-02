import type { Designation } from './designation.js';

export type PositionRequirement = {
    parameterName: string;
    requiredValue: string;
};

/**
 * Позиция в приложении заказа. Одно приложение (источник) может содержать несколько позиций.
 * Результат обработки источника: тип продукции, требования заявки, условное обозначение.
 * Своя таблица (`order_positions`), связь с приложением — плоский `applicationId` + `@@index`.
 */
export type OrderPosition = {
    applicationId: string;
    productTypeId?: string;
    /** Денормализованный снимок имени типа продукции (тип могли переименовать/удалить). */
    productTypeName?: string;
    requirements?: PositionRequirement[];
    designation?: Designation;
};

export type OrderPositionQuery = {
    id?: string;
    applicationId?: string;
};
