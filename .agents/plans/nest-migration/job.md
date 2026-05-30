# Паттерн: durable-задачи (Job-фреймворк на Effect)

> Движок задач back-nest: `back-nest/src/jobs/`. Заменяет старый `worker-pool` + `BaseWorker`.
> Концептуальная база — лекции в `.agents/lectures/` и `.agents/plans/nest-migration/worker-rework/`.

## Идея в двух абзацах

**Job** — это *инспектируемое описание* задачи, которое раннер компилирует в `Effect`. Лист (`leaf`)
несёт Effect-тело с реальной работой; составной Job (`andThen`/`named`) хранит детей как значения,
поэтому раннер может обойти структуру, пропустить уже завершённые шаги и возобновить незавершённый.

Долговечность Effect сам не даёт (его «волокно» живёт в памяти), поэтому состояние исполнения
персистится как единый рекурсивный **`JobRun`** (коллекция `jobRuns`): лист хранит контрольную точку
в `memo`, составной — детей в `steps` и `cursor`. После перезапуска процесса прогон возобновляется по
сохранённому дереву.

## Объявление листового Job

```ts
import { Effect } from 'effect';
import { leaf } from '../jobs/job.js';
import { Memo, Progress } from '../jobs/context.js';

// leaf(id, fn): id брендируется в JobId; тело — функция input → Effect.
// Зависимости (доменные сервисы/вендоры) и теги Memo/Progress приходят из слоя раннера.
export const tcDetailsLlm = leaf(
    'tc-details-llm',
    (input: { text: string }) =>
        Effect.gen(function* () {
            const memo = yield* Memo;
            const progress = yield* Progress;

            // Идемпотентная отправка: при возобновлении opId уже в memo — НЕ шлём заново.
            const saved = yield* memo.get<string>('opId');
            let opId: string;
            if (saved._tag === 'Some') {
                opId = saved.value;
            } else {
                // finalPrompt полезно сохранить ДО отправки — для preview-prompt и отладки.
                yield* memo.set('finalPrompt', buildPrompt(input.text));
                opId = yield* Effect.tryPromise(() => llm.submit(buildPrompt(input.text)));
                yield* memo.set('opId', opId); // memo durable ДО опроса
            }

            // Опрос до готовности (цикл прерываем — отмена волокна сработает на Effect.sleep).
            yield* progress.report({ phase: 'polling' });
            while (true) {
                const r = yield* Effect.tryPromise(() => llm.poll<TcRules>(opId));
                if (r.done) return r.result!;
                yield* Effect.sleep('3 seconds');
            }
        }),
);
```

> Помощники вида `submitOnce`/`pollUntilDone` — **не часть фреймворка** (они специфичны для Yandex/LLM).
> Их место рядом с конкретными Job (в `yandex/` или в каталоге домена-потребителя), а не в `jobs/`.

## Композиция (pipe + andThen + named)

```ts
import { andThen, named } from '../jobs/combinators.js';

// Типобезопасная цепочка: выход звена обязан совпадать со входом следующего.
// Получаем составной Job — он тоже Job (рекурсивно вкладывается дальше).
export const tcExtract = ocr.pipe(            // Job<{fileId}, {text}>
    andThen(tcDetailsLlm),                    // {text} → TcRules
    andThen(applyTcRules),                    // TcRules → void
    named('tc-extract'),                      // имя корневого пайплайна
);
```

`apply` — это просто последний лист пайплайна (запись результата в доменную сущность). Повторное
применение (`apply-worker-data`) = повторный прогон терминального узла.

## Реестр и запуск

```ts
import { registerJob } from '../jobs/registry.js';

// Регистрируем КОРНЕВЫЕ Job по id — нужно для запуска по ключу и для восстановления.
registerJob(tcExtract);

// Запуск из доменного сервиса: инжектим JobRuntimeService (он @Global).
constructor(private readonly runtime: JobRuntimeService) {}

async extractDetails(tcId: string) {
    // start создаёт корневой JobRun (status: 'queued') и форкает durable-прогон.
    const run = await this.runtime.start(tcExtract, { tcId });
    return run; // содержит id прогона — отдать клиенту для слежения
}
```

## Что и когда сохраняется

`JobRun` (дерево) персистится раннером после каждого значимого перехода:
- лист: `memo.set(...)` пишет ключ и сразу сохраняет весь корень (поэтому `opId` сохраняем ДО опроса);
- составной: `cursor`/`output` ребёнка — ПОСЛЕ его завершения; статусы `running`/`succeeded`/`failed`.

Форма (`types/src/job-run.ts`):
```ts
type JobRun = {
  id; job: JobId; status: 'queued'|'running'|'succeeded'|'failed'|'cancelled';
  input?; output?; error?; progress?;
  memo?: Record<string, unknown>;   // ЛИСТ: { opId, finalPrompt, ... }
  cursor?: number;                   // СОСТАВНОЙ: индекс текущего ребёнка
  steps?: JobRun[];                  // СОСТАВНОЙ: вложенные прогоны
};
```

### Возобновление
При рестарте `JobRuntimeService` (на `OnApplicationBootstrap`) находит прогоны `running`/`queued`, по
`run.job` берёт определение из реестра и заново запускает раннер по сохранённому дереву:
- дети со статусом `succeeded` **не перезапускаются** — их `output` подаётся дальше;
- лист с `memo.opId` **продолжает опрос**, не отправляя операцию повторно.

## Прогресс

```ts
import { progressStages, overallProgress } from '../jobs/progress.js';

overallProgress(run);          // общий прогресс, 0..100
progressStages(run, 1);        // [{ name, weight, progress }] — прямые дети корня
progressStages(run, 2);        // на уровень глубже; глубина клампится фактической структурой
// weight в сумме = 100 (доля этапа); progress в сумме = общий прогресс.
```

## Правила и грабли
- **Тело листа** может звать другие Job только через композицию (комбинаторы), не вызовом «вживую» —
  иначе раннер не сможет возобновить вложенный шаг. Внутри листа — любой `Effect.gen`.
- **`memo` — для возобновления**, `progress` — для наблюдаемости; не путать.
- **`opId` сохраняем ДО** запуска опроса; иначе при падении потеряем ссылку на облачную операцию.
- **Вендоры/сервисы** не импортируем в Job напрямую — они приходят Effect-тегами из слоя раннера
  (`JobRuntimeService` строит `Layer` из Nest-провайдеров).
- **Корневые Job регистрируем** в реестре (иначе не восстановятся после перезапуска).
