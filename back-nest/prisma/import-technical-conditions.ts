import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import type { DisplayTemplate, SlotRule } from '@miracle/types';
import { PrismaClient } from '../src/generated/prisma/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, '../../back/data/technical-conditions.json');

type LegacyRule = {
    id: string;
    title?: string;
    content: string;
};

type LegacyDesignationSlot = {
    index: number;
    name: string;
    ruleIds: string[];
};

type JsonRow = {
    id: string;
    name?: string;
    fileId?: string;
    productTypeId?: string;
    lastProductTypeName?: string;
    rules?: LegacyRule[];
    designationSlots?: LegacyDesignationSlot[];
    displayTemplates?: DisplayTemplate[];
    deletedAt?: number;
};

type JsonFile = { items: JsonRow[] };

/** Конвертирует legacy JSON (rules + designationSlots) в slotRules. */
export function legacyTcToSlotRules(row: JsonRow): SlotRule[] {
    const rulesById = new Map((row.rules ?? []).map((rule) => [rule.id, rule]));

    if (row.designationSlots?.length) {
        return row.designationSlots.map((slot) => ({
            index: slot.index,
            name: slot.name,
            text: slot.ruleIds
                .map((ruleId) => rulesById.get(ruleId)?.content)
                .filter((content): content is string => Boolean(content))
                .join('\n\n'),
        }));
    }

    if (row.rules?.length) {
        return row.rules.map((rule, index) => ({
            index,
            name: rule.title?.trim() ?? '',
            text: rule.content,
        }));
    }

    return [];
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main(): Promise<void> {
    const raw = await readFile(JSON_PATH, 'utf8');
    const { items } = JSON.parse(raw) as JsonFile;
    const active = items.filter((row) => row.deletedAt == null);

    let orphanRuleRefs = 0;

    for (const row of active) {
        const slotRules = legacyTcToSlotRules(row);
        if (row.designationSlots?.length) {
            for (const slot of row.designationSlots) {
                for (const ruleId of slot.ruleIds) {
                    if (!row.rules?.some((rule) => rule.id === ruleId)) {
                        orphanRuleRefs += 1;
                    }
                }
            }
        }

        await prisma.technicalCondition.upsert({
            where: { id: row.id },
            update: {
                name: row.name,
                fileId: row.fileId,
                productTypeId: row.productTypeId,
                lastProductTypeName: row.lastProductTypeName,
                slotRules,
                displayTemplates: row.displayTemplates ?? [],
            },
            create: {
                id: row.id,
                name: row.name,
                fileId: row.fileId,
                productTypeId: row.productTypeId,
                lastProductTypeName: row.lastProductTypeName,
                slotRules,
                displayTemplates: row.displayTemplates ?? [],
            },
        });
    }

    console.log(
        `Импортировано ТУ: ${active.length} (из ${items.length} в JSON).`
        + (orphanRuleRefs > 0 ? ` Предупреждение: сирот ruleIds: ${orphanRuleRefs}.` : ''),
    );
}

main()
    .catch((e) => {
        console.error('Импорт завершился с ошибкой:', e);
        process.exit(1);
    })
    .finally(() => pool.end());
