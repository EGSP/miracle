import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Seed-скрипт запускается через `npm run prisma:seed` или автоматически при `prisma migrate reset`.
// Наполняет базу начальными данными для разработки.

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main(): Promise<void> {
    // Тип продукции — пример
    await prisma.productType.upsert({
        where: { id: 'seed-pt-1' },
        update: {},
        create: {
            id: 'seed-pt-1',
            name: 'НЭМС',
            synonyms: ['нэмс', 'микросборка', 'гибридная схема'],
        },
    });

    // Администратор — пример (пароль: admin)
    // В реальном проекте заменить на argon2-хэш через TokensService.
    await prisma.user.upsert({
        where: { id: 'seed-user-admin' },
        update: {},
        create: {
            id: 'seed-user-admin',
            login: 'admin',
            password: null, // установить хэш вручную при необходимости
            role: 'ADMIN',
        },
    });

    console.log('Seed завершён.');
}

main()
    .catch((e) => {
        console.error('Seed завершился с ошибкой:', e);
        process.exit(1);
    })
    .finally(() => pool.end());
