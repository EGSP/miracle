import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
    imports: [
        AppConfigModule,
        DatabaseModule,
        AuthModule,
        HealthModule,
        SessionsModule,
        UsersModule,
    ],
})
export class AppModule {}
