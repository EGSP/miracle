/**
 * draft-api
 *
 * Механизм сборки сложного объекта из плоских секций.
 * Каждая секция регистрирует хендлер, который патчит черновик своим слоем.
 * При сохранении координатор запускает цепочку — каждый хендлер получает
 * накопленный черновик и возвращает его с изменениями, либо undefined (отклонить).
 *
 * Паттерн: entity-контекст встраивает DraftAPI через useDraft<T>().
 * Компоненты подписываются через useContribute(Context, id, handler).
 *
 * Экспорты:
 *   DraftHandler<T>   — тип хендлера: (draft: T) => T | undefined
 *   DraftAPI<T>       — интерфейс: contribute, collect
 *   useDraft<T>       — создаёт DraftAPI (используется в entity-провайдерах)
 *   useContribute     — регистрирует хендлер компонента в ближайшем контексте
 */

import { useEffect, useMemo, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Хендлер-участник: получает накопленный черновик, возвращает его с патчем.
 * undefined — участник отклоняет сохранение (цепочка прерывается).
 */
export type DraftHandler<T> = (draft: T) => T | undefined;

export type DraftAPI<T> = {
    /**
     * Зарегистрировать хендлер под id.
     * Возвращает функцию отмены регистрации — передаётся в useEffect cleanup.
     */
    contribute: (id: string, handler: DraftHandler<T>) => () => void;
    /**
     * Запустить цепочку: применить все хендлеры к base по очереди.
     * Если хотя бы один вернёт undefined — вернёт undefined (сохранение отменено).
     */
    collect: (base: T) => T | undefined;
};

// ─────────────────────────────────────────────────────────────────────────────
// useDraft
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Создаёт DraftAPI для entity-контекста.
 * Вызывается один раз в провайдере, результат встраивается в контекст.
 *
 * @example
 * function OrderCardProvider({ order, files, children }) {
 *     const draft = useDraft<Order>()
 *     return (
 *         <OrderCardContext.Provider value={{ order, files, ...draft }}>
 *             {children}
 *         </OrderCardContext.Provider>
 *     )
 * }
 */
export function useDraft<T>(): DraftAPI<T> {
    const handlersRef = useRef(new Map<string, DraftHandler<T>>());

    return useMemo(
        () => ({
            contribute(id, handler) {
                handlersRef.current.set(id, handler);
                return () => handlersRef.current.delete(id);
            },
            collect(base) {
                let draft = { ...base } as T;
                for (const [, handler] of handlersRef.current) {
                    const result = handler(draft);
                    if (result === undefined) return undefined;
                    draft = result;
                }
                return draft;
            },
        }),
        [],
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// useContribute
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Регистрирует хендлер компонента в черновике.
 * Принимает функцию contribute из entity-контекста — T выводится из неё автоматически.
 * Снимает регистрацию при размонтировании.
 *
 * @example
 * function FileCardSettings() {
 *     const { contribute } = useFileCardContext()
 *     const field = useField('active', false)
 *
 *     useContribute(contribute, 'settings', (draft) => ({
 *         ...draft,
 *         settings: { active: field.value },  // draft типизирован автоматически
 *     }))
 *
 *     return <Switch checked={field.value} onCheckedChange={field.onChange} />
 * }
 */
export function useContribute<T>(
    contribute: DraftAPI<T>["contribute"],
    id: string,
    handler: DraftHandler<T>,
): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const stable: DraftHandler<T> = (draft) => handlerRef.current(draft);
        return contribute(id, stable);
        // contribute стабилен (из useMemo), id — намеренная зависимость
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, contribute]);
}
