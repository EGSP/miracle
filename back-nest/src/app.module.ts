import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { UsersModule } from './users/users.module.js';
import { ProductTypesModule } from './product-types/product-types.module.js';
import { WorkersModule } from './workers/workers.module.js';
import { FilesModule } from './files/files.module.js';

@Module({
    imports: [
        AppConfigModule,
        DatabaseModule,
        AuthModule,
        HealthModule,
        SessionsModule,
        UsersModule,
        ProductTypesModule,
        WorkersModule,
        FilesModule,
    ],
})
export class AppModule {}
