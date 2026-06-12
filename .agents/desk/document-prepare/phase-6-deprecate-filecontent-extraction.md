# Фаза 6 — Deprecation FileContent extraction

## Статус

Выполнено.

## Цель

Отключить синхронный путь извлечения в `FileContent`, сохранив read-only API и legacy-код для последующего удаления (Фаза 7).

## Изменения

### HTTP

- `POST /files-content/:fileId/extract` — **410 Gone** (`GoneException`), текст на русском с указанием DPS:
  - `POST /documents/:fileId/prepare`
  - автоподготовка при upload (Фаза 4)
- Read-only эндпоинты без изменений:
  - `GET /files-content/:fileId`
  - `GET /files-content/records/:contentId/tokens`
  - `POST /files-content/records/:contentId` (soft-delete)

### Deprecation markers

| Объект | Файл |
|--------|------|
| `FilesContentController.extract` | `files-content.controller.ts` |
| `ExtractionService`, `extract()`, `runExtraction()` | `extraction/extraction.service.ts` |
| `extractDocumentContent` | `extraction/extract-document.ts` |
| `extractSpreadsheetContent` | `extraction/extract-spreadsheet.ts` |
| `extractTextContent` | `extraction/extract-text.ts` |
| Модуль (комментарий) | `files-content.module.ts` |

Код generators и `ExtractionService` **оставлен** в репозитории, но **не вызывается** из контроллера.

### Вызовы `ExtractionService.extract()`

Единственный вызывающий — контроллер (удалён). Других вызовов в `back-nest` нет.

### Legacy jobs (не затронуты)

| Компонент | Связь с extract endpoint |
|-----------|--------------------------|
| `ExtractVisualJob` | Нет — пишет `FileContent` через `FilesContentService` + scan jobs |
| `tc-extract.job` | Нет — читает `FileContent`, свой LLM-пайплайн |
| `analyse-application.job` | Нет — дочерний `extract-visual`, не HTTP extract |
| `front/useExtractFileContent` | Вызывает deprecated endpoint → получит 410 |

### Не делалось (по scope)

- Prisma / таблица `FileContent`
- Удаление npm-пакетов (`mammoth`, `xlsx`, `papaparse`) — Фаза 7
- `ApplicationChunkReader` — Фаза 5
- Миграция данных

## Проверки

```bash
cd back-nest && npx tsc --noEmit
```

## Следующий шаг

Фаза 7 — аудит зависимостей extraction path и безопасное удаление пакетов.
