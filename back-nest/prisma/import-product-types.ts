import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, '../../back/data/product-types.json');

type JsonRow = {
    id: string;
    name: string;
    synonyms: string[];
    deletedAt?: number;
};

type JsonFile = { items: JsonRow[] };

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main(): Promise<void> {
    const raw = await readFile(JSON_PATH, 'utf8');
    const { items } = JSON.parse(raw) as JsonFile;
    const active = items.filter((row) => row.deletedAt == null);

    for (const row of active) {
        await prisma.productType.upsert({
            where: { id: row.id },
            update: { name: row.name, synonyms: row.synonyms },
            create: { id: row.id, name: row.name, synonyms: row.synonyms },
        });
    }

    console.log(`Импортировано типов продукции: ${active.length} (из ${items.length} в JSON).`);
}

main()
    .catch((e) => {
        console.error('Импорт завершился с ошибкой:', e);
        process.exit(1);
    })
    .finally(() => pool.end());
