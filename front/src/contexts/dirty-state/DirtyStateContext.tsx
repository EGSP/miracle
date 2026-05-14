/**
 * dirty-state.tsx
 *
 * Локальный DirtyState через Context + Zustand (createStore).
 * Паттерн: каждый <DirtyProvider> создаёт изолированный стор,
 * который живёт в React-дереве и не протекает глобально.
 *
 * Если DirtyProvider находится внутри <DirtyGuardProvider> и имеет prop `id` —
 * он автоматически регистрирует своё dirty-состояние в гварде.
 *
 * Экспорты:
 *   DirtyProvider        — оборачивает секцию/форму
 *   DirtyStore<T>        — тип стора
 *   DirtyStoreApi<T>     — тип StoreApi (используется в DirtyGuardContext)
 *   useDirtyStore        — доступ к стору через selector
 *   useDirtyStoreApi     — доступ к сырому StoreApi (getState() в обработчиках)
 *   useField             — привязка одного поля к компоненту
 */

import {
    createContext,
    useContext,
    useEffect,
    useRef,
    type PropsWithChildren,
} from "react";
import { createStore, useStore } from "zustand";
import { useDirtyGuardContext } from "./DirtyGuardContext";

// ─────────────────────────────────────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────────────────────────────────────

function computeDirtyFields<T extends object>(
    working: T,
    original: T
): Set<keyof T> {
    const dirty = new Set<keyof T>();
    const keys = new Set([
        ...(Object.keys(working) as (keyof T)[]),
        ...(Object.keys(original) as (keyof T)[]),
    ]);
    keys.forEach((k) => {
        if (working[k] !== original[k]) dirty.add(k);
    });
    return dirty;
}

// ─────────────────────────────────────────────────────────────────────────────
// Типы стора
// ─────────────────────────────────────────────────────────────────────────────

