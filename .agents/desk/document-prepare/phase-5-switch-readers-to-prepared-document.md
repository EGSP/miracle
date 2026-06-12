# Фаза 5 — переключение readers на PreparedDocument (orders)

Дата: 2026-06-12  
Scope: `ApplicationChunkReader` + DI в `OrdersModule` (без order jobs и `tc-extract.job`).

## Цель

Читатели приложений заказа должны получать унифицированный markdown из DPS (`PreparedDocument`), а не через inline-парсеры и legacy `FileContent`.

## Изменения

### `ApplicationChunkReader`

| Было | Стало |
|------|-------|
| docx → mammoth, xlsx/csv → XLSX/papaparse, txt/md → fs | Все домены → `PreparedDocument.markdown` |
| VISUAL → постранично из `FileContent` | VISUAL → один markdown-чанк из DPS |
| SPREADSHEET → чанки по 15 строк | Один чанк `{ chunkKey: 'markdown', chunk: { text } }` |
| Зависимости: mammoth, xlsx, papaparse, fs, FilesContentService | `DocumentPrepareService`, `FilesService` |

### Новый API

```ts
async *getMarkdown(fileId: string): AsyncGenerator<string>
```

- Сейчас: одна `yield` с полным markdown при `status === 'succeeded'`.
- Будущее: можно добавить итерации по страницам/листам без смены сигнатуры.

### Ошибки (fail-fast)

| Состояние | Сообщение |
|-----------|-----------|
| Нет записи | `не имеет подготовленного документа (PreparedDocument)` |
| `queued` | `ожидает подготовку (PreparedDocument: queued)` |
| `running` | `подготавливается (PreparedDocument: running)` |
| `failed` | `не подготовлен: <error>` |
| `succeeded`, пустой markdown | `подготовка завершена, но markdown пуст` |

### DI

`OrdersModule` импортирует `DocumentPrepareModule` (экспортирует `DocumentPrepareService`).

## Не изменено (по scope)

- `analyse-application.job.ts` — по-прежнему вызывает `extract-visual` для VISUAL до `reader.read()`; DPS-подготовку нужно обеспечивать отдельно (Фаза 4 upload-хук или ручной POST `/documents/:fileId/prepare`).
- `tc-extract.job.ts` — остаётся на legacy path.
- Prisma, order jobs.

## Проверки

```bash
cd back-nest && npx tsc --noEmit
```

## Рекомендации для оркестратора

1. **Фаза 4** — автоподготовка на upload, иначе `analyse-application` для файлов без `PreparedDocument` упадёт на чтении чанков (раньше docx/xlsx читались инлайн).
2. **Остаток Фазы 5** — `tc-extract.job` на тот же паттерн `getMarkdown`.
3. После Фазы 4 — убрать или заменить `extract-visual` в `analyse-application` (Фаза 6 / отдельная задача).
