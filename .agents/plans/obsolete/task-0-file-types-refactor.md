# План: рефактор — единый источник правды для типов файлов

## Проблема

Сейчас знания о расширениях и mime-типах разбросаны:

| Место | Что хранит |
|-------|-----------|
| `types/src/file.ts` — `getFileDomain()` | маппинг extension → FileDomain (switch-case) |
| `back/src/routers/file.router.ts` — `CONTENT_TYPE_BY_EXTENSION` | extension → mime для HTTP-ответа при скачивании |
| `back/src/routers/file.router.ts` — `FILE_UPLOAD_CONFIG.allowedMimeTypes` | список разрешённых mime при загрузке (хардкод) |

В частности, `CONTENT_TYPE_BY_EXTENSION` в роутере содержит `webp` и `gif`, которых нет в `getFileDomain` — несогласованность. Visual-экстрактору нужен маппинг extension → mime для Yandex OCR, но его нигде нет.

---

## Решение: `types/src/file-types.ts`

Единственный файл с полным описанием поддерживаемых типов. Всё остальное — производное.

### Схема модуля

```
EXTENSIONS_BY_DOMAIN: Record<FileDomain, string[]>
  ↓ используется в
getFileDomain(extension) — рефактор, убрать switch-case

MIME_BY_EXTENSION: Record<string, string>
  ↓ используется в
getMimeType(extension): string | undefined
getAllowedMimeTypes(): string[]        → FILE_UPLOAD_CONFIG в роутере
getContentType(extension): string     → Content-Type при скачивании (fallback: octet-stream)
```

### Содержимое `EXTENSIONS_BY_DOMAIN`

```typescript
export const EXTENSIONS_BY_DOMAIN: Record<FileDomain, readonly string[]> = {
  [FileDomain.VISUAL]:      ['jpg', 'jpeg', 'png', 'pdf'],
  [FileDomain.DOCUMENT]:    ['doc', 'docx', 'odt', 'rtf'],
  [FileDomain.SPREADSHEET]: ['xls', 'xlsx', 'ods', 'csv', 'tsv'],
  [FileDomain.TEXT]:        ['md', 'txt'],
};
```

### Содержимое `MIME_BY_EXTENSION`

```typescript
export const MIME_BY_EXTENSION: Record<string, string> = {
  // VISUAL
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  pdf:  'application/pdf',
  // DOCUMENT
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt:  'application/vnd.oasis.opendocument.text',
  rtf:  'application/rtf',
  // SPREADSHEET
  xls:  'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods:  'application/vnd.oasis.opendocument.spreadsheet',
  csv:  'text/csv',
  tsv:  'text/tab-separated-values',
  // TEXT
  md:   'text/markdown',
  txt:  'text/plain',
};
```

> `webp` и `gif` из текущего `CONTENT_TYPE_BY_EXTENSION` в роутере — **удалить**: они не входят ни в один FileDomain, загрузка таких файлов не предусмотрена.

### Экспортируемые функции

```typescript
// Определить домен по расширению (рефактор getFileDomain — логика через EXTENSIONS_BY_DOMAIN)
export function getFileDomain(extension: string): FileDomain | undefined

// Получить mime-тип по расширению
export function getMimeType(extension: string): string | undefined

// Получить Content-Type для HTTP-ответа (fallback на octet-stream)
export function getContentType(extension: string): string

// Список всех допустимых mime-типов (для multer-фильтра)
export function getAllowedMimeTypes(): string[]
```

---

## Изменения в существующих файлах

| Файл | Что меняется |
|------|-------------|
| `types/src/file.ts` | Удалить switch-case из `getFileDomain`, добавить импорт и делегировать в `file-types.ts`. Либо перенести функцию туда и ре-экспортировать. |
| `types/src/index.ts` | Добавить `export * from './file-types.js'` |
| `back/src/routers/file.router.ts` | Заменить `CONTENT_TYPE_BY_EXTENSION` → `getContentType()`, `allowedMimeTypes` → `getAllowedMimeTypes()`, удалить локальные константы |

---

## Новые файлы

| Файл | Действие |
|------|---------|
| `types/src/file-types.ts` | создать |

---

## Порядок выполнения

1. Создать `types/src/file-types.ts` с константами и функциями
2. Обновить `types/src/file.ts` — рефактор `getFileDomain` через `EXTENSIONS_BY_DOMAIN`
3. Обновить `types/src/index.ts` — добавить экспорт
4. Обновить `back/src/routers/file.router.ts` — убрать дублирование, использовать общие функции
5. Проверить компиляцию (`tsc --noEmit` в обоих пакетах)

Нет изменений в логике — только консолидация.
