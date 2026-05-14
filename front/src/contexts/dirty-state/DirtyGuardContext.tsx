/**
 * dirty-guard.tsx
 *
 * DirtyGuardProvider — контекст-охранник для отслеживания несохранённых изменений
 * в нескольких DirtyProvider одновременно.
 *
 * Архитектура:
 *   - DirtyProvider с prop `id` автоматически регистрирует себя при isDirty → true
 *   - Guard хранит Set<id> грязных секций и Map<id, StoreApi> для действий
 *   - После commit/reset секция снимает регистрацию сама через подписку
 *
 * Экспорты:
 *   DirtyGuardProvider   — оборачивает страницу с несколькими секциями
 *   useDirtyGuardContext — внутренний хук для DirtyProvider (регистрация)
 *   useGuardState        — isDirtyAnywhere, dirtyIds, dirtyCount, isDirty(id)
 *   useGuardActions      — commitAll(), resetAll()
 *   useGuardBlocker      — кастомный UI блокера навигации (совместно с skipBuiltinBlocker)
 */

import {
    createContext,
    useContext,
    useRef,
    useEffect,
    type PropsWithChildren,
} from "react";
import { createStore, useStore } from "zustand";
import { useBlocker } from "@tanstack/react-router";
import type { DirtyStoreApi } from "./DirtyStateContext";

// ─────────────────────────────────────────────────────────────────────────────
// Тип стора
// ─────────────────────────────────────────────────────────────────────────────

type GuardStore = {
    /** id грязных секций — для чтения состояния в компонентах */
    dirtyIds: Set<string>;
    /** StoreApi грязных секций — для commitAll / resetAll */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sections: Map<string, DirtyStoreApi<any>>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    register: (id: string, api: DirtyStoreApi<any>) => void;
    unregister: (id: string) => void;
    /** Вызвать commit() на всех грязных секциях. После сохранения на сервер. */
    commitAll: () => void;
    /** Вызвать reset() на всех грязных секциях. */
    resetAll: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Фабрика стора
// ─────────────────────────────────────────────────────────────────────────────

function createGuardStore() {
    return createStore<GuardStore>()((set, get) => ({
        dirtyIds: new Set(),
        sections: new Map(),

        register: (id, api) =>
            set((state) => ({
                dirtyIds: new Set([...state.dirtyIds, id]),
                sections: new Map([...state.sections, [id, api]]),
            })),

        unregister: (id) =>
            set((state) => {
                const dirtyIds = new Set(state.dirtyIds);
                dirtyIds.delete(id);
                const sections = new Map(state.sections);
                sections.delete(id);
                return { dirtyIds, sections };
            }),

        commitAll: () => {
            // Снимаем snapshot перед итерацией — commit вызовет unregister через подписки
            const apis = [...get().sections.values()];
            apis.forEach((api) => api.getState().commit());
        },

        resetAll: () => {
            const apis = [...get().sections.values()];
            apis.forEach((api) => api.getState().reset());
        },
    }));
}

type GuardStoreApi = ReturnType<typeof createGuardStore>;

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Публичный контекст — для чтения состояния и действий.
 */
const GuardContext = createContext<GuardStoreApi | null>(null);

/**
 * Внутренний контекст — только для регистрации DirtyProvider.
 * Отделён от GuardContext чтобы DirtyProvider не подписывался на стейт гварда.
 */
type GuardApi = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    register: (id: string, api: DirtyStoreApi<any>) => void;
    unregister: (id: string) => void;
};
const GuardApiContext = createContext<GuardApi | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

type DirtyGuardProviderProps = PropsWithChildren<{
    /**
     * Текст window.confirm при попытке покинуть страницу.
     * @default "Есть несохранённые изменения. Покинуть страницу?"
     */
    confirmMessage?: string;
    /**
     * Отключает встроенный window.confirm.
     * Используй вместе с useGuardBlocker() для кастомного диалога.
     * @default false
     */
    skipBuiltinBlocker?: boolean;
}>;

