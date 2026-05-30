import { Global, Module } from '@nestjs/common';
import { JobRuntimeService } from './job-runtime.service.js';

@Global()
@Module({
    providers: [JobRuntimeService],
    exports: [JobRuntimeService],
})
export class JobsModule {}
