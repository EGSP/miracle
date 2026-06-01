import { defineConfig, env } from 'prisma/config';

// Файл читается Prisma CLI напрямую.
// В dev все команды запускаются через npm-скрипты (dotenv-cli -e ../.env --),
// поэтому DATABASE_URL уже установлена в process.env к моменту чтения этого файла.
export default defineConfig({
    schema: 'prisma/schema.prisma',
    datasource: {
        url: env('DATABASE_URL'),
    },
});
