# Паттерн: durable-задачи (Job-фреймворк на Effect)

> Движок задач back-nest. Чистый мини-фреймворк: `back-nest/src/jobs/framework/`.
> Nest-обёртки (сервис/контроллер/модуль): `back-nest/src/jobs/`.
> Концептуальная база — лекция `.agents/plans/nest-migration/worker-rework/`.

## Идея в двух абзацах

**Job** — это *инспектируемое описание* задачи, которое рантайм исполняет как `Effect`. Описание
плоское: id плюс тело `run(input) => Effect`. Никаких деревьев и последовательностей на уровне
описания нет — оркестрация живёт **внутри тела**: джоб сам запускает под-джобы через сервис `Jobs`.

Долговечность Effect сам не даёт (волокно живёт в памяти), поэтому каждый запуск персистится как
**плоская** запись `JobRun` (таблица `job_runs`). Дерево выражается ссылкой `parentId` на
непосредственного родителя, а дочерние запуски дедуплицируются парой `(parentId, key)`. После
рестарта незавершённый корень **проигрывается заново**: завершённые (`succeeded`) дети возвращают
сохранённый `output`, а недоделанные переисполняются. Это replay-семантика: тело родителя должно
быть чистой оркестрацией, а все настоящие действия — в дочерних джобах или под `memo`.

## Объявление джоба

```ts
import { Effect } from 'effect';
import { defineJob, Memo, Progress } from '../jobs/framework/index.js';

// defineJob(id, fn): id брендируется в JobId; тело — функция input → Effect.
// Memo/Progress/Jobs приходят из окружения Effect (их провайдит рантайм для текущего узла).
export const extractText = defineJob(
    'extract-text',
    (input: { applicationId: string }) =>
        Effect.gen(function* () {
            const progress = yield* Progress;
            yield* progress.set(0, 'чтение источника');
            const text = yield* readSourceText(input.applicationId);
            return text;
        }),
);
```

## Запуск под-джобов (вместо pipe/andThen)

```ts
import { defineJob, Jobs } from '../jobs/framework/index.js';

export const orderAnalyse = defineJob(
    'order-analyse',
    (input: { applicationId: string }) =>
        Effect.gen(function* () {
            const jobs = yield* Jobs;
            // parentId подставляет рантайм (это id текущего джоба); key уникален в пределах родителя.
            const text = yield* jobs.run(extractText, 'extract', { applicationId: input.applicationId });
            const positions = yield* jobs.run(llmPositions, 'llm', { text });
            return positions;
        }),
);
```

`Jobs.run(job, key, input)` находит-или-создаёт ребёнка по `(parentId, key)`:
- `succeeded` → сразу возвращает сохранённый `output` (повторно не исполняет);
- `failed`/`cancelled` → пробрасывает ошибку (перезапуск — только явной командой с новым прогоном);
- `running`/`queued` (артефакт краха) → переисполняет в той же строке;
- нет строки → создаёт и исполняет.

Параллельные дети — просто разные ключи:
```ts
const [a, b] = yield* Effect.all(
    [jobs.run(stepA, 'a', input), jobs.run(stepB, 'b', input)],
    { concurrency: 'unbounded' },
);
```

## Memo и Progress

```ts
const memo = yield* Memo;
const saved = yield* memo.get<string>('opId');     // Option<string>
yield* memo.set('opId', opId);                      // durable: пишет в memo и персистит

const progress = yield* Progress;
yield* progress.set(50, 'опрос LLM');               // pct 0..100 + подпись
```

`memo` — для возобновления внутри одного джоба (например, помнить id облачной операции до опроса),
`progress` — только для наблюдаемости. Помощники `submitOnce`/`pollUntilDone` (в `common/cloud-job.ts`)
построены поверх `memo` и **не** входят во фреймворк.

## Реестр и запуск

```ts
import { registerJob } from '../jobs/framework/index.js';
import { JobsService } from '../jobs/jobs.service.js';

// Корневые джобы регистрируем по id — нужно для восстановления после рестарта.
registerJob(orderAnalyse);

// Запуск из доменного сервиса (JobsService @Global):
constructor(private readonly jobs: JobsService) {}

async analyse(applicationId: string) {
    const run = await this.jobs.start(orderAnalyse, { applicationId }); // корень: parentId/key = null
    return run; // run.id — отдать клиенту для слежения
}
```

## Что и когда сохраняется

Каждый узел — отдельная плоская строка. Рантайм обновляет только её (не всё дерево):
- вход в джоб → `status: 'running'`;
- `memo.set(...)` / `progress.set(...)` → патч соответствующего поля (поэтому `opId` сохраняем ДО опроса);
- успех → `status: 'succeeded'` + `output`; ошибка → `status: 'failed'` + сообщение.

Форма (`types/src/job-run.ts`):
```ts
type JobRun = {
  id; job: JobId;
  parentId?: string | null;          // id родителя; null у корня
  key?: string | null;               // ключ идемпотентности в пределах родителя; null у корня
  status: 'queued'|'running'|'succeeded'|'failed'|'cancelled';
  input?; output?; error?;
  progress?: { pct: number; label?: string };
  memo?: Record<string, unknown>;    // { opId, finalPrompt, ... }
};
```

### Возобновление
При рестарте `JobsService` (на `OnApplicationBootstrap`) находит корни `running`/`queued`, по `run.job`
берёт определение из реестра и **проигрывает тело заново**. Внутри тела `Jobs.run` находит завершённых
детей и возвращает их `output` (не переисполняя), а недоделанных — переисполняет. Так прогон
доходит до места обрыва.

## Отмена и удаление

`JobsService.cancel(id)` прерывает волокно корня и **рекурсивно** метит поддерево (`running`/`queued`
→ `cancelled`), обходя потомков по `parentId`. `delete(id)` удаляет завершённый прогон (активный —
нельзя). Прежнего `apply`/`applyById` больше нет.

## Прогресс (сбор)

Каждый джоб пишет свой `pct` через `Progress.set`. Общий прогресс по дереву собирается **рекурсивным
обходом** потомков по `parentId` (отдельной функцией на стороне сервиса/фронта) — заранее известного
числа детей нет, поэтому общий процент приблизительный.

## Правила и грабли
- **Тело родителя проигрывается заново** при возобновлении: всё, что не завёрнуто в `Jobs.run` или
  `memo`, выполнится повторно. Побочные эффекты — только в дочерних джобах.
- **`key` уникален в пределах непосредственного родителя** (в БД — `@@unique([parentId, key])`).
  Это и дедупликация запусков, и защита от гонки.
- **`parentId` — это id ТЕКУЩЕГО джоба**, а не корня: рантайм подставляет его сам, замыкая `Jobs`
  на узел; внук цепляется к ребёнку, а не к корню.
- **`memo` — для возобновления**, `progress` — для наблюдаемости; не путать.
- **`opId` сохраняем ДО** опроса облачной операции.
- **Корневые джобы регистрируем** в реестре (иначе не восстановятся).
- **Фреймворк чистый**: в `jobs/framework/` нет Nest/Prisma; БД приходит через порт `JobStore`.
