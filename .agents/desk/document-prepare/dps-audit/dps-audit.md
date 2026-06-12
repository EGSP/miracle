# Аудит Document Prepare Service (DPS)

> **Статус (2026-06-12, после отработки):** C1, C2, C3, A1, A2, A3, A5, A8, E3/E4 и мелочи стиля — **реализованы**. Vision сведён к единому `extract()` (durable opId намеренно отброшен — решение владельца, KISS). `succeeded→succeed` — миграция подготовлена, не запущена. E2 (Data.TaggedError по всей системе) и A6-консолидация вынесены в [`../../effect-adoption/effect-adoption-audit.md`](../../effect-adoption/effect-adoption-audit.md). A6 (глобальный семафор Yandex) — реализован. Этот файл — исходные находки.

**Дата:** 2026-06-12
**Аудитор:** Claude (Opus 4.8)
**Область:** модуль `back-nest/src/document-prepare` + его джобы/инструменты, точки интеграции (`files`, listener), потребитель (`ApplicationChunkReader` → анализ заказа), пересечение с legacy-форком (`extract-visual` / `scan.shared` / `FileContent`).
**Фокус (по запросу):** корректность Effect · надёжность jobs (durability/идемпотентность) · архитектура/дублирование. Безопасность вынесена за скобки.

Мелкие замечания по стилю/неймингу — в отдельном файле [`dps-style-naming.md`](./dps-style-naming.md).

---

## 0. Сводка по серьёзности

| # | Находка | Severity | Файл |
|---|---------|----------|------|
| C1 | Гонка в `enqueuePrepare` → дубли/осиротевшие `PreparedDocument` | 🔴 HIGH | `document-prepare.service.ts:84` |
| C2 | Бесконечный poll без deadline/backoff (vision) | 🔴 HIGH | `vision-recognize.tool.ts:68` |
| C3 | Мёртвый код: `LlmVisionExtractor.extract()` + приватный `pollUntilDone` | 🟠 MEDIUM | `llm-vision.extractor.ts:35,103` |
| A1 | Тройное дублирование poll-цикла | 🟠 MEDIUM | vision-recognize / llm-vision |
| A2 | Дублирование загрузки файла → нужен `files.effects.require` | 🟠 MEDIUM | tools + reader |
| A3 | Порт `DocumentExtractor` асимметричен (kreuzberg vs vision) | 🟠 MEDIUM | `extractor.port.ts:25` |
| A4 | Нет транзакционности `PreparedDocument` ↔ `JobRun` в enqueue | 🟡 LOW | `document-prepare.service.ts` |
| A5 | health-check на каждый extract внутри семафора | 🟡 LOW | `kreuzberg-http.extractor.ts:94` |
| A6 | У vision нет лимита параллелизма (у kreuzberg есть) | 🟡 LOW | — |
| E2 | Ad-hoc tagged errors вместо `Data.TaggedError` → нет `catchTag` | 🟠 MEDIUM | `errors.ts`, `extractor.port.ts` |
| A8 | Две модели текста (`FileContent` vs `PreparedDocument`) | 🟠 MEDIUM | legacy-форк |

Положительное отмечено в §5.

---

## 1. Корректность Effect

### E1 — `Effect.runSync(Effect.makeSemaphore(...))` в `onModuleInit` — OK
`kreuzberg-concurrency.limiter.ts:16`. `makeSemaphore` — чистый синхронный конструктор, `runSync` здесь безопасен, утечки fiber/scope нет. Замечаний нет.

### E2 — Ошибки не на `Data.TaggedError` 🟠
`ExtractError`, `ApplicationReadError` — руками собранные литералы `{ _tag, message }` (`errors.ts:4`, `extractor.port.ts:19`, `application-chunk-reader.ts:11`), плюс ручной guard `isExtractError` (`errors.ts:6`).

Последствия:
- В `prepare-document.job.ts:20-25` `formatJobError` **повторно** нюхает `_tag` руками, потому что на границе `catchAll` тип ошибки — `unknown`.
- Нельзя пользоваться `Effect.catchTag` / `catchTags` — везде `mapError`/`catchAll` вручную.

Рекомендация: перевести доменные ошибки на `Data.TaggedError("ExtractError")<{ message }>`. Тогда канал ошибки типизирован сквозняком, `isExtractError`/`formatJobError` удаляются, появляется `catchTag`. Это особенно окупится под второй алгоритм анализа (см. §4) — ошибки инструментов v2 будут композиться декларативно.

### E4 — `mapError`-бойлерплейт на каждом `effects.get`
Каждый вызов `files.effects.get` оборачивается одинаковым `Effect.mapError(() => ExtractError)`. Снимается вместе с A2 (`require` + общий маппер `toExtractError`).

