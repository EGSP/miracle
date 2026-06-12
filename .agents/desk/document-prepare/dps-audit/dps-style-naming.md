# DPS — стиль, нейминг, мелочи

Дополнение к [`dps-audit.md`](./dps-audit.md). Здесь — некритичные замечания: стиль, нейминг, мелкие упрощения. Ничего из этого не ломает поведение.

## Нейминг и согласованность

- **`succeeded` vs `succeed`.** Enum `PrepareStatus` использует `succeeded`/`failed` (prisma), а `JobRun.status` — `succeed`/`failed`. Два соседних энума с разным временем глагола — реальный футган: при аудите я сам сначала принял `enqueuePrepare` строку 111 (`existingRun?.status === 'succeed'`) за опечатку. Она корректна (это статус JobRun), но именно потому что глаза цепляются. Стоит либо выровнять, либо хотя бы оставить комментарий у строки 111: «`succeed` — статус JobRun, не PreparedDocument».

- **Язык лейблов.** `tryLabeledPromise('mark running', ...)`, `'mark failed'`, `'mark succeeded'` (`prepare-document.job.ts:47,58`, `prepare-apply.tool.ts:33`) — английские лейблы посреди русских (`'подготовка документа'`, `'извлечение через kreuzberg'`). Привести к одному языку (по проекту — русский).

- **«Фаза 2 / Фаза 3» в JSDoc** (`prepare-document.job.ts:29`, `kreuzberg-concurrency.limiter.ts:6`). Ссылки на фазы внедрения протухнут — заменить на описание поведения, а не этап проекта.

## Дублирование констант

- **`POLL_INTERVAL_MS = 3000`** объявлена дважды: `vision-recognize.tool.ts:11` и `llm-vision.extractor.ts:23`. После сведения poll в общий хелпер (A1) — одна константа.
- **Промпты vision** (`LLM_VISION_PROMPT`/`LLM_VISION_USER`) существуют в `document-prepare/vision/prompts.ts` и в `scan/scan.shared.ts`. Один источник (см. A8 в основном отчёте).

## Типизация

- **Слабая типизация meta.** `markSucceeded` принимает `pages?: unknown; meta?: unknown` и кастит в `object | undefined` (`document-prepare.service.ts:46-63`). `PreparedResult.meta` уже `Record<string, unknown>` — можно протащить тип без `unknown`-промежутка.
- **`file.id!` / `file.id ?? filePath`.** Non-null assertion в `getStoredFileName` (`files.service.ts:94`) и фолбэк `file.id ?? filePath` в `llm-vision.extractor.ts:36`. Для `Stored<FileModel>` id всегда есть — фолбэки вводят в заблуждение (создают видимость, что id бывает пустым). Убрать или типизировать `Stored` так, чтобы `id` был обязателен.
- **`VisionRenderTool` с `ToolMemo.Model`** как memo-параметром (`vision-render.tool.ts:27`) — тул ничего не пишет в memo. Корректно, но можно типизировать пустой моделью явно (`{}`), чтобы было видно «памяти нет».

## Мелкие упрощения

- **Кэш-ветка `kreuzberg-extract.tool.ts:36-39`** возвращает `{ markdown, pages, meta }`, где `pages`/`meta` тянутся отдельными `memo.get`. Можно одним `memo.get()` без селектора достать всю модель и вернуть её — меньше round-trip'ов к `SynchronizedRef`.
- **`responseFragment`** использует символ `…` (U+2026). Ок, но проверь, что консоль/логи проекта не ломают многобайтовый юникод (в остальном коде встречается).
- **`extract()`-фасад vision** после удаления (C3) уберёт и `implements DocumentExtractor` у `LlmVisionExtractor` — поле `engine` тогда стоит оставить как простой дискриминатор, а не как часть несоблюдаемого порта.

## Документация

- README модуля (`document-prepare/README.md`) утверждает, что `llm-vision.extractor.ts` `implements DocumentExtractor` (строка 47) — формально да, но фактически `extract()` мёртв. После рефактора C3/A3 синхронизировать README, чтобы он не описывал несуществующий путь.
- Семантику reset (после `succeed` — снос дерева/memo; после `failed` — reuse/resume) стоит закрепить в README — сейчас она выводится только из чтения `enqueuePrepare`.
