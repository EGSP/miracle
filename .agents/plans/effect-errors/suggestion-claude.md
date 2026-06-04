# Обработка ошибок в Job-движке (Effect) — предложение

> Автор: Claude. Статус: предложение к обсуждению, **не реализовано** (кроме двух мелких правок,
> помеченных ниже как «на ревью»). Контекст — durable-движок задач `back-nest/src/jobs/`.

## Симптом

Прогон `extract-positions-from-chunk` упал со статусом `failed` и сообщением:

```
An unknown error occurred in Effect.tryPromise
```

Без конкретной причины. Падение за ~1с после создания (быстрый реджект — похоже на ошибку
submit к Yandex: например `maxTokens: 32000` сверх лимита модели, либо 4xx; точную причину
видно только после правок ниже / в логах сервера).

## Почему сообщение «безликое»

1. `submitOnce`/`pollUntilDone` (`common/cloud-job.ts`) зовут **одноаргументный** `Effect.tryPromise(fn)`.
   При реджекте промиса Effect оборачивает реальную причину в **`UnknownException`**: её `.message`
   = «An unknown error occurred in Effect.tryPromise», а настоящая ошибка — в `.cause`.
2. Рантайм (`framework/runtime.ts`, `errToMessage`) читал только `error.message` → в поле
   `JobRun.error` осело общее сообщение, детали потеряны.

Ошибка **была поймана** (статус `failed`, E-канал) — мы просто выкинули детали.

**Где детали уже сейчас:** `JobsService.launch` на падении логирует `Cause.squash(cause)` в логгер
бэка. Реальная ошибка Yandex, скорее всего, уже в логах сервера — это первое, куда смотреть.

## Модель ошибок Effect (ключевое)

Каналы исхода эффекта, которые нельзя путать:

- **Success (A)** — успех.
- **Failure (E)** — *ожидаемая, типизированная* ошибка; ловится `catchAll` / `catchTag` / `either`.
- **Defect (die)** — *неожиданное* исключение / сломанный инвариант; `catchAll` его **не ловит**,
  только `catchAllCause` / `sandbox`.
- **Interruption** — волокно прервали (наш `cancel`). Это **не** ошибка.

Три способа завернуть промис кладут реджект в **разные** каналы:

| Конструктор | Реджект → канал | Сообщение |
|---|---|---|
| `Effect.promise(fn)` | **defect (die)** | предполагает, что промис не падает |
| `Effect.tryPromise(fn)` | **failure (E)** как `UnknownException` | общее, причина в `.cause` |
| `Effect.tryPromise({ try, catch })` | **failure (E)** как ТВОЯ ошибка | то, что положишь в `catch` |

Безликое сообщение — прямое следствие второй строки.

## Две дыры в текущем коде

1. **`Effect.promise` на вызовах, которые МОГУТ упасть.** В джобах: `Effect.promise(() => positions.create(...))`,
   `applications.get(...)`, `filesContent.getContent(...)` и т.п. Реджект Prisma → **defect**, а не failure.
   `execute` ловит падение через `Effect.tapError` (только E) → при дефекте узел **не пометится
   `failed`**, статус зависнет в `running` (поймает лишь `launch`-логгер). Баг устойчивости.

2. **Best-effort обёртки не ловят дефекты.** В `analyse-order` дети обёрнуты в `Effect.catchAll`,
   но он ловит только E, не дефекты. Сервисные вызовы — `Effect.promise` → дефект → `catchAll`
   их **не изолирует**, и падает весь заказ. То есть «устойчивость этапов» сейчас дырявая:
   best-effort работает только если ребёнок падает в E-канал.

## Рекомендуемый подход — два уровня

### Уровень 1 — у границы (где живёт промис): выбрать канал и придать смысл

Всё, что реально может упасть (LLM, сеть, БД), заворачивать через `tryPromise({ try, catch })`
с отображением реджекта в **типизированную доменную ошибку** (`Data.TaggedError`):

```ts
import { Data, Effect } from "effect";

class LlmSubmitError extends Data.TaggedError("LlmSubmitError")<{
  message: string;
  cause: unknown;
}> {}

const opId = yield* Effect.tryPromise({
  try: submit,
  catch: (e) =>
    new LlmSubmitError({ message: e instanceof Error ? e.message : String(e), cause: e }),
});
```

Плюсы: ошибка типизирована (`_tag` → `catchTag`), несёт реальное сообщение, и её **ловит
`catchAll`** (критично для best-effort). Кандидаты на доменные ошибки: `LlmSubmitError`,
`LlmPollError`, `DbError` (или общий `JobStepError`).

