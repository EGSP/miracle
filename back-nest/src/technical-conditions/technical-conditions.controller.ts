import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import type { Stored, TechnicalCondition } from '@miracle/types';
import { AuthGuard } from '../auth/auth.guard.js';
import { TechnicalConditionsService } from './technical-conditions.service.js';

@Controller('technical-conditions')
@UseGuards(AuthGuard)
export class TechnicalConditionsController {
    constructor(private readonly tc: TechnicalConditionsService) {}

    @Get()
    list(@Query('productTypeId') productTypeId?: string): Promise<Stored<TechnicalCondition>[]> {
        return productTypeId ? this.tc.getByProductTypeId(productTypeId) : this.tc.getAll();
    }

    @Post()
    create(@Body() body: TechnicalCondition): Promise<Stored<TechnicalCondition>> {
        return this.tc.create(body);
    }

    /** Тип продукции, связанный с этим ТУ (id + name). */
    @Get(':id/product-type')
    getLinkedProductType(@Param('id') id: string): Promise<{ id: string; name: string } | null> {
        return this.tc.getLinkedProductType(id);
    }

    @Get(':id')
    getOne(@Param('id') id: string): Promise<Stored<TechnicalCondition>> {
        return this.tc.getByIdOrThrow(id);
    }

    @Put(':id')
    replace(@Param('id') id: string, @Body() body: TechnicalCondition): Promise<Stored<TechnicalCondition>> {
        return this.tc.replace(id, body);
    }

    /** Мягкое удаление ТУ (проставляет deletedAt). */
    @Delete(':id')
    remove(@Param('id') id: string): Promise<Stored<TechnicalCondition>> {
        return this.tc.softDelete(id);
    }
}
