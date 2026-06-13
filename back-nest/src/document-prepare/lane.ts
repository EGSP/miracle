import { Effect, Queue } from 'effect';

/**
 * Линия обработки: bounded-очередь + фиксированное число воркеров-демонов.
 *
 * Очередь даёт backpressure — `offer` в полную очередь **suspend-ит** фибер (не падает, не крутит CPU)
 * до тех пор, пока воркер не заберёт элемент. Это позволяет строить пайплайн стадий, где медленная
 * стадия естественно притормаживает быструю через цепочку bounded-очередей, без явного знания одной
 * стадии о загрузке другой.
 *
 * Воркеры стартуют как корневые fiber'ы рантайма (`Effect.runFork`) и крутят бесконечный цикл
 * `take → handle`. `handle` обязан быть бесконечно-живущим (тип ошибки `never`): любая ошибка работы
 * должна обрабатываться внутри (например, через резолв `Deferred` заказа), иначе воркер бы «умер».
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

    /** Запускает `workers` воркеров-демонов, бесконечно потребляющих очередь через `handle`. */
    startWorkers(workers: number, handle: (item: Item) => Effect.Effect<unknown, never>): void {
        const loop = Queue.take(this.requireQueue()).pipe(Effect.flatMap(handle), Effect.forever);
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
