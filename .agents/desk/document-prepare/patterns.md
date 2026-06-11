# Паттерны Document Prepare Service (DPS)

Точка входа для implementer. Детальные разделы — во вложенных файлах.

| Раздел | Файл | Содержание |
|--------|------|------------|
| Effect | [effect-patterns.md](./effect-patterns.md) | `Effect.gen`, `tryLabeledPromise`, ToolMemo, Semaphore limiter, tagged errors |
| Job / JobTool | [job-patterns.md](./job-patterns.md) | `prepare-document`, размещение файлов, JobTool, миграция Фазы 1 |
| LLM Vision (Фаза 3) | [llm-vision-migration.md](./llm-vision-migration.md) | Декомпозиция tools, ToolMemo submit/poll, промпты, риски |

## Быстрый чеклист

- Одна root job `prepare-document`, `engine` в input, key `['prepare-document', fileId]`.
- Шаги pipeline — `JobTool` + `ToolMemo`, не child jobs.
- Kreuzberg HTTP — за process-local `KreuzbergConcurrencyLimiter`.
- Vision checkpoint (`opId`, промпт, результат) — в ToolMemo тула `vision.recognize.v1`.
- Job в `jobs/implementations/document-prepare/`, домен без `@JobImpl`.

План реализации: `.agents/plans/dp-agents.plan.md`, статус: `.agents/plans/dp.report.md`.