### Уровень 2 — наверху (`execute`): persist'ить полную причину

Перейти с `Effect.tapError` на **`Effect.tapErrorCause`** (ловит failure И defect), но **исключить
interruption** (иначе отмену пометим как `failed`):

```ts
import { Cause, Effect } from "effect";

return body.pipe(
  Effect.tapErrorCause((cause) =>
    Cause.isInterruptedOnly(cause)
      ? Effect.void
      : Effect.promise(() =>
          store.patch(node.id, { status: "failed", error: errToMessage(Cause.squash(cause)) }),
        ),
  ),
);
```

- `Cause.squash(cause)` → репрезентативная ошибка (failure-значение или дефект).
- `errToMessage` разворачивает `UnknownException.cause` (см. «на ревью» ниже).
- Полный `Cause.pretty(cause)` (с дефектами и стеком) — в логи сервера.

## Решения к согласованию + мои рекомендации

1. **Канал по умолчанию для сервисных вызовов.**
   → **Рекомендую:** правило «всё, что может реджектнуться → `tryPromise`; `Effect.promise` —
   только для заведомо неломающегося». Это правит сервисные вызовы в джобах, но делает падения
   видимыми и совместимыми с best-effort.

2. **Типизированные доменные ошибки vs generic с развёрнутым `cause`.**
   → **Рекомендую:** минимально — `Data.TaggedError` для LLM-операций в `cloud-job` (`LlmSubmitError`,
   `LlmPollError`), для остального пока generic с разворачиванием `cause`. Не плодить иерархию ошибок
   раньше нужды; теги добавлять там, где будем их **различать** в `catch`.

3. **Что хранить в `JobRun.error`.**
   → **Рекомендую:** короткое человекочитаемое сообщение (для карточки прогона), а полный
   `Cause.pretty` — в логгер. Длинный pretty в БД-поле зашумит UI.

4. **`execute`: `tapErrorCause` с исключением interrupt.**
   → **Рекомендую: да.** Закрывает дыру №1 (дефекты тоже помечают `failed`) и не ломает семантику
   отмены.

5. **Best-effort в `analyse-order` (дыра №2).**
   → После перевода сервисных вызовов на `tryPromise` (п.1) обычный `catchAll` снова корректно
   изолирует упавшего ребёнка. Если решим оставить часть вызовов на `Effect.promise` — best-effort
   обёртки надо делать через `Effect.catchAllCause` (а не `catchAll`), иначе дефект ребёнка уронит
   этап. **Рекомендую** первый путь (через `tryPromise`), он проще и единообразнее.

## Минимальный цельный план правок (если подход принят)

1. `common/cloud-job.ts`: `submitOnce`/`pollUntilDone` → `tryPromise({ try, catch })` с
   `Data.TaggedError` (`LlmSubmitError`/`LlmPollError`), `cause` сохраняем.
2. `framework/runtime.ts`:
   - `execute` → `tapErrorCause` + `Cause.isInterruptedOnly` guard + `Cause.squash`;
   - `launch` → логировать `Cause.pretty(cause)` (полная картина) вместо/вдобавок к `squash`.
3. Джобы (`order/*`, `scan/*`): сервисные вызовы, которые могут упасть (`*.create`, `*.get`,
   `getContent`, `listByApplication`…), перевести `Effect.promise` → `Effect.tryPromise({ try, catch })`
   (общий `DbError` или инлайн-`Error`). Best-effort обёртки в `analyse-order` оставить на `catchAll`.
4. (Опц.) фронт `JobRunCard`: уже показывает `run.error` — после правок там будет реальное сообщение.

## Уже внесено (на ревью, можно откатить)

В `framework/runtime.ts` сделаны две мелкие правки до паузы:
- импорт `Cause`;
- `errToMessage` теперь разворачивает `error.cause` (достаёт реальную причину из `UnknownException`).

Они безопасны и полезны независимо от остального, но финальное решение — за обсуждением.

## Риски / заметки

- `Cause.pretty` бывает многословным (стеки, вложенные причины) — для логов это плюс, для БД-поля минус.
- Перевод массовых `Effect.promise` → `tryPromise` затронет много мест; делать одним проходом и
  прогнать `tsc`, т.к. меняется E-канал (тип ошибки) у эффектов.
- Отмена (`cancel`) должна оставаться `cancelled`, а не `failed` — отсюда `isInterruptedOnly` guard.
- Конкретно для текущего падения: после разворачивания `cause` сообщение покажет реальную ошибку
  Yandex; если это лимит `maxTokens`, отдельно пересмотреть `LLM_MAX_OUTPUT_TOKENS`.
```
