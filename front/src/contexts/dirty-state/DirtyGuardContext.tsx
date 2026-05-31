/**
 * dirty-guard.tsx
 *
 * DirtyGuardProvider — контекст для отслеживания несохранённых изменений
 * в полях и секциях с блокировкой навигации.
 *
 * Архитектура:
 *   - useField регистрирует себя в ближайшем DirtyGuardProvider
 *   - Вложенный DirtyGuardProvider с id регистрируется в родительском
 *   - Все участники используют единый интерфейс EntryApi { commit, reset }
 *   - Guard хранит entries (все участники) и dirtyIds (кто грязный)
 *
 * Структура:
 *
 *   <DirtyGuardProvider>                    ← страница, блокировка навигации
 *     <DirtyGuardProvider id="meta">        ← секция: свой commitAll / isDirty
 *       useField('title')                   ← регистрируется в ближайшем Guard
 *       useField('status')
 *     </DirtyGuardProvider>
 *     <DirtyGuardProvider id="content">
 *       useField('body')
 *     </DirtyGuardProvider>
 *     <SaveAllButton />                     ← читает внешний Guard
 *   </DirtyGuardProvider>
 *
 * Экспорты:
 *   EntryApi             — интерфейс участника: commit, reset
 *   DirtyGuardProvider   — оборачивает страницу или секцию
 *   useDirtyGuardContext — внутренний хук для useField (регистрация)
 *   useGuardState        — isDirtyAnywhere, dirtyIds, dirtyCount, isDirty(id)
 *   useGuardActions      — commitAll(), resetAll()
 *   useGuardBlocker      — кастомный UI блокера навигации
 */

import { useBlocker } from "@tanstack/react-router"
import { createContext, type PropsWithChildren, useContext, useEffect, useRef } from "react"
import { createStore, useStore } from "zustand"

// ─────────────────────────────────────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────────────────────────────────────

/** Единый интерфейс участника — поля и вложенные Guard используют одинаковый */
export type EntryApi = {
  commit: () => void
  reset: () => void
}

