/* eslint-disable */
// Файл сгенерирован @miracle/tools client-generator-nest. Не редактировать вручную.

import { customInstance } from '../api';
import { formatPath } from './http';
import type { ProductType, Stored } from '@miracle/types';
import type { CreateProductTypeDto, UpdateProductTypeDto } from './models';

export const productTypes = {
    list: () => customInstance<Stored<ProductType>[]>({
        method: 'GET',
        url: '/product-types',
    }),
    create: (createProductTypeDto: CreateProductTypeDto) => customInstance<Stored<ProductType>>({
        method: 'POST',
        url: '/product-types',
        data: createProductTypeDto,
    }),
    getOne: (id: string) => customInstance<Stored<ProductType>>({
        method: 'GET',
        url: formatPath('/product-types/:id', { id }),
    }),
    update: (id: string, updateProductTypeDto: UpdateProductTypeDto) => customInstance<Stored<ProductType>>({
        method: 'PATCH',
        url: formatPath('/product-types/:id', { id }),
        data: updateProductTypeDto,
    }),
    remove: (id: string) => customInstance<void>({
        method: 'DELETE',
        url: formatPath('/product-types/:id', { id }),
    }),
};
