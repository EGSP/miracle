import type { Stored } from './db.js';
import type { Designation } from './designation.js';

export type OrderPositionConfidence = 'high' | 'medium' | 'low';

/**
 * Полезные данные позиции, не используемые как идентификаторы/для выборок. Хранится как JSON.
 * Захват на шаге извлечения (extract-positions-from-chunk) — дословный, без интерпретации.
 */
export type OrderPositionData = {
    /** Дословный текст требований/шифра для этой позиции; `null` если требований нет. */
    requirements: string | null;
    /** Единица измерения verbatim ("шт", "м", "компл"); `null` если не указана. */
    unit: string | null;
    /** Количество verbatim ("10", "по 5", "5-10"); `null` если не указано. */
    quantity: string | null;
    /** Взаимозаменяемые варианты (аналоги разных производителей); `[]` если нет. */
    alternatives: string[];
    /** Уверенность в ВЫДЕЛЕНИИ позиции (сегментация), не в типе. */
    confidence: OrderPositionConfidence;
    /** Чем вызвана неуверенность; `null` если уверен. */
    confidenceNote: string | null;
};

/**
 * Позиция в приложении заказа. Одно приложение (источник) может содержать несколько позиций.
 * Своя таблица (`order_positions`), связь с приложением — плоский `applicationId` + `@@index`.
 *
 * Идентифицирующие/выборочные поля плоские (`name`, `productTypeId`/`productTypeName`), всё прочее —
 * в `data` (JSON). Условное обозначение — отдельная сущность {@link Designation} (таблица `designations`).
 */
export type OrderPosition = {
    applicationId: string;
    /** Дословное название/обозначение от заказчика. */
    name: string;
    /** id типа продукции из справочника; отсутствует, если не из нашей номенклатуры/не определён. */
    productTypeId?: string;
    /** Денормализованный снимок имени типа продукции (тип могли переименовать/удалить). */
    productTypeName?: string;
    data: OrderPositionData;
};

export type OrderPositionQuery = {
    id?: string;
    applicationId?: string;
};

/**
 * Позиция вместе со своим условным обозначением (1:1, `null` если ещё не определено).
 * Ответ `GET /order/:id/positions`: питает и отметку наличия в списке, и {@link Designation}-детали.
 */
export type OrderPositionWithDesignation = {
    position: Stored<OrderPosition>;
    designation: Stored<Designation> | null;
};
