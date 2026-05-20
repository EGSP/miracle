import type { ProductType, Stored } from '@miracle/types';
import { defineRouter, err, route } from '../app/index.js';
import { productTypesService } from '../databases/product-type.db.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

type CreateProductTypeDTO = ProductType;

type UpdateProductTypeDTO = Partial<Pick<ProductType, 'name' | 'synonyms'>>;

const getProductTypes = route.get('/', {
    handler: async () => {
        const items = productTypesService.getAll();
        return items satisfies Stored<ProductType>[];
    },
});

const createProductType = route.post('/', {
    handler: async ({ body }: { body: CreateProductTypeDTO }) => {
        if (!body.name?.trim()) {
            return err.validation('Product type name is required');
        }

        const created = await productTypesService.create({
            name: body.name.trim(),
            synonyms: body.synonyms ?? [],
        });

        return created satisfies Stored<ProductType>;
    },
});

const getProductType = route.get('/:id', {
    validate: { params: true },
    handler: async ({ params }: { params: { id: string } }) => {
        const item = await productTypesService.getById(params.id);
        if (!item) {
            return err.notFound('Product type not found');
        }

        return item satisfies Stored<ProductType>;
    },
});

const updateProductType = route.patch('/:id', {
    validate: { params: true },
    handler: async ({ params, body }: { params: { id: string }; body: UpdateProductTypeDTO }) => {
        const existing = await productTypesService.getById(params.id);
        if (!existing) {
            return err.notFound('Product type not found');
        }

        if (body.name !== undefined && !body.name.trim()) {
            return err.validation('Product type name cannot be empty');
        }

        const patch: Partial<ProductType> = {};
        if (body.name !== undefined) {
            patch.name = body.name.trim();
        }
        if (body.synonyms !== undefined) {
            patch.synonyms = body.synonyms;
        }

        const updated = await productTypesService.update(params.id, patch);
        return updated satisfies Stored<ProductType>;
    },
});

const deleteProductType = route.delete('/:id', {
    validate: { params: true },
    handler: async ({ params }: { params: { id: string } }) => {
        try {
            await productTypesService.delete(params.id);
        } catch {
            return err.notFound('Product type not found');
        }
    },
});

export const productTypeRouter = defineRouter('/product-types', {
    middlewares: [authMiddleware],
    routes: [
        getProductTypes,
        createProductType,
        getProductType,
        updateProductType,
        deleteProductType,
    ],
} as const);