type GuardStore = {
  /** Все зарегистрированные участники */
  entries: Map<string, EntryApi>
  /** id участников у которых isDirty === true */
  dirtyIds: Set<string>

  /** Зарегистрировать участника. Возвращает cleanup — снимает регистрацию */
  register: (id: string, api: EntryApi) => () => void
  /** Пометить участника грязным */
  markDirty: (id: string) => void
  /** Пометить участника чистым */
  markClean: (id: string) => void
  /** Вызвать commit() у всех участников */
  commitAll: () => void
  /** Вызвать reset() у всех участников */
  resetAll: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Фабрика стора
// ─────────────────────────────────────────────────────────────────────────────

function createGuardStore() {
  return createStore<GuardStore>()((set, get) => ({
    entries: new Map(),
    dirtyIds: new Set(),

    register: (id, api) => {
      set((s) => ({ entries: new Map([...s.entries, [id, api]]) }))
      return () =>
        set((s) => {
          const entries = new Map(s.entries)
          entries.delete(id)
          const dirtyIds = new Set(s.dirtyIds)
          dirtyIds.delete(id)
          return { entries, dirtyIds }
        })
    },

    markDirty: (id) => set((s) => ({ dirtyIds: new Set([...s.dirtyIds, id]) })),

    markClean: (id) =>
      set((s) => {
        const next = new Set(s.dirtyIds)
        next.delete(id)
        return { dirtyIds: next }
      }),

    commitAll: () => {
      // Снимаем snapshot — commit вызовет markClean через подписки useField
      ;[...get().entries.values()].forEach((e) => e.commit())
    },

    resetAll: () => {
      ;[...get().entries.values()].forEach((e) => e.reset())
    },
  }))
}

type GuardStoreApi = ReturnType<typeof createGuardStore>

// ─────────────────────────────────────────────────────────────────────────────
// Контексты
// ─────────────────────────────────────────────────────────────────────────────

/** Публичный — для чтения состояния (useGuardState, useGuardActions, useGuardBlocker) */
const GuardContext = createContext<GuardStoreApi | null>(null)

/**
 * Внутренний — для регистрации useField и вложенных Guard.
 * Стабильный объект (apiRef) — не вызывает ре-рендеры при изменении dirtyIds.
 */
type GuardApi = {
  register: (id: string, api: EntryApi) => () => void
  markDirty: (id: string) => void
  markClean: (id: string) => void
}

const GuardApiContext = createContext<GuardApi | null>(null)

// ─────────────────────────────────────────────────────────────────────────────
// Провайдер
// ─────────────────────────────────────────────────────────────────────────────

type DirtyGuardProviderProps = PropsWithChildren<{
  /**
   * Идентификатор секции.
   * Если указан и провайдер находится внутри другого DirtyGuardProvider —
   * регистрируется в нём как участник (вложенная секция).
   */
  id?: string
  /**
   * Текст window.confirm при попытке покинуть страницу.
   * @default "Есть несохранённые изменения. Покинуть страницу?"
   */
  confirmMessage?: string
  /**
   * Отключить встроенный window.confirm.
   * Используй вместе с useGuardBlocker() для кастомного диалога.
   * @default false
   */
  skipBuiltinBlocker?: boolean
}>

export function DirtyGuardProvider({
  id,
  children,
  confirmMessage = "Есть несохранённые изменения. Покинуть страницу?",
  skipBuiltinBlocker = false,
}: DirtyGuardProviderProps) {
  const storeRef = useRef<GuardStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createGuardStore()
  }

  // Стабильный объект — не пересоздаётся между рендерами
  const apiRef = useRef<GuardApi>({
    register: (entryId, api) => storeRef.current!.getState().register(entryId, api),
    markDirty: (entryId) => storeRef.current!.getState().markDirty(entryId),
    markClean: (entryId) => storeRef.current!.getState().markClean(entryId),
  })

  // Если есть id и родительский Guard — регистрируемся в нём как секция
  const parentApi = useContext(GuardApiContext)
  useEffect(() => {
    if (!parentApi || !id) return

    const cleanup = parentApi.register(id, {
      commit: () => storeRef.current!.getState().commitAll(),
      reset: () => storeRef.current!.getState().resetAll(),
    })

    // Сообщаем родителю о смене isDirtyAnywhere
    const unsubscribe = storeRef.current!.subscribe((state, prev) => {
      const isDirty = state.dirtyIds.size > 0
      const wasDirty = prev.dirtyIds.size > 0
      if (isDirty === wasDirty) return
      if (isDirty) parentApi.markDirty(id)
      else parentApi.markClean(id)
    })

    return () => {
      cleanup()
      unsubscribe()
      parentApi.markClean(id)
    }
  }, [parentApi, id])

  return (
    <GuardContext.Provider value={storeRef.current}>
      <GuardApiContext.Provider value={apiRef.current}>
        {children}
        {!skipBuiltinBlocker && <GuardBlockerEffect confirmMessage={confirmMessage} />}
      </GuardApiContext.Provider>
    </GuardContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Внутренний блокер навигации
// ─────────────────────────────────────────────────────────────────────────────

function GuardBlockerEffect({ confirmMessage }: { confirmMessage: string }) {
  const store = useContext(GuardContext)!
  const isDirtyAnywhere = useStore(store, (s) => s.dirtyIds.size > 0)

  useBlocker({
    condition: isDirtyAnywhere,
    blockerFn: () => window.confirm(confirmMessage),
  })

  // store стабилен — слушатель ставится один раз
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (store.getState().dirtyIds.size > 0) e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [store])

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Внутренний хук — для useField
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Возвращает GuardApi ближайшего DirtyGuardProvider.
 * null если Guard не найден — useField работает без регистрации.
 */
export function useDirtyGuardContext(): GuardApi | null {
  return useContext(GuardApiContext)
}

// ─────────────────────────────────────────────────────────────────────────────
// Публичные хуки
// ─────────────────────────────────────────────────────────────────────────────

function useGuardStore<R>(selector: (state: GuardStore) => R): R {
  const store = useContext(GuardContext)
  if (!store) {
    throw new Error("useGuard* должен использоваться внутри <DirtyGuardProvider>")
  }
  return useStore(store, selector)
}

/**
 * Агрегированное состояние всех участников под Guard.
 *
 * @example
 * const { isDirtyAnywhere, dirtyCount, isDirty } = useGuardState()
 * isDirty('meta')  // true если секция или поле 'meta' грязное
 */
export function useGuardState() {
  const isDirtyAnywhere = useGuardStore((s) => s.dirtyIds.size > 0)
  const dirtyIds = useGuardStore((s) => s.dirtyIds)
  return {
    isDirtyAnywhere,
    dirtyIds,
    dirtyCount: dirtyIds.size,
    isDirty: (id: string) => dirtyIds.has(id),
  }
}

/**
 * Действия над всеми участниками под Guard.
 *
 * @example
 * const { commitAll, resetAll } = useGuardActions()
 * await saveAll()
 * commitAll()
 */
export function useGuardActions() {
  const store = useContext(GuardContext)
  if (!store) {
    throw new Error("useGuardActions должен использоваться внутри <DirtyGuardProvider>")
  }
  const { commitAll, resetAll } = store.getState()
  return { commitAll, resetAll }
}

/**
 * Кастомный UI блокера навигации.
 * Используй вместе с prop skipBuiltinBlocker на DirtyGuardProvider.
 *
 * @example
 * <DirtyGuardProvider skipBuiltinBlocker>
 *   <NavigationGuard />
 * </DirtyGuardProvider>
 *
 * function NavigationGuard() {
 *   const blocker = useGuardBlocker()
 *   if (blocker.status !== 'blocked') return null
 *   return (
 *     <Dialog>
 *       <button onClick={blocker.proceed}>Уйти</button>
 *       <button onClick={blocker.reset}>Остаться</button>
 *     </Dialog>
 *   )
 * }
 */
export function useGuardBlocker() {
  const { isDirtyAnywhere } = useGuardState()
  return useBlocker({ condition: isDirtyAnywhere })
}
