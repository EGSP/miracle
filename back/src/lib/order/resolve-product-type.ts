import type { ProductType, Stored } from '@miracle/types';
import { productTypesService } from '../../databases/product-type.db.js';

export type LlmProductType = { id: string | null; name: string | null } | null;

export function resolveProductType(
    llm: LlmProductType,
    catalog: Stored<ProductType>[],
): { productTypeId: string; productTypeName: string } | undefined {
    if (llm === null) {
        return undefined;
    }

    const id = llm.id?.trim() || undefined;
    const name = llm.name?.trim() || undefined;

    if (!id && !name) {
        return undefined;
    }

    if (id) {
        const byId = catalog.find((item) => item.id === id);
        if (byId) {
            return { productTypeId: byId.id, productTypeName: byId.name };
        }
    }

    if (name) {
        const byName = productTypesService.findByNameOrSynonym(name);
        if (byName) {
            return { productTypeId: byName.id, productTypeName: byName.name };
        }
    }

    return undefined;
}
