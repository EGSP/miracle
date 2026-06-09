import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import type { ProductType, Stored } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { ProductTypesService } from './product-types.service.js';
import { CreateProductTypeDto } from './dto/create-product-type.dto.js';
import { UpdateProductTypeDto } from './dto/update-product-type.dto.js';

@Controller('product-types')
@UseGuards(AuthGuard)
export class ProductTypesController {
    constructor(private readonly productTypes: ProductTypesService) {}

    @Get()
    list(): Promise<Stored<ProductType>[]> {
        return this.productTypes.getAll();
    }

    @Post()
    create(@Body() dto: CreateProductTypeDto): Promise<Stored<ProductType>> {
        return this.productTypes.create(dto);
    }

    /** ТУ, привязанные к этому типу продукции (id + name). */
    @Get(':id/technical-conditions')
    getLinkedTechnicalConditions(
        @Param('id') id: string,
    ): Promise<Array<{ id: string; name: string | null }>> {
        return this.productTypes.getLinkedTechnicalConditions(id);
    }

    @Get(':id')
    getOne(@Param('id') id: string): Promise<Stored<ProductType>> {
        return this.productTypes.getByIdOrThrow(id);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateProductTypeDto,
    ): Promise<Stored<ProductType>> {
        return this.productTypes.update(id, dto);
    }

    @Delete(':id')
    @HttpCode(204)
    async remove(@Param('id') id: string): Promise<void> {
        await this.productTypes.softDelete(id);
    }
}