---

## 2. Надёжность jobs (durability / идемпотентность)

### C2 — Бесконечный poll без дедлайна 🔴
`vision-recognize.tool.ts:68-83` (и мёртвый близнец `llm-vision.extractor.ts:103-118`):

```ts
while (true) {
    const poll = yield* this.extractor.pollOnce(opId)...
    if (poll.done === true) return poll;
    yield* Effect.sleep(Duration.millis(POLL_INTERVAL_MS)); // 3000, фикс
}
```

Нет ни максимума попыток, ни общего дедлайна, ни backoff. Если операция Yandex «зависла» и не приходит `done`:
- fiber крутится **вечно**, `JobRun` навсегда `running`;
- при каждом рестарте `onApplicationBootstrap` (`jobs.service.ts:137`) поднимает `running`-корни → зомби-прогон возрождается и снова крутит poll бесконечно;
- статус так и не перейдёт в `failed` — пользователь не получит сигнала.

Рекомендация: добавить дедлайн/лимит попыток (например `Effect.timeoutFail` на весь `pollUntilDone` или счётчик с экспоненциальным backoff). По истечении — `ExtractError` → запись `failed`. Дедлайн закоммитить в `opId`-checkpoint (или хранить `startedAt` в memo), чтобы он переживал resume, а не сбрасывался при каждом подъёме.

### C1 — Гонка в `enqueuePrepare` → дубли `PreparedDocument` 🔴
`document-prepare.service.ts:84-154`. Метод вызывается из **двух** триггеров, потенциально одновременно:
1. listener на upload — `document-prepare-upload.listener.ts:28` (fire-and-forget `void ... .catch()`);
2. контроллер `POST /documents/:fileId/prepare`.

Метод неатомарен: `findByKey` → ветка → `getLatestByFile` → `create`/`update` → `jobs.start`. При этом **на `PreparedDocument.fileId` нет уникального индекса** (в схеме только `@@index`, не `@@unique`).

Сценарий гонки (свежий файл, два конкурентных вызова):
- оба видят `existingRun == null` и `existing == null`;
- оба делают `preparedDocument.create` → **две строки** `queued` на один `fileId`;
- `jobs.start` идемпотентен по `keyHash` (`jobs.service.ts:63` `findOrCreate`) → реально стартует **один** прогон с **одним** `preparedDocumentId`;
- вторая строка остаётся `queued` навсегда (осиротевшая).

Дальше `ApplicationChunkReader.requireSucceededMarkdown` берёт `getLatestByFile` = `orderBy updatedAt desc` (`document-prepare.service.ts:27`). Он может выбрать осиротевшую `queued`-строку → анализ заявки падает с «Файл ожидает подготовку», хотя подготовка по факту прошла.

Условия: двойной upload, upload + немедленный авто-POST с фронта, повторная отправка формы / React StrictMode. Не экзотика.

Рекомендация (в порядке предпочтения):
1. Партиальный уникальный индекс `PreparedDocument(fileId) WHERE deletedAt IS NULL` + `upsert` по `fileId` вместо `getLatestByFile`+`create`. Модель и так подразумевает «одна актуальная подготовка на файл».
2. Либо обернуть весь enqueue в `$transaction` с `SELECT ... FOR UPDATE` по строке файла.

### C3 / A1 / A4 / D-замечания
- **C3** мёртвый код см. §3.
- **A4** В `enqueuePrepare` `PreparedDocument` и `JobRun` создаются отдельными `await` без транзакции; падение между `jobs.start` и финальным `update jobRunId` (строки 137-148) оставит рассинхрон `prepared.jobRunId`. Низкий риск, но в одной транзакции с C1-фиксом снимается даром.

### Что с durability сделано ПРАВИЛЬНО (важно сохранить)
- **Resume vision корректен:** при крахе после submit `opId` лежит в `ToolMemo` (`vision-recognize.tool.ts:44-50`), resume переиспользует его и не пере-сабмитит дорогой Vision. Render намеренно не кэшируется (`vision-render.tool.ts:19-24`) — осознанный размен «дешевле перерисовать, чем держать base64 в `job_runs.memo`».
- **`PrepareApplyTool` идемпотентен** через флаг `applied` (`prepare-apply.tool.ts:28-40`); `markSucceeded` — перезапись, повтор безвреден.
- **Семантика reset:** после `succeed` enqueue сносит дерево прогона (чистит memo) → честный re-prepare; после `failed` строка переиспользуется с сохранённым memo → resume с чекпойнта. Логично, но **нигде явно не задокументировано** — стоит закрепить комментарием/README, иначе легко сломать при правках.

