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
 *   useDirtyStore        — низкоуровневый доступ к стору (селектор)
 *   useDirtyState        — флаги isDirty, dirtyFields, reset, commit, initialize
 *   useField             — привязка поля к любому компоненту
 *   useGetFieldProps     — шорткат для нативных <input> / <textarea>
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
  
  /**
   * Неглубокое сравнение двух объектов.
   * Замени на fast-deep-equal или lodash.isEqual если нужна вложенность.
   */
  function shallowEqual<T extends object>(a: T, b: T): boolean {
    const keysA = Object.keys(a) as (keyof T)[];
    const keysB = Object.keys(b) as (keyof T)[];
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => a[k] === b[k]);
  }
  
  /** Возвращает Set ключей, у которых значения отличаются. */
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
  
    /** Обновить одно поле. Пересчитывает isDirty и dirtyFields. */
    updateField: <K extends keyof T>(key: K, value: T[K]) => void;
  
    /** Сбросить workingCopy к original */
    reset: () => void;
  
    /**
     * Закоммитить — сделать workingCopy новым original.
     * Вызывается после успешного сохранения на сервер.
     */
    commit: () => void;
  
    /**
     * Заменить original и workingCopy новыми данными атомарно.
     * Использовать когда данные пришли асинхронно после монтирования.
     */
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
            isDirty: !shallowEqual(workingCopy, state.original),
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
  
  type DirtyStoreApi<T extends object> = ReturnType<typeof createDirtyStore<T>>;
  
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
     * Передаётся один раз при монтировании.
     * Если данные приходят асинхронно — используй initialize().
     */
    initial: T;
  
    /**
     * Уникальный идентификатор секции.
     * Обязателен если провайдер находится внутри <DirtyGuardProvider> —
     * Guard использует id чтобы отслеживать какие секции грязные.
     */
    id?: string;
  }>;
  
  export function DirtyProvider<T extends object>({
    initial,
    id,
    children,
  }: DirtyProviderProps<T>) {
    const storeRef = useRef<DirtyStoreApi<T>>(null);
    if (!storeRef.current) {
      storeRef.current = createDirtyStore(initial);
    }
  
    // Подключаемся к Guard если он есть в дереве и передан id
    const guard = useDirtyGuardContext();
  
    useEffect(() => {
      if (!guard || !id) return;
  
      // Подписываемся на изменения isDirty и сообщаем гварду
      const unsubscribe = storeRef.current!.subscribe((state, prevState) => {
        if (state.isDirty !== prevState.isDirty) {
          if (state.isDirty) {
            guard.register(id);
          } else {
            guard.unregister(id);
          }
        }
      });
  
      // При размонтировании — снимаем регистрацию
      return () => {
        unsubscribe();
        guard.unregister(id);
      };
    }, [guard, id]);
  
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
   * Низкоуровневый доступ к стору через селектор.
   * Подписывается только на выбранный кусок состояния — нет лишних ре-рендеров.
   *
   * @example
   * const isDirty = useDirtyStore<Doc, boolean>(s => s.isDirty)
   * const workingCopy = useDirtyStore<Doc, Doc>(s => s.workingCopy)
   */
  export function useDirtyStore<T extends object, R>(
    selector: (state: DirtyStore<T>) => R
  ): R {
    const store = useDirtyContext<T>();
    return useStore(store, selector);
  }
  
  /**
   * Возвращает флаги и действия верхнего уровня.
   * Не привязан к конкретному полю.
   *
   * @example
   * const { isDirty, dirtyFields, reset, commit, initialize } = useDirtyState<Doc>()
   */
  export function useDirtyState<T extends object>() {
    return useDirtyStore<
      T,
      Pick<
        DirtyStore<T>,
        "isDirty" | "dirtyFields" | "reset" | "commit" | "initialize"
      >
    >((s) => ({
      isDirty: s.isDirty,
      dirtyFields: s.dirtyFields,
      reset: s.reset,
      commit: s.commit,
      initialize: s.initialize,
    }));
  }
  
  /**
   * Привязывает одно поле к компоненту.
   * Подписывается только на это поле — смена других не вызывает ре-рендер.
   *
   * Возвращает:
   *   value          — текущее значение из workingCopy
   *   isDirty        — изменилось ли это поле относительно original
   *   onChange       — для кастомных компонентов (value напрямую)
   *   onInputChange  — для нативных <input> / <textarea> (принимает event)
   *
   * @example
   * const field = useField<Doc, 'title'>('title')
   * <input value={field.value} onChange={field.onInputChange} />
   * <MySelect value={field.value} onValueChange={field.onChange} />
   */
  export function useField<T extends object, K extends keyof T>(key: K) {
    const store = useDirtyContext<T>();
  
    const value = useStore(store, (s) => s.workingCopy[key]);
    const isDirtyField = useStore(store, (s) => s.dirtyFields.has(key));
    const updateField = useStore(store, (s) => s.updateField);
  
    return {
      value,
      isDirty: isDirtyField,
      onChange: (newValue: T[K]) => updateField(key, newValue),
      onInputChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      ) => updateField(key, e.target.value as T[K]),
    };
  }
  
  /**
   * Возвращает фабрику getFieldProps(key) — готовые пропсы для нативных инпутов.
   *
   * Удобен когда несколько простых полей подряд и поле-специфичная логика не нужна.
   * Подписывается на весь workingCopy — при любом изменении компонент ре-рендерится.
   * Для форм с многими полями предпочти useField на каждое поле.
   *
   * @example
   * const getFieldProps = useGetFieldProps<Doc>()
   * <input {...getFieldProps('title')} />
   * <textarea {...getFieldProps('description')} />
   */
  export function useGetFieldProps<T extends object>() {
    const store = useDirtyContext<T>();
    const updateField = useStore(store, (s) => s.updateField);
    const workingCopy = useStore(store, (s) => s.workingCopy);
  
    return function getFieldProps<K extends keyof T>(key: K) {
      return {
        value: workingCopy[key] as string | number | readonly string[],
        onChange: (
          e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
        ) => updateField(key, e.target.value as T[K]),
      };
    };
  }
  