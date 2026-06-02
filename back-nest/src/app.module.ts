import { Module } from '@nestjs/common';
import { LoggerModule } from './logger/logger.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { JobImplementationsModule } from './jobs/job-implementations.module.js';
import { YandexModule } from './yandex/yandex.module.js';
import { ConvertModule } from './convert/convert.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { UsersModule } from './users/users.module.js';
import { ProductTypesModule } from './product-types/product-types.module.js';
import { FilesModule } from './files/files.module.js';
import { FilesContentModule } from './files-content/files-content.module.js';
import { TechnicalConditionsModule } from './technical-conditions/technical-conditions.module.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
    imports: [
        LoggerModule,
        JobsModule,
        JobImplementationsModule,
        YandexModule,
        ConvertModule,
        AppConfigModule,
        DatabaseModule,
        AuthModule,
        HealthModule,
        SessionsModule,
        UsersModule,
        ProductTypesModule,
        FilesModule,
        FilesContentModule,
        TechnicalConditionsModule,
        OrdersModule,
    ],
})
export class AppModule {}