---

## 3. Архитектура и дублирование

### C3 — Мёртвый код в `LlmVisionExtractor` 🟠
Подтверждено grep: `LlmVisionExtractor.extract()` **не вызывается нигде** (вызывается только `KreuzbergHttpExtractor.extract()` в `kreuzberg-extract.tool.ts:58`). Vision-поток идёт через инструменты, которые дёргают `renderPages` / `submit` / `pollOnce` / `toPreparedResult` гранулярно. Значит мертвы:
- `LlmVisionExtractor.extract()` (`llm-vision.extractor.ts:35-45`);
- приватный `pollUntilDone` (`llm-vision.extractor.ts:103-118`).

Это ловушка: мёртвый `pollUntilDone` уже разошёлся с живым в `vision-recognize.tool.ts` (та же логика в двух местах — A1). Удалить мёртвые методы.

### A1 — Тройное дублирование poll-цикла 🟠
Один и тот же `while(true)+sleep` живёт в: `vision-recognize.tool.ts:68` (живой), `llm-vision.extractor.ts:103` (мёртвый). Свести в один хелпер, например:

```ts
// document-prepare/vision/poll.ts
export const pollUntilDone = <A, E>(
    pollOnce: Effect.Effect<{ done: false } | A, E>,
    opts: { intervalMs: number; deadline: Duration.Duration },
): Effect.Effect<A, E | ExtractError> => ...
```

Это закрывает C2 и A1 разом: дедлайн появляется в одном месте.

### A2 — Дублирование загрузки файла → `files.effects.require(fileId)` 🟠 — ДА, добавлять
Идентичный блок «get → mapError → if null fail "не найден"» встречается трижды:
- `kreuzberg-extract.tool.ts:42-55`
- `vision-render.tool.ts:38-51`
- вариант в `application-chunk-reader.ts:54-64`

Предлагаемый API в `FilesService`:

```ts
readonly effects = {
    get: (id: string) => tryLabeledPromise(..., () => this.get(id)),
    require: (id: string): Effect.Effect<Stored<FileModel>, FileNotFoundError> =>
        this.effects.get(id).pipe(
            Effect.mapError((e) => new FileNotFoundError({ id, cause: e })),
            Effect.flatMap((row) =>
                row ? Effect.succeed(row) : Effect.fail(new FileNotFoundError({ id })),
            ),
        ),
};
```

`FileNotFoundError` — `Data.TaggedError` (связка с E2). На каждом из трёх мест убирает ~12 строк, централизует текст «не найден», даёт `catchTag(FileNotFoundError)`. **Вердикт: добавить.** Это прямой ответ на вопрос из задания.

> Нюанс: сейчас tools отображают ошибку чтения в `ExtractError` ещё ДО null-проверки, а для null строят отдельный `ExtractError`. С `require` обе ветки схлопываются в один `mapError(toExtractError)`.

### A3 — Порт `DocumentExtractor` асимметричен 🟠
`DocumentExtractor.extract()` (`extractor.port.ts:25`) честно реализует только Kreuzberg (tool вызывает `.extract()` целиком). Vision же разложен на гранулярные шаги в двух инструментах, а `extract()` у него — фасад-пустышка (мёртвый, C3). Порт делает вид, что движки однотипны, хотя контракт держит только один.

Под второй алгоритм (см. §4) это критично: нужен честный единый контракт. Решить ОДИН паттерн:
- **(а)** экстрактор отдаёт гранулярные шаги (`submit`/`pollOnce`/...), tools оркестрируют durable-чекпойнты — нужен Vision из-за `opId`. Привести Kreuzberg к той же форме (его шаг один — `extract`, но обернуть единообразно).
- **(б)** оставить `extract()` единицей работы, tool лишь кэширует финал — тогда Vision не получит durable-`opId`.

Поскольку durable-`opId` — ценное свойство, рекомендую (а) и явно убрать `extract()` из vision-адаптера.

### A5 / A6 — параллелизм
- **A5** Каждый kreuzberg-extract делает синхронный `GET /health` (+fallback `/version`) перед POST, **внутри** permit семафора (`kreuzberg-http.extractor.ts:94-105`). При concurrency=N это лишний round-trip на документ и сериализация health за permit. Дёшево исправить: кэшировать health на несколько секунд или вовсе убрать (POST сам вернёт ошибку). LOW.
- **A6** Kreuzberg огорожен семафором, а Vision (Yandex submit/poll) — нет. Пакетная загрузка картинок/PDF → неограниченные параллельные submit. Облако, вероятно, само троттлит, но асимметрия с kreuzberg-гардом заметна. Решить осознанно при масштабировании. LOW-MEDIUM.

