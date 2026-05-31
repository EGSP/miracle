import './load-env.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { AppLoggerService } from './logger/app-logger.service.js';
import { FILE_UPLOAD_CONFIG } from './files/file-upload.config.js';

async function bootstrap() {
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter(),
        { bufferLogs: true },
    );

    app.useLogger(app.get(AppLoggerService));

    await app.register(fastifyCookie);
    await app.register(fastifyMultipart, {
        limits: { fileSize: FILE_UPLOAD_CONFIG.maxSizeBytes },
    });

    const config = app.get(AppConfigService);

    app.enableCors({
        origin: config.corsOpen ? true : config.corsOrigins,
        credentials: true,
    });

    app.useGlobalPipes(new ZodValidationPipe());

    await app.listen(config.port, '0.0.0.0');
    console.log(`[back-nest] http://localhost:${config.port}`);
    console.log('[VSCode Hook] Attach Debugger');
}

bootstrap().catch((err) => {
    console.error('[back-nest] failed to bootstrap', err);
    process.exit(1);
});
