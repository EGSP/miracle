import type { Stored, TechnicalCondition } from '@miracle/types';
import { productTypesService } from '../../databases/product-type.db.js';

/**
 * Нормализует тело TC перед записью: опциональные строки, массивы по умолчанию,
 * `lastProductTypeName` по правилам productTypeId.
 */
export async function prepareTechnicalConditionPayload(
    body: TechnicalCondition,
    existing?: Stored<TechnicalCondition>,
): Promise<TechnicalCondition> {
    const productTypeId = body.productTypeId?.trim() || undefined;
    const fileId = body.fileId?.trim() || undefined;

    let lastProductTypeName: string | undefined;
    if (productTypeId) {
        const productType = await productTypesService.getById(productTypeId);
        lastProductTypeName = productType?.name
            ?? body.lastProductTypeName?.trim()
            ?? existing?.lastProductTypeName;
    } else {
        lastProductTypeName = body.lastProductTypeName?.trim() || existing?.lastProductTypeName;
    }

    return {
        fileId,
        productTypeId,
        lastProductTypeName,
        rules: body.rules ?? [],
        designationSlots: body.designationSlots ?? [],
        displayTemplates: body.displayTemplates ?? [],
    };
}
