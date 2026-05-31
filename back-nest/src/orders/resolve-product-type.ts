import type { ProductType, Stored } from '@miracle/types';

export type LlmProductType = { id: string | null; name: string | null } | null;

/**
 * Резолвит тип продукции из ответа LLM по каталогу: сперва по id, затем по имени/синониму.
 * Зависимость от поиска по синониму передаётся аргументом (DI вместо синглтона).
 */
export function resolveProductType(
    llm: LlmProductType,
    catalog: Stored<ProductType>[],
    findByNameOrSynonym: (name: string) => Stored<ProductType> | undefined,
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
        const byName = findByNameOrSynonym(name);
        if (byName) {
            return { productTypeId: byName.id, productTypeName: byName.name };
        }
    }

    return undefined;
}
