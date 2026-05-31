import { Global, Module } from '@nestjs/common';
import { ConvertService } from './convert.service.js';

@Global()
@Module({
    providers: [ConvertService],
    exports: [ConvertService],
})
export class ConvertModule {}
