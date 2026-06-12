# Системный аудит: Effect-адопция и Data.TaggedError

**Дата:** 2026-06-12
**Аудитор:** Claude (Opus 4.8)
**Запрос:** где по всей системе стоит (1) ввести `Data.TaggedError`, (2) перевести код на Effect без сильных потерь, (3) добавить сервисам Effect-аналоги промисных методов либо заменить промисные на Effect — с учётом, что проект уже широко использует Effect.

> **Статус (после отработки):** ✅ Выполнено — `ExtractError`, `ApplicationReadError`, `FileNotFoundError` (новый), а также джобовские `JobChildFailedError`/`JobPartialError`/`SwarmPartialError` переведены на `Data.TaggedError`; ручные guard'ы (`isExtractError`) и `_tag`-нюхание убраны, `instanceof`/нативные комбинаторы — где уместно (catchAll/passthrough оставлены там, где они семантически верны). `cloud-job` удалён — order v1 (`extract-positions`, `analyse-designation`) переведён на `yandex.poll` + inline submit-once. **Решения владельца:** типизированный Effect-слой над Prisma НЕ вводим (п.5); `effects.*`-фасады для prisma-backed методов НЕ добавляем массово (по той же причине) — оборачиваем точечно `tryLabeledPromise`. Остаток (необязательный): разнесение `PrepareError` по тегам перед v2.

Это карта направлений и приоритетов. Точечные правки по DPS — в [`../document-prepare/dps-audit/`](../document-prepare/dps-audit/).

---

## 1. Текущая картина

Три «слоя зрелости» по работе с Effect:

| Слой | Примеры | Состояние |
|------|---------|-----------|
| **Effect-native + typed errors** | `YandexService` (`Data.TaggedError`: `YandexConfigError`/`YandexTransportError`/`YandexResponseError`), job-framework (`runtime.ts`, `fanout.ts`, `swarm.ts`) | Эталон. На него равняемся. |
| **Effect-обёртки поверх promise-сервисов** | `FilesService.effects.get/require`, доменные вызовы в jobs через `tryLabeledPromise` (47 мест) | Работает, но теряет тип ошибки → общий `Error`. |
| **Чистый promise/throw** | `DocumentPrepareService`, `OrderApplicationsService`, `OrderPositionsService`, `TechnicalConditionsService`, `FilesContentService`, бóльшая часть `FilesService` | Контроллеры зовут напрямую; jobs оборачивают каждый вызов в `tryLabeledPromise`. |

**Ключевой мост:** `common/effect-errors.ts` → `tryLabeledPromise(label, () => promise)` возвращает `Effect<Value, Error>`. Удобно, но `Error` — нетипизированный канал: на границе `catchAll` тип теряется, приходится руками нюхать (`formatJobError` в `prepare-document.job`, `isExtractError` в `document-prepare/errors.ts`).

---

## 2. Data.TaggedError — куда вводить

Принцип (по решению владельца): **там, где природа ошибки ясна; определять в домене, где ошибка возникает.** Эталон формы — `YandexService`.

### 2.1 Перевести существующие ad-hoc tagged-ошибки 🟠
Самодельные литералы `{ _tag, message }` + ручные guard'ы → классы `Data.TaggedError`:

| Сейчас | Где | Действие |
|--------|-----|----------|
| `ExtractError` (`extractor.port.ts:19`, `errors.ts`) + `isExtractError` | document-prepare | `class ExtractError extends Data.TaggedError('ExtractError')<{ message }>`. Удаляет `isExtractError` и `formatJobError`-нюхание тега в `prepare-document.job`. Открывает `Effect.catchTag`. |
| `ApplicationReadError` (`application-chunk-reader.ts:11`) | orders | то же |

После перевода `prepare-document.job.formatJobError` сокращается до `error instanceof ExtractError ? error.message : formatUnknown(error)` (или `catchTags`).

### 2.2 Ввести новые там, где сейчас «голый» Error 🟠
| Кандидат | Где возникает | Зачем |
|----------|---------------|-------|
| `FileNotFoundError` | `files` (`effects.require`) | Сейчас `require` падает обычным `Error('Файл … не найден')`. Тег позволит потребителям ловить именно «не найден» (`catchTag`) и отличать от транспортной ошибки БД. **Самый ясный кандидат.** |
| `FileTransportError` / `DbError` | `files`, прочие repo-сервисы | Обернуть провалы Prisma в типизированный транспорт вместо `wrapUnknown` → `Error`. |
| `PrepareError` (`queued`/`running`/`failed`/`empty`) | document-prepare reader | `ApplicationChunkReader.requireSucceededMarkdown` сейчас кодирует 5 исходов строками в `ApplicationReadError`. Можно разнести по тегам, чтобы потребитель (анализ заказа v1/v2) обрабатывал «ещё готовится» иначе, чем «провалилось». |

