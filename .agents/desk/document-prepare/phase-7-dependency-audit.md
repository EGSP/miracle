# Фаза 7 — Dependency audit (extraction path)

Дата: 2026-06-12  
Scope: `back-nest` (основной runtime DPS).

## Метод

Поиск импортов `mammoth`, `xlsx`/SheetJS, `papaparse`, каталога `files-content/extraction/*`. Отделение от report-generation (`exceljs`).

## Безопасно удалено

| Пакет / код | Было | Обоснование |
|-------------|------|-------------|
| `mammoth` | `extract-document.ts` (docx) | DPS/kreuzberg; `ApplicationChunkReader` на `PreparedDocument` |
| `papaparse` | `extract-spreadsheet.ts` (csv/tsv) | то же |
| `xlsx` (SheetJS) | `extract-spreadsheet.ts` (xls/xlsx/ods) | то же; **не** путать с `exceljs` |
| `@types/papaparse` | devDependency | вместе с papaparse |
| `files-content/extraction/*` | ExtractionService + 3 generators | endpoint extract → 410 с Фазы 6; мёртвый код |
| `dto/extract-content-query.dto.ts` | не использовался в контроллере | orphan |

Удалены из `back-nest/package.json`. Папка `extraction/` очищена.

## Оставить (с обоснованием)

| Пакет / модуль | Где используется | Зачем |
|----------------|------------------|-------|
| `exceljs` | `orders/reports/*` (1C commerce offer) | **Генерация отчётов** xlsx, не extraction |
| `FilesContentService` + модуль | legacy scan jobs (`llm-vision`, `ocr`), `extract-visual`, `tc-extract`, read-only GET | Исторические данные `FileContent`; миграция readers — отдельные задачи |
| `pdfjs-dist`, `canvas` | `ConvertService` | PDF → images для LLM Vision (DPS) |
| `POST /files-content/:fileId/extract` | controller | 410 Gone — явный сигнал клиентам |
| `ExtractContentQuerySchema` в `@miracle/types` | generated client `front` | до миграции UI на DPS |

## Вне scope `back-nest` (не трогали)

| Путь | Примечание |
|------|------------|
| `back/` (legacy lowdb) | свой `lib/extraction/*` + mammoth/xlsx/papaparse в `back/package.json` |
| `front/` | `useExtractFileContent` → deprecated endpoint; нужен переход на `POST /documents/:fileId/prepare` + `GET /documents/:fileId/prepared` |
| Legacy jobs `extract-visual`, scan `llm-vision`/`ocr` | пишут в `FileContent`; не часть sync extraction path |

## Проверки

- `npx tsc --noEmit` в `back-nest/` — после удаления
- `npm install` в корне monorepo — обновление lockfile

## Рекомендации после Фазы 7

1. **Front:** заменить `FileCard` extraction UI на статус `PreparedDocument`.
2. **Jobs:** deprecate `extract-visual` в `analyse-application` (уже не вызывается); `tc-extract` → `PreparedDocument`.
3. **Legacy `back/`:** отдельный аудит при выводе из эксплуатации.
