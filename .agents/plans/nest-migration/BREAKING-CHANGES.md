# Брейкенджи миграции back → back-nest (несовместимость с текущим фронтом)

> Журнал изменений контракта API/поведения, которые **ломают совместимость** со старым фронтендом.
> Фронт правится отдельно, позже. Каждый пункт: что было → что стало → влияние → что делать фронту.
> Изменения формата (не контракта) и внутренние рефакторы сюда не пишем.

---

## Глобально

### Формат ошибок
- **Было:** кастомный `err.*` старого `back` (своя форма тела ошибки).
- **Стало:** стандартные `HttpException` NestJS (`{ statusCode, message, error }`), коды статусов по семантике.
- **Влияние:** фронт, разбирающий тело/код ошибки по-старому.
- **Фронту:** ориентироваться на стандартную форму Nest + HTTP-коды.

---

## Слой 2 — admin свёрнут в users

- **Было:** `GET /admin/users`, `POST /admin/users` (модуль admin).
- **Стало:** `GET /users`, `POST /users` (под `AuthGuard` + `AdminGuard`); отдельного `/admin` нет.
- **Влияние:** вызовы списка/создания пользователей админом.
- **Фронту:** переключить пути на `/users`.

---

## Слой 4 — worker-runtime переписан на Effect (Job/JobRun)

Самый крупный брейкендж. Старая модель воркеров (`WorkerData` + `worker-pool`) заменена durable-движком
задач на Effect (механика — в JSDoc фреймворка `back-nest/src/jobs/framework/`).

- **Коллекция/модель:** `workers` (`WorkerData`) → новый рекурсивный **`JobRun`** (коллекция `jobRuns`,
  файл `job-runs.json`). Старый `workers.json` — legacy, данные не мигрируются.
- **Эндпоинты `/workers`** (под-шаг 4.6) переключаются на `JobRun`:
  - `GET /workers` — теперь список прогонов `JobRun` (другая форма ответа: `status` ∈
    `queued|running|succeeded|failed|cancelled`, дерево `steps`, `memo`, `progress` — вместо полей `WorkerData`).
  - `GET /workers/:id/preview-prompt` — промпт берётся из `memo.finalPrompt` LLM-узла (а не из `WorkerData.finalPrompt`).
  - `POST /workers/:id/apply-worker-data` — повторно прогоняет терминальный apply-узел (семантика та же, источник иной).
  - `DELETE /workers/:id` — удаляет прогон (нельзя для `running`).
- **Статусы:** `Active/Success/Failed/Stopped` (WorkerStatus) → `queued/running/succeeded/failed/cancelled` (JobStatus).
- **Влияние:** UI-следилка воркеров, превью промпта, применение результата, отображение статусов/прогресса.
- **Фронту:** перейти на модель `JobRun`; для прогресса использовать дерево `steps` (или серверный
  расчёт `progressStages`/`overallProgress`); маппинг статусов обновить.

> Пути маршрута пока сохраняем `/workers` (переименование в `/workflows` — отдельным решением, если делать).
