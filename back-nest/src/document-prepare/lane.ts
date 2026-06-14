import { Cause, Effect, Queue } from 'effect';

/**
 * Линия обработки: bounded-очередь + фиксированное число воркеров-демонов.
 *
 * Очередь даёт backpressure — `offer` в полную очередь **suspend-ит** фибер (не падает, не крутит CPU)
 * до тех пор, пока воркер не заберёт элемент. Это позволяет строить пайплайн стадий, где медленная
 * стадия естественно притормаживает быструю через цепочку bounded-очередей, без явного знания одной
 * стадии о загрузке другой.
 *
 * **Устойчивость воркера.** Линии всё равно на исход отдельного элемента: каждая итерация
 * `take → handle` обёрнута в `catchAllCause`, поэтому любой исход `handle` — типизированная ошибка
 * ИЛИ дефект (неожиданный throw / реджект промиса / баг) — логируется через `onError`, и воркер
 * берёт следующий элемент. Воркер останавливается ТОЛЬКО на прерывании (shutdown). Без этой обёртки
 * дефект всплыл бы через `forever` и убил бы fiber воркера (а при гибели всех — линия встала бы:
 * очередь забивается, `offer` виснут навсегда).
 *
 * `handle` типизирован как `Effect<unknown, never>` — бизнес-обработчики всё равно должны сами
 * приводить ожидаемые ошибки к результату (например, `markFailed`/резолв `Deferred`); `catchAllCause`
 * здесь — страховка от непредвиденного, а не основной путь обработки ошибок.
 */
export class Lane<Item> {
    private queue: Queue.Queue<Item> | undefined;

    constructor(private readonly label: string) {}

    /** Создаёт очередь (синхронно). Вызывать в onModuleInit до {@link startWorkers}/{@link offer}. */
    init(capacity: number): void {
        this.queue = Effect.runSync(Queue.bounded<Item>(capacity));
    }

    private requireQueue(): Queue.Queue<Item> {
        if (!this.queue) {
            throw new Error(`Lane "${this.label}" не инициализирована (init() не вызван)`);
        }
        return this.queue;
    }

    /**
     * Запускает `workers` воркеров-демонов, бесконечно потребляющих очередь через `handle`.
     * `onError` вызывается на любом непредвиденном исходе `handle` (ошибка/дефект) — воркер при этом
     * выживает и продолжает. Прерывание (shutdown) пробрасывается и останавливает воркер.
     */
    startWorkers(
        workers: number,
        handle: (item: Item) => Effect.Effect<unknown, never>,
        onError: (label: string, cause: Cause.Cause<unknown>) => void,
    ): void {
        const guarded = (item: Item): Effect.Effect<unknown> =>
            handle(item).pipe(
                Effect.catchAllCause((cause) =>
                    Cause.isInterruptedOnly(cause)
                        ? Effect.failCause(cause) // прерывание (shutdown) — даём воркеру остановиться
                        : Effect.sync(() => onError(this.label, cause)), // иначе логируем и продолжаем
                ),
            );
        const loop = Queue.take(this.requireQueue()).pipe(Effect.flatMap(guarded), Effect.forever);
        for (let i = 0; i < workers; i += 1) {
            Effect.runFork(loop);
        }
    }

    /** Кладёт элемент в очередь. Backpressure: suspend, если очередь полна. */
    offer(item: Item): Effect.Effect<void> {
        return Effect.asVoid(Queue.offer(this.requireQueue(), item));
    }

    /** Текущая глубина очереди (для наблюдаемости/health). */
    size(): Effect.Effect<number> {
        return Queue.size(this.requireQueue());
    }
}
