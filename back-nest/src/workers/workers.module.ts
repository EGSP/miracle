import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WorkersController } from './workers.controller.js';
import { WorkersService } from './workers.service.js';

@Module({
    imports: [AuthModule],
    controllers: [WorkersController],
    providers: [WorkersService],
    exports: [WorkersService],
})
export class WorkersModule {}
