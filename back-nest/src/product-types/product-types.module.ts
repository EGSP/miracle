import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProductTypesController } from './product-types.controller.js';
import { ProductTypesService } from './product-types.service.js';

@Module({
    imports: [AuthModule],
    controllers: [ProductTypesController],
    providers: [ProductTypesService],
    exports: [ProductTypesService],
})
export class ProductTypesModule {}
