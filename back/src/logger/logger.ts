import winston from 'winston';

const truncateMiddle = (value: string, left = 4, right = 4): string => {
    if (value.length <= left + right + 3) return value;

    return `${value.slice(0, left)}...${value.slice(-right)}`;
};

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

type AppLogger = winston.Logger & {
    env: (name: string, value: string | null | undefined, left?: number, right?: number) => void;
};

export const logger: AppLogger = Object.assign(
    winston.createLogger({
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
    }),
    {
        env(this: winston.Logger, name: string, value: string | null | undefined, left = 4, right = 4) {
            const printableValue = value == null ? '<undefined>' : truncateMiddle(String(value), left, right);
            this.info(`${name}=${printableValue}`);
        },
    },
);
