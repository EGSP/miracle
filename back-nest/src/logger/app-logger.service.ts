import { Injectable, type LoggerService } from '@nestjs/common';
import winston from 'winston';

const truncateMiddle = (value: string, left = 4, right = 4): string => {
    if (value.length <= left + right + 3) {
        return value;
    }
    return `${value.slice(0, left)}...${value.slice(-right)}`;
};

const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize({ all: false }),
    winston.format.printf((info) => {
        const timestamp = String(info.timestamp ?? '');
        const level = String(info.level ?? '');
        const context = info.context ? `[${String(info.context)}] ` : '';
        const message = String(info.message ?? '');
        const stack = info.stack ? `\n${String(info.stack)}` : '';
        return `${timestamp} ${level}: ${context}${message}${stack}`;
    }),
);

/**
 * Лёгкая обёртка над winston-логгером с прибитым контекстом.
 * Создаётся через {@link AppLoggerService.forContext} один раз в конструкторе доменного сервиса.
 */
export interface AppLogger {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
    http(message: string, meta?: Record<string, unknown>): void;
    env(name: string, value: string | null | undefined, left?: number, right?: number): void;
}

function envLine(name: string, value: string | null | undefined, left = 4, right = 4): string {
    const printable = value == null ? '<undefined>' : truncateMiddle(String(value), left, right);
    return `${name}=${printable}`;
}

function makeAppLogger(logger: winston.Logger): AppLogger {
    return {
        info(message, meta) {
            logger.info(message, meta);
        },
        warn(message, meta) {
            logger.warn(message, meta);
        },
        error(message, error, meta) {
            logger.error(message, { ...meta, stack: error instanceof Error ? error.stack : error });
        },
        http(message, meta) {
            logger.http(message, meta);
        },
        env(name, value, left, right) {
            logger.info(envLine(name, value, left, right));
        },
    };
}

@Injectable()
export class AppLoggerService implements LoggerService {
    private readonly logger: winston.Logger;

    constructor() {
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL ?? 'info',
            levels: { error: 0, warn: 1, info: 2, http: 3 },
            transports: [new winston.transports.Console({ format: consoleFormat })],
        });
    }

    // --- Методы Nest LoggerService (для app.useLogger) ---

    log(message: unknown, context?: string): void {
        this.logger.info(String(message), { context });
    }

    error(message: unknown, stack?: string, context?: string): void {
        this.logger.error(String(message), { stack, context });
    }

    warn(message: unknown, context?: string): void {
        this.logger.warn(String(message), { context });
    }

    debug(message: unknown, context?: string): void {
        this.logger.http(String(message), { context });
    }

    verbose(message: unknown, context?: string): void {
        this.logger.http(String(message), { context });
    }

    // --- Прикладной API ---

    info(message: string, meta?: Record<string, unknown>): void {
        this.logger.info(message, meta);
    }

    http(message: string, meta?: Record<string, unknown>): void {
        this.logger.http(message, meta);
    }

    env(name: string, value: string | null | undefined, left?: number, right?: number): void {
        this.logger.info(envLine(name, value, left, right));
    }

    /** Контекстный логгер для инжекта в доменный сервис. Звать один раз в конструкторе. */
    forContext(context: string): AppLogger {
        return makeAppLogger(this.logger.child({ context }));
    }
}
