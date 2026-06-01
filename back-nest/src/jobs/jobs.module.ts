import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LoggerModule } from '../logger/logger.module.js';
import { JobRuntimeService } from './job-runtime.service.js';
import { JobRunsController } from './job-runs.controller.js';
import { JobRunsService } from './job-runs.service.js';

@Global()
@Module({
    imports: [LoggerModule, AuthModule],
    controllers: [JobRunsController],
    providers: [JobRuntimeService, JobRunsService],
    exports: [JobRuntimeService, JobRunsService],
})
export class JobsModule {}
