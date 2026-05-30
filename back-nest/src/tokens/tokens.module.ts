import { Global, Module } from '@nestjs/common';
import { TokensService } from './tokens.service.js';

/**
 * `@Global`, потому что `AuthGuard` инжектит `TokensService`, а гард, указанный классом в
 * `@UseGuards`, Nest инстанцирует в контексте модуля-потребителя (не как общий экспортируемый
 * инстанс). Значит `TokensService` должен резолвиться в любом таком модуле. `TokensService` —
 * stateless-синглтон (JWT/argon2), глобальность безопасна (как у `DatabaseModule`).
 */
@Global()
@Module({
    providers: [TokensService],
    exports: [TokensService],
})
export class TokensModule {}