export function DirtyGuardProvider({
    children,
    confirmMessage = "Есть несохранённые изменения. Покинуть страницу?",
    skipBuiltinBlocker = false,
}: DirtyGuardProviderProps) {
    const storeRef = useRef<GuardStoreApi>(null);
    if (!storeRef.current) {
        storeRef.current = createGuardStore();
    }

    // Стабильный объект — не пересоздаётся между рендерами
    const apiRef = useRef<GuardApi>({
        register: (id, api) => storeRef.current!.getState().register(id, api),
        unregister: (id) => storeRef.current!.getState().unregister(id),
    });

    return (
        <GuardContext.Provider value={storeRef.current}>
            <GuardApiContext.Provider value={apiRef.current}>
                {children}
                {!skipBuiltinBlocker && (
                    <GuardBlockerEffect confirmMessage={confirmMessage} />
                )}
            </GuardApiContext.Provider>
        </GuardContext.Provider>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Внутренний блокер навигации
// ─────────────────────────────────────────────────────────────────────────────

function GuardBlockerEffect({ confirmMessage }: { confirmMessage: string }) {
    const store = useContext(GuardContext)!;
    const isDirtyAnywhere = useStore(store, (s) => s.dirtyIds.size > 0);

    useBlocker({
        condition: isDirtyAnywhere,
        blockerFn: () => window.confirm(confirmMessage),
    });

    // store стабилен — слушатель ставится один раз, читает актуальное состояние через getState
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (store.getState().dirtyIds.size > 0) e.preventDefault();
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [store]);

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Внутренний хук для DirtyProvider
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Используется внутри DirtyProvider для получения API регистрации.
 * Возвращает null если гварда нет в дереве.
 */
export function useDirtyGuardContext(): GuardApi | null {
    return useContext(GuardApiContext);
}

// ─────────────────────────────────────────────────────────────────────────────
// Публичные хуки
// ─────────────────────────────────────────────────────────────────────────────

function useGuardStore<R>(selector: (state: GuardStore) => R): R {
    const store = useContext(GuardContext);
    if (!store) {
        throw new Error("useGuard* должен использоваться внутри <DirtyGuardProvider>");
    }
    return useStore(store, selector);
}

/**
 * Агрегированное состояние всех секций под гвардом.
 *
 * @example
 * const { isDirtyAnywhere, dirtyCount, isDirty } = useGuardState()
 * isDirty('profile')   // true если секция "profile" грязная
 * dirtyCount           // количество грязных секций
 */
export function useGuardState() {
    return useGuardStore((s) => ({
        isDirtyAnywhere: s.dirtyIds.size > 0,
        dirtyIds: s.dirtyIds,
        dirtyCount: s.dirtyIds.size,
        isDirty: (id: string) => s.dirtyIds.has(id),
    }));
}

/**
 * Действия над всеми грязными секциями.
 * commitAll — вызвать после успешного сохранения всех секций на сервер.
 * resetAll  — отменить все несохранённые изменения.
 *
 * @example
 * const { commitAll, resetAll } = useGuardActions()
 * await saveAll(pieces)
 * commitAll()
 */
export function useGuardActions() {
    const store = useContext(GuardContext);
    if (!store) {
        throw new Error("useGuardActions должен использоваться внутри <DirtyGuardProvider>");
    }
    // Экшены из getState() стабильны — новый объект на каждый рендер не проблема
    const { commitAll, resetAll } = store.getState();
    return { commitAll, resetAll };
}

/**
 * Кастомный UI блокера навигации.
 * Используй вместе с prop skipBuiltinBlocker на DirtyGuardProvider.
 *
 * Возвращает объект blocker из TanStack Router:
 *   status     — 'idle' | 'blocked'
 *   proceed()  — разрешить переход
 *   reset()    — отменить переход
 *
 * @example
 * // В провайдере — отключить встроенный confirm
 * <DirtyGuardProvider skipBuiltinBlocker>
 *   <MyPage />
 *   <NavigationGuard />
 * </DirtyGuardProvider>
 *
 * // Компонент с кастомным диалогом
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
    const { isDirtyAnywhere } = useGuardState();
    return useBlocker({ condition: isDirtyAnywhere });
}
