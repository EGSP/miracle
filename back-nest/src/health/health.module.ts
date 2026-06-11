import { Module } from '@nestjs/common';
import { DocumentPrepareModule } from '../document-prepare/document-prepare.module.js';
import { HealthController } from './health.controller.js';

@Module({
    imports: [DocumentPrepareModule],
    controllers: [HealthController],
})
export class HealthModule {}
