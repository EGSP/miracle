import winston from 'winston';

const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize({ all: false }),
    winston.format.printf((info) => {
        const timestamp = String(info.timestamp ?? '');
        const level = String(info.level ?? '');
        const message = String(info.message ?? '');
        const stack = info.stack ? `\n${info.stack}` : '';

        return `${timestamp} ${level}: ${message}${stack}`;
    }),
);

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
    },
    transports: [
        new winston.transports.Console({
            format: consoleFormat,
        }),
    ],
});
