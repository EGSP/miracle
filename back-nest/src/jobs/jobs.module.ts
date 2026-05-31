import { Global, Module } from '@nestjs/common';
import { LoggerModule } from '../logger/logger.module.js';
import { JobRuntimeService } from './job-runtime.service.js';

@Global()
@Module({
    imports: [LoggerModule],
    providers: [JobRuntimeService],
    exports: [JobRuntimeService],
})
export class JobsModule {}
