# Отчёт: паттерны DPS

Исследование кодовой базы miracle для Document Prepare Service. Артефакты подготовлены для implementer-субагентов по плану `dp-agents`.

## Цель

Зафиксировать паттерны Effect, jobs framework и целевую архитектуру DPS на основе существующего кода `back-nest`, чтобы реализация не расходилась с конвенциями проекта.

## Ключевые выводы

1. **Одна job** `prepare-document` вместо отдельных jobs по движку; диспетчеризация по `input.engine`.
2. **JobTool** для шагов extract / recognize / apply внутри одного `JobRun`; child jobs — только для междоменной оркестрации.
3. **Process-local Semaphore** для kreuzberg; Swarm не заменяет глобальный лимит HTTP.
4. **ToolMemo** для durable checkpoint Vision (opId, промпт, ответ).
5. Разделение: домен в `document-prepare/`, job/tools в `jobs/implementations/document-prepare/`.

## Артефакты

- `patterns.md` — оглавление и чеклист.
- `effect-patterns.md` — Effect-стиль и concurrency.
- `job-patterns.md` — фреймворк jobs, структура файлов, миграция.

## Открытые вопросы

- Распределённый лимитер kreuzberg при нескольких backend-инстансах — вне MVP.
- Версионирование tool types (`v2`) при смене промпта/алгоритма — по мере необходимости.
