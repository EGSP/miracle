const LIKELY_MOJIBAKE_RE = /[ÐÑ]/;
const CYRILLIC_RE = /[Ѐ-ӿ]/;

/** Чинит имена файлов, в которых utf8 был ошибочно прочитан как latin1. */
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