export type DirtyStore<T extends object> = {
    /** Исходный объект — эталон для сравнения */
    original: T;
    /** Рабочая копия — мутируется пользователем */
    workingCopy: T;
    /** true если workingCopy отличается от original */
    isDirty: boolean;
    /** Набор ключей изменённых полей */
    dirtyFields: Set<keyof T>;

    updateField: <K extends keyof T>(key: K, value: T[K]) => void;
    /** Сбросить workingCopy к original */
    reset: () => void;
    /** Сделать workingCopy новым original. Вызывать после успешного сохранения. */
    commit: () => void;
    /** Атомарно заменить original и workingCopy. Для асинхронной загрузки данных. */
    initialize: (data: T) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Фабрика стора
// ─────────────────────────────────────────────────────────────────────────────

function createDirtyStore<T extends object>(initial: T) {
    return createStore<DirtyStore<T>>()((set) => ({
        original: initial,
        workingCopy: { ...initial },
        isDirty: false,
        dirtyFields: new Set(),

        updateField: (key, value) =>
            set((state) => {
                const workingCopy = { ...state.workingCopy, [key]: value };
                const dirtyFields = computeDirtyFields(workingCopy, state.original);
                return {
                    workingCopy,
                    dirtyFields,
                    isDirty: dirtyFields.size > 0,
                };
            }),

        reset: () =>
            set((state) => ({
                workingCopy: { ...state.original },
                isDirty: false,
                dirtyFields: new Set(),
            })),

        commit: () =>
            set((state) => ({
                original: { ...state.workingCopy },
                isDirty: false,
                dirtyFields: new Set(),
            })),

        initialize: (data) =>
            set({
                original: data,
                workingCopy: { ...data },
                isDirty: false,
                dirtyFields: new Set(),
            }),
    }));
}

export type DirtyStoreApi<T extends object> = ReturnType<typeof createDirtyStore<T>>;

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DirtyContext = createContext<DirtyStoreApi<any> | null>(null);

function useDirtyContext<T extends object>(): DirtyStoreApi<T> {
    const ctx = useContext(DirtyContext);
    if (!ctx) {
        throw new Error("useDirty* должен использоваться внутри <DirtyProvider>");
    }
    return ctx as DirtyStoreApi<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

type DirtyProviderProps<T extends object> = PropsWithChildren<{
    /**
     * Исходный объект — эталон для сравнения.
     * Используется один раз при монтировании.
     * Для асинхронной загрузки — вызови initialize() внутри компонента.
     */
    initial: T;
    /**
     * Идентификатор секции для регистрации в DirtyGuardProvider.
     * Обязателен если провайдер находится внутри <DirtyGuardProvider>.
     */
    id?: string;
    /**
     * Вызывать initialize(initial) при каждом изменении пропа initial.
     * Сбрасывает workingCopy даже если пользователь редактирует — использовать осторожно.
     * @default false
     */
    reinitializeOnChange?: boolean;
}>;

export function DirtyProvider<T extends object>({
    initial,
    id,
    reinitializeOnChange = false,
    children,
}: DirtyProviderProps<T>) {
    const storeRef = useRef<DirtyStoreApi<T>>(null);
    if (!storeRef.current) {
        storeRef.current = createDirtyStore(initial);
    }

    const guard = useDirtyGuardContext();

    useEffect(() => {
        if (!guard || !id) return;

        const unsubscribe = storeRef.current!.subscribe((state, prevState) => {
            if (state.isDirty !== prevState.isDirty) {
                if (state.isDirty) {
                    guard.register(id, storeRef.current!);
                } else {
                    guard.unregister(id);
                }
            }
        });

        return () => {
            unsubscribe();
            guard.unregister(id);
        };
    }, [guard, id]);

    useEffect(() => {
        if (reinitializeOnChange) {
            storeRef.current!.getState().initialize(initial);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initial, reinitializeOnChange]);

    return (
        <DirtyContext.Provider value={storeRef.current}>
            {children}
        </DirtyContext.Provider>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Хуки
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Доступ к стору через selector.
 * Подписывается только на выбранный кусок — нет лишних ре-рендеров.
 *
 * Zustand-экшены (commit, reset, initialize, updateField) стабильны —
 * их можно читать через selector без опасений.
 *
 * @example
 * const isDirty = useDirtyStore<Doc, boolean>(s => s.isDirty)
 * const commit  = useDirtyStore<Doc, () => void>(s => s.commit)
 * const copy    = useDirtyStore<Doc, Doc>(s => s.workingCopy)
 */
export function useDirtyStore<T extends object, R>(
    selector: (state: DirtyStore<T>) => R
): R {
    const store = useDirtyContext<T>();
    return useStore(store, selector);
}

/**
 * Доступ к сырому StoreApi без реактивной подписки.
 * Используй для чтения getState() внутри обработчиков сохранения —
 * компонент не будет ре-рендериться при каждом изменении workingCopy.
 *
 * @example
 * const storeApi = useDirtyStoreApi<Doc>()
 *
 * const handleSave = async () => {
 *   const { workingCopy, commit } = storeApi.getState()
 *   await api.save(workingCopy)
 *   commit()
 * }
 */
export function useDirtyStoreApi<T extends object>(): DirtyStoreApi<T> {
    return useDirtyContext<T>();
}

/**
 * Привязка одного поля к компоненту.
 * Подписывается только на это поле — смена других не вызывает ре-рендер.
 *
 * Возвращает:
 *   value          — текущее значение из workingCopy
 *   isDirty        — изменилось ли поле относительно original
 *   onChange       — для кастомных компонентов (Select, DatePicker, Switch и др.)
 *   onInputChange  — для нативных <input> / <textarea>
 *
 * @example
 * const field = useField<Doc, 'title'>('title')
 * <input value={field.value} onChange={field.onInputChange} />
 * <Select value={field.value} onValueChange={field.onChange} />
 */
export function useField<T extends object, K extends keyof T>(key: K) {
    const store = useDirtyContext<T>();

    const value = useStore(store, (s) => s.workingCopy[key]);
    const isDirtyField = useStore(store, (s) => s.dirtyFields.has(key));
    // updateField стабилен как Zustand-экшен — подписка не нужна
    const { updateField } = store.getState();

    return {
        value,
        isDirty: isDirtyField,
        onChange: (newValue: T[K]) => updateField(key, newValue),
        onInputChange: (
            e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
        ) => updateField(key, e.target.value as T[K]),
    };
}