---

## 4. Широкий охват: фундамент под два алгоритма анализа заказа

Контекст из задания: текущий алгоритм переносится на новые инструменты в свою папку, новый — в `analyse-order-v2/` (свои джобы/промпты).

### Текущее состояние (хорошее)
Текущий алгоритм уже живёт в `jobs/implementations/order/` (`analyse-order` → `analyse-application` → `extract-positions-from-chunk` + `analyse-designation`) и **уже читает `PreparedDocument`** через `ApplicationChunkReader` (`analyse-application.job.ts`, `application-chunk-reader.ts:80`). То есть DPS уже работает как общий слой «документ → markdown» для чтения.

### Проблема: параллельный legacy-форк vision
Существует **второй** vision-пайплайн, не на DPS:
`extract-visual.job.ts` → `scan/scan.shared.ts` → `FileContent` (модель `files-content`).
Он дублирует то же, что DPS делает через `vision-render`/`vision-recognize`, но пишет в `FileContent`, а не `PreparedDocument`. Промпты `LLM_VISION_PROMPT`/`LLM_VISION_USER` существуют в ДВУХ местах: `document-prepare/vision/prompts.ts` и `scan/scan.shared.ts` — уже риск рассинхрона.

### Рекомендации по структуре под v1/v2
1. **DPS — общий, не форкать.** `document-prepare/` + `jobs/.../document-prepare/` остаются единственным слоем «документ → markdown» для ОБОИХ алгоритмов. v2 не должен заводить свой extract.
2. **Общий ридер-контракт в нейтральном месте.** `ApplicationChunkReader` (и доступ к `PreparedDocument`) должны импортироваться обоими версиями. Не дать v2 переписать чтение заново. Кандидат: вынести «получить готовый markdown заявки» в один helper `getPreparedMarkdown(fileId): Effect<string, ...>` (рекомендация предыдущего агента — поддерживаю).
3. **Сначала вывести из эксплуатации legacy-форк, потом строить v2.** Декоммишн `extract-visual` / `scan.shared` / `FileContent` (когда никто не читает `FileContent`), иначе v2 унаследует два источника контента и два экземпляра промптов.
4. **Папки:** текущий алгоритм → `jobs/implementations/analyse-order-v1/` (или оставить `order/` как v1), новый → `analyse-order-v2/` со своими промптами; общий DPS и общий ридер — снаружи обеих папок.
5. **Ошибки на `Data.TaggedError` (E2)** — чтобы инструменты/промпты v2 композились через `catchTag`, а не через ручные guard'ы.

---

## 5. Что сделано хорошо

- Чистое разделение «домен (`document-prepare/`) vs job-реализация (`jobs/implementations/`)».
- DPS — единственный инициатор подготовки (хук `onFileSaved` + явный POST); потребители подготовку не запускают (`application-chunk-reader.ts` падает на неготовом файле вместо самозапуска) — правильная развязка.
- Durable-checkpoint vision (`opId` в memo) и идемпотентный apply — корректный durability-дизайн.
- Семафор kreuzberg как process-local гард — уместно.
- Типобезопасный `ToolMemo` с fiber-safe `SynchronizedRef` и немедленным персистом (`runtime.ts:76-86`) — защищает от lost-update.
- Парсер ответа kreuzberg (`parseKreuzbergExtractBody`) терпим к разным формам контракта — разумно для внешнего сервиса.

---

## 6. Приоритизированный план действий

**Срочно (корректность/надёжность):**
1. C1 — уникальность `PreparedDocument(fileId)` + upsert/транзакция в `enqueuePrepare`.
2. C2 — дедлайн/backoff в poll vision (переживающий resume).

**Важно (архитектура/будущее):**
3. C3+A1 — удалить мёртвый `extract()`/`pollUntilDone` в vision, свести poll в один хелпер с дедлайном.
4. A2 — добавить `files.effects.require(fileId)` (+ `FileNotFoundError` как `Data.TaggedError`), применить в 3 местах.
5. E2 — доменные ошибки на `Data.TaggedError`, убрать `isExtractError`/`formatJobError`.
6. A3 — определиться с единым контрактом extractor под v1/v2.
7. A8 — декоммишн legacy-форка (`extract-visual`/`scan.shared`/`FileContent`) до старта v2; единый экземпляр промптов.

**Низкий приоритет:**
8. A5 — не дёргать health на каждый extract.
9. A6 — решить про лимит параллелизма vision.
10. A4 — транзакционность enqueue (закрывается вместе с C1).
