/**
 * draft-api
 *
 * Механизм сборки сложного объекта из плоских секций.
 * Каждая секция регистрирует хендлер, который патчит черновик своим слоем.
 * При сохранении координатор запускает цепочку — каждый хендлер получает
 * накопленный черновик и возвращает его с изменениями, либо undefined (отклонить).
 *
 * Паттерн: entity-контекст встраивает DraftAPI через useDraft<T>().
 * Компоненты подписываются через useContribute(contribute, id, handler).
 *
 * readonly-режим: когда useDraft({ readonly: true }) —
 *   contribute() — no-op, хендлеры не регистрируются
 *   collect()    — возвращает base без изменений
 * Используется для компонентов которые отображают данные, но не участвуют в сохранении.
 *
 * Экспорты:
 *   DraftHandler<T>   — тип хендлера: (draft: T) => T | undefined
 *   DraftAPI<T>       — интерфейс: readonly, contribute, collect
 *   useDraft<T>       — создаёт DraftAPI (используется в entity-провайдерах)
 *   useContribute     — регистрирует хендлер компонента
 */

import { useEffect, useMemo, useRef } from "react"

// ─────────────────────────────────────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Хендлер-участник: получает накопленный черновик, возвращает его с патчем.
 * undefined — участник отклоняет сохранение (цепочка прерывается).
 */
export type DraftHandler<T> = (draft: T) => T | undefined

export type DraftAPI<T> = {
  /**
   * true — contribute() не регистрирует хендлеры, collect() возвращает base.
   * Удобно пробрасывать в UI-компоненты чтобы отключить элементы управления.
   */
  readonly: boolean
  /**
   * Зарегистрировать хендлер под id.
   * В readonly-режиме — no-op, возвращает пустой cleanup.
   */
  contribute: (id: string, handler: DraftHandler<T>) => () => void
  /**
   * Запустить цепочку хендлеров на base.
   * В readonly-режиме — возвращает base без изменений.
   * Если хендлер вернёт undefined — цепочка прерывается.
   */
  collect: (base: T) => T | undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Хук useDraft
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Создаёт DraftAPI для entity-провайдера.
 *
 * @param options.readonly  Если true — contribute и collect становятся no-op.
 *                          Пробрасывается в контекст как DraftAPI.readonly.
 *
 * @example
 * function FileCardProvider({ file, readonly = false, children }) {
 *     const draft = useDraft<FileWithMeta>({ readonly })
 *     return (
 *         <FileCardContext.Provider value={{ file, ...draft }}>
 *             {children}
 *         </FileCardContext.Provider>
 *     )
 * }
 */
export function useDraft<T>(options?: { readonly?: boolean }): DraftAPI<T> {
  const isReadonly = options?.readonly ?? false
  const handlersRef = useRef(new Map<string, DraftHandler<T>>())

  return useMemo(
    () => ({
      readonly: isReadonly,

      contribute: isReadonly
        ? () => () => {}
        : (id, handler) => {
            handlersRef.current.set(id, handler)
            return () => handlersRef.current.delete(id)
          },

      collect: isReadonly
        ? (base) => base
        : (base) => {
            let draft = { ...base } as T
            for (const [, handler] of handlersRef.current) {
              const result = handler(draft)
              if (result === undefined) return undefined
              draft = result
            }
            return draft
          },
    }),
    [isReadonly],
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Хук useContribute
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Регистрирует хендлер компонента в черновике.
 * Принимает contribute из entity-контекста — T выводится автоматически.
 * В readonly-режиме contribute — no-op, хук не делает ничего.
 *
 * @example
 * function FileCardSettings() {
 *     const { contribute } = useFileCardContext()
 *     const field = useField('complexLayout', false)
 *
 *     useContribute(contribute, 'settings', (draft) => ({
 *         ...draft,
 *         settings: { complexLayout: field.value },
 *     }))
 *
 *     return <Checkbox.Item label="…" checked={field.value} onChange={field.onChange} />
 * }
 */
export function useContribute<T>(
  contribute: DraftAPI<T>["contribute"],
  id: string,
  handler: DraftHandler<T>,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const stable: DraftHandler<T> = (draft) => handlerRef.current(draft)
    return contribute(id, stable)
    // contribute стабилен (из useMemo), id — намеренная зависимость
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, contribute])
}