### 2.3 НЕ трогать
- Job-framework (`JobChildFailedError`, `JobPartialError`, `SwarmPartialError`) — уже классы-ошибки с понятной семантикой; перевод на `Data.TaggedError` не даёт выгоды.
- Разовые `BadRequestException`/`NotFoundException` в контроллерах/сервисах — это HTTP-слой Nest, ему теги не нужны.

---

## 3. Сервисы: Effect-аналоги промисных методов

Паттерн `tryLabeledPromise(label, () => service.method())` повторяется в jobs десятки раз. Это сигнал: методам, которые **в основном зовут из Effect-кода (jobs/tools/readers)**, стоит дать `effects.*`-аналог (как уже сделано у `FilesService.effects.get/require`).

### Приоритетные кандидаты

| Сервис | Методы, зовущиеся из Effect | Рекомендация |
|--------|------------------------------|--------------|
| **`DocumentPrepareService`** | `markRunning` / `markFailed` / `markSucceeded` (обёрнуты в `tryLabeledPromise` в `prepare-document.job`, `prepare-apply.tool`), `getLatestByFile` (в reader) | Добавить `effects.markRunning/markFailed/markSucceeded/getLatestByFile`. Убирает бойлерплейт в джобе и тулах. Типизировать ошибку как `Data.TaggedError`. |
| **`OrderApplicationsService` / `OrderPositionsService`** | вызовы из `analyse-*` джоб через `tryLabeledPromise` | `effects.*` для методов, используемых в оркестрации. |
| **`TechnicalConditionsService`** | из `tc-extract.job` | `effects.*` по мере миграции TC. |
| **`FilesService`** | уже есть `effects.get/require`; остальное (`getFilePath` — синхронный, ок) | Расширять `effects` по факту использования из Effect, не «на всякий случай». |

### Где НЕ конвертировать
- Методы, которые зовут **только контроллеры** (HTTP-слой) — им promise естественнее, Nest сам разворачивает. Двойной API (promise + effect) заводить только при реальном потреблении из Effect.
- Синхронные хелперы (`getFilePath`, `getStoredFileName`) — оставить как есть.

**Антипаттерн, которого избегать:** дублировать каждый метод в promise- и effect-варианте «впрок». Конвертируем по факту вызова из Effect; единичный вызов проще обернуть `tryLabeledPromise` на месте.

---

## 4. Что можно перевести на Effect без сильных потерь

| Область | Оценка |
|---------|--------|
| **Доменные сервисы оркестрации** (`DocumentPrepareService`, order-сервисы) | ✅ Высокая выгода: их зовут из Effect-джоб. `effects.*`-фасад + typed errors. |
| **`common/cloud-job.ts`** (`submitOnceEffect`/`pollUntilDoneEffect`) | ⚠️ Дубль логики ожидания, параллельной `YandexService.poll`. Кандидат на консолидацию: order-джобы (extract-positions, analyse-designation) и tc-extract могли бы перейти на `yandex.poll` + `createResponse`, удалив `cloud-job` poll-хелперы. Снизит число «источников правды» ожидания до одного. |
| **Контроллеры** | ❌ Низкая выгода: HTTP-граница, Nest-исключения уместнее. Оставить promise. |
| **Repo-доступ (Prisma)** | 🟡 Перевод на `effects.*` оправдан только под Effect-потребителей; для CRUD из контроллеров — нет. |

---

## 5. Приоритизированный план (для отдельной реализации)

**Высокий:**
1. `ExtractError` и `ApplicationReadError` → `Data.TaggedError`; удалить `isExtractError`, упростить `formatJobError`.
2. `FileNotFoundError` (`Data.TaggedError`) + типизировать им `files.effects.require`.
3. `DocumentPrepareService.effects.*` (mark*, getLatestByFile) — убрать `tryLabeledPromise`-бойлерплейт в DPS-джобе и тулах.

**Средний:**
4. Консолидировать ожидание Yandex: перевести order/tc джобы с `cloud-job.pollUntilDoneEffect` на `YandexService.poll`; удалить дублирующие poll-хелперы.
5. `effects.*` для order-сервисов под анализ заказа (актуально при разводе v1/v2).
6. Разнести исходы `PrepareError` по тегам для reader'а (полезно перед v2).

**Низкий:**
7. Типизированный транспорт БД (`DbError`) — если будет потребность отличать транспорт от доменных ошибок.

---

## 6. Связь с разводом анализа заказа v1/v2

Перед тем как заводить `analyse-order-v2/`, выгодно закрыть п.1–4: тогда оба алгоритма получают единый typed-контракт ошибок (`catchTag`/`catchTags`), общий `effects.*`-фасад доменных сервисов и единый `yandex.poll`. Иначе v2 унаследует разнобой (ad-hoc теги + два механизма ожидания + ручные guard'ы).
