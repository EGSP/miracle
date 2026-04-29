import type { FileModel } from '@miracle/types';
import type { JsonCollection } from '../db.js';

const LIKELY_MOJIBAKE_RE = /[ÐÑ]/;
const CYRILLIC_RE = /[\u0400-\u04FF]/;

export function fixFileNameEncoding(name: string): string {
    if (!LIKELY_MOJIBAKE_RE.test(name)) {
        return name;
    }

    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (CYRILLIC_RE.test(decoded)) {
        return decoded;
    }

    return name;
}

export async function runFileEncodingFix(filesDb: JsonCollection<FileModel>): Promise<number> {
    const files = filesDb.list();
    let updatedCount = 0;

    for (const file of files) {
        const fixedName = fixFileNameEncoding(file.name);
        if (fixedName !== file.name) {
            await filesDb.update(file.id, { name: fixedName });
            updatedCount += 1;
        }
    }

    return updatedCount;
}
