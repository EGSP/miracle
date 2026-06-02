import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProductTypesModule } from '../product-types/product-types.module.js';
import { FilesContentModule } from '../files-content/files-content.module.js';
import { TechnicalConditionsController } from './technical-conditions.controller.js';
import { TechnicalConditionsService } from './technical-conditions.service.js';

@Module({
    imports: [AuthModule, ProductTypesModule, FilesContentModule],
    controllers: [TechnicalConditionsController],
    providers: [TechnicalConditionsService],
    exports: [TechnicalConditionsService],
})
export class TechnicalConditionsModule {}
