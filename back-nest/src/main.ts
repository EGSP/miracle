import './load-env.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';

async function bootstrap() {
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter(),
    );

    await app.register(fastifyCookie);

    const config = app.get(AppConfigService);

    app.enableCors({
        origin: config.corsOpen ? true : config.corsOrigins,
        credentials: true,
    });

    app.useGlobalPipes(new ZodValidationPipe());

    await app.listen(config.port, '0.0.0.0');
    console.log(`[back-nest] http://localhost:${config.port}`);
}

bootstrap().catch((err) => {
    console.error('[back-nest] failed to bootstrap', err);
    process.exit(1);
});
