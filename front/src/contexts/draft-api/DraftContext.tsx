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

import { useContext, useEffect, useMemo, useRef } from "react";

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
 * Регистрирует хендлер компонента в entity-контексте.
 * Контекст передаётся первым аргументом — должен содержать DraftAPI<T>.
 * Снимает регистрацию автоматически при размонтировании.
 *
 * handlerRef-трюк: хендлер всегда читает свежее замыкание,
 * регистрация в контексте происходит один раз при монтировании.
 *
 * @example
 * function OrderCardFile() {
 *     const fileField = useField<OrderFileState, 'fileId'>('fileId')
 *
 *     useContribute(OrderCardContext, 'file', (draft) => {
 *         if (!fileField.value) return undefined
 *         return { ...draft, fileId: fileField.value }
 *     })
 *
 *     return <FileSelector field={fileField} />
 * }
 */
export function useContribute<
    T,
    TContext extends { contribute: DraftAPI<T>["contribute"] },
>(
    Context: React.Context<TContext | null>,
    id: string,
    handler: DraftHandler<T>,
): void {
    const ctx = useContext(Context);
    if (!ctx) {
        throw new Error(
            `useContribute: контекст не найден в дереве. ` +
                `Компонент должен быть внутри соответствующего провайдера.`,
        );
    }

    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const stable: DraftHandler<T> = (draft) => handlerRef.current(draft);
        return ctx.contribute(id, stable);
        // id — единственная стабильная зависимость;
        // ctx.contribute стабилен (из useMemo), handlerRef — через ref
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);
}
