/**
 * dirty-guard.tsx
 *
 * DirtyGuardProvider — контекст-охранник для отслеживания несохранённых изменений
 * в нескольких DirtyProvider одновременно.
 *
 * Архитектура:
 *   - DirtyProvider с prop `id` автоматически регистрирует себя в ближайшем гварде
 *   - Guard хранит Set<id> грязных секций через изолированный Zustand стор
 *   - Элементы UI (кнопки, навигация) читают гвард через useGuard / useGuardBlocker
 *   - Гварды можно вкладывать: внутренний гвард не знает о внешнем
 *
 * Структура дерева:
 *
 *   <DirtyGuardProvider>                     ← знает обо всех секциях внутри
 *     <DirtyProvider id="meta">...</>         ← регистрирует себя в гварде
 *     <DirtyProvider id="content">...</>      ← регистрирует себя в гварде
 *     <SaveAllButton />                       ← читает гвард: есть хоть один dirty?
 *     <NavigationBlocker />                   ← useGuardBlocker живёт здесь
 *   </DirtyGuardProvider>
 *
 * Экспорты:
 *   DirtyGuardProvider   — оборачивает страницу с несколькими секциями
 *   useDirtyGuardContext — внутренний хук для DirtyProvider (регистрация)
 *   useGuard             — читает состояние гварда через селектор
 *   useGuardState        — флаги: isDirtyAnywhere, dirtyIds, список секций
 *   useGuardBlocker      — блокирует навигацию TanStack Router если есть dirty
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
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Тип стора
  // ─────────────────────────────────────────────────────────────────────────────
  
  type GuardStore = {
    /** Set id-шников DirtyProvider у которых isDirty === true */
    dirtyIds: Set<string>;
  
    /** Зарегистрировать секцию как грязную */
    register: (id: string) => void;
  
    /** Снять регистрацию (секция стала чистой или размонтировалась) */
    unregister: (id: string) => void;
  };
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Фабрика стора
  // ─────────────────────────────────────────────────────────────────────────────
  
  function createGuardStore() {
    return createStore<GuardStore>()((set) => ({
      dirtyIds: new Set(),
  
      register: (id) =>
        set((state) => ({
          // Создаём новый Set чтобы Zustand увидел изменение
          dirtyIds: new Set([...state.dirtyIds, id]),
        })),
  
      unregister: (id) =>
        set((state) => {
          const next = new Set(state.dirtyIds);
          next.delete(id);
          return { dirtyIds: next };
        }),
    }));
  }
  
  type GuardStoreApi = ReturnType<typeof createGuardStore>;
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Context
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Публичный контекст для чтения состояния гварда
   * (кнопки, навигация, useGuardBlocker).
   */
  const GuardContext = createContext<GuardStoreApi | null>(null);
  
  /**
   * Внутренний контекст для регистрации DirtyProvider.
   * Отделён от GuardContext чтобы DirtyProvider не делал useStore —
   * он только вызывает register/unregister, без подписки на стейт.
   */
  type GuardApi = Pick<GuardStore, "register" | "unregister">;
  const GuardApiContext = createContext<GuardApi | null>(null);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Provider
  // ─────────────────────────────────────────────────────────────────────────────
  
  type DirtyGuardProviderProps = PropsWithChildren<{
    /**
     * Текст подтверждения при попытке покинуть страницу.
     * Используется только если не передан prop `renderBlockerUI`.
     * @default "Есть несохранённые изменения. Покинуть страницу?"
     */
    confirmMessage?: string;
  }>;
  
  export function DirtyGuardProvider({
    children,
    confirmMessage = "Есть несохранённые изменения. Покинуть страницу?",
  }: DirtyGuardProviderProps) {
    const storeRef = useRef<GuardStoreApi>(null);
    if (!storeRef.current) {
      storeRef.current = createGuardStore();
    }
  
    // Стабильный объект с методами — не меняется между рендерами
    // DirtyProvider получает его через GuardApiContext и не перерисовывается
    const apiRef = useRef<GuardApi>({
      register: (id) => storeRef.current!.getState().register(id),
      unregister: (id) => storeRef.current!.getState().unregister(id),
    });
  
    return (
      <GuardContext.Provider value={storeRef.current}>
        <GuardApiContext.Provider value={apiRef.current}>
          {children}
          {/* Блокер живёт внутри провайдера — имеет доступ к стору */}
          <GuardBlockerEffect confirmMessage={confirmMessage} />
        </GuardApiContext.Provider>
      </GuardContext.Provider>
    );
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Внутренний блокер навигации
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Невидимый компонент внутри провайдера.
   * Подписывается на стор и активирует useBlocker когда есть грязные секции.
   * Использует window.confirm по умолчанию.
   * Для кастомного UI — используй useGuardBlocker снаружи.
   */
  function GuardBlockerEffect({
    confirmMessage,
  }: {
    confirmMessage: string;
  }) {
    const store = useContext(GuardContext)!;
    const isDirtyAnywhere = useStore(store, (s) => s.dirtyIds.size > 0);
  
    useBlocker({
      condition: isDirtyAnywhere,
      blockerFn: () => window.confirm(confirmMessage),
    });
  
    // Блокируем также закрытие вкладки
    useEffect(() => {
      const handler = (e: BeforeUnloadEvent) => {
        if (isDirtyAnywhere) e.preventDefault();
      };
      window.addEventListener("beforeunload", handler);
      return () => window.removeEventListener("beforeunload", handler);
    }, [isDirtyAnywhere]);
  
    return null;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Внутренний хук для DirtyProvider
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Используется внутри DirtyProvider для получения API регистрации.
   * Возвращает null если гварда нет в дереве — DirtyProvider работает без него.
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
   * Низкоуровневый доступ к стору гварда через селектор.
   *
   * @example
   * const isDirtyAnywhere = useGuard(s => s.dirtyIds.size > 0)
   * const dirtyIds = useGuard(s => s.dirtyIds)
   */
  export function useGuard<R>(selector: (state: GuardStore) => R): R {
    return useGuardStore(selector);
  }
  
  /**
   * Возвращает агрегированное состояние всех секций под гвардом.
   *
   * @example
   * const { isDirtyAnywhere, dirtyIds, dirtyCount } = useGuardState()
   */
  export function useGuardState() {
    return useGuardStore((s) => ({
      /** true если хотя бы одна секция грязная */
      isDirtyAnywhere: s.dirtyIds.size > 0,
      /** Set id-шников грязных секций */
      dirtyIds: s.dirtyIds,
      /** Количество грязных секций */
      dirtyCount: s.dirtyIds.size,
      /** Проверить конкретную секцию */
      isDirty: (id: string) => s.dirtyIds.has(id),
    }));
  }
  
  /**
   * Хук для кастомного UI блокера навигации.
   * Используй вместо встроенного window.confirm если нужна своя модалка.
   *
   * Возвращает объект blocker из TanStack Router:
   *   status      — 'idle' | 'blocked'
   *   proceed()   — разрешить навигацию (пользователь подтвердил)
   *   reset()     — отменить навигацию (пользователь остался)
   *
   * ВАЖНО: если используешь useGuardBlocker — передай prop skipBuiltinBlocker
   * в DirtyGuardProvider чтобы отключить встроенный window.confirm.
   *
   * @example
   * const blocker = useGuardBlocker()
   *
   * {blocker.status === 'blocked' && (
   *   <ConfirmDialog
   *     onConfirm={blocker.proceed}
   *     onCancel={blocker.reset}
   *   />
   * )}
   */
  export function useGuardBlocker() {
    const { isDirtyAnywhere } = useGuardState();
  
    return useBlocker({
      condition: isDirtyAnywhere,
      // blockerFn не передаём — управление через blocker.proceed() / blocker.reset()
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Пример 1 — EditorPage с несколькими секциями и встроенным блокером
   * ──────────────────────────────────────────────────────────────────
   * window.confirm показывается автоматически при попытке уйти.
   */
  
  // import { DirtyProvider, useDirtyState, useField } from './dirty-state'
  
  // type Meta = { title: string; status: 'draft' | 'published' }
  // type Content = { body: string; summary: string }
  
  // function EditorPage() {
  //   return (
  //     // Guard оборачивает всю страницу — знает обо всех секциях
  //     <DirtyGuardProvider confirmMessage="Есть несохранённые изменения. Покинуть редактор?">
  //       <DirtyProvider<Meta> id="meta" initial={{ title: '', status: 'draft' }}>
  //         <MetaSection />
  //       </DirtyProvider>
  //       <DirtyProvider<Content> id="content" initial={{ body: '', summary: '' }}>
  //         <ContentSection />
  //       </DirtyProvider>
  //       <EditorToolbar />
  //     </DirtyGuardProvider>
  //   )
  // }
  
  // // Тулбар читает Guard — знает есть ли вообще несохранённые изменения
  // function EditorToolbar() {
  //   const { isDirtyAnywhere, dirtyIds, isDirty } = useGuardState()
  //
  //   return (
  //     <div>
  //       {isDirtyAnywhere && (
  //         <span>● Есть несохранённые изменения ({dirtyIds.size} секции)</span>
  //       )}
  //       {isDirty('meta') && <span>Мета изменена</span>}
  //       {isDirty('content') && <span>Контент изменён</span>}
  //     </div>
  //   )
  // }
  
  /**
   * Пример 2 — кастомная модалка вместо window.confirm
   * ───────────────────────────────────────────────────
   * useGuardBlocker возвращает blocker объект TanStack Router.
   * Рендерим свой диалог когда status === 'blocked'.
   */
  
  // function EditorPageWithCustomBlocker() {
  //   return (
  //     // Встроенный блокер всё ещё активен — если нужна только своя модалка,
  //     // вынеси useGuardBlocker в отдельный компонент внутри провайдера
  //     // и не используй confirmMessage
  //     <DirtyGuardProvider>
  //       <DirtyProvider<Meta> id="meta" initial={{ title: '', status: 'draft' }}>
  //         <MetaSection />
  //       </DirtyProvider>
  //       <NavigationGuard />
  //     </DirtyGuardProvider>
  //   )
  // }
  
  // function NavigationGuard() {
  //   const blocker = useGuardBlocker()
  //
  //   if (blocker.status !== 'blocked') return null
  //
  //   return (
  //     <Dialog>
  //       <p>У вас есть несохранённые изменения. Покинуть страницу?</p>
  //       <button onClick={blocker.proceed}>Покинуть</button>
  //       <button onClick={blocker.reset}>Остаться</button>
  //     </Dialog>
  //   )
  // }
  
  /**
   * Пример 3 — проверка конкретной секции в кнопке
   * ────────────────────────────────────────────────
   * Кнопка сохранения мета-данных активна только если секция "meta" грязная.
   */
  
  // function SaveMetaButton() {
  //   const { isDirty } = useGuardState()
  //
  //   return (
  //     <button disabled={!isDirty('meta')} onClick={handleSaveMeta}>
  //       Сохранить мету
  //     </button>
  //   )
  // }
  
  /**
   * Пример 4 — NavLink с проверкой перед переходом
   * ────────────────────────────────────────────────
   * Элемент навигации снаружи DirtyProvider но внутри DirtyGuardProvider.
   * useGuardBlocker перехватит переход автоматически.
   */
  
  // function AppLayout() {
  //   return (
  //     <DirtyGuardProvider>
  //       <nav>
  //         <Link to="/dashboard">Дашборд</Link>  {/* переход заблокируется если isDirtyAnywhere */}
  //         <Link to="/settings">Настройки</Link>
  //       </nav>
  //       <Outlet />  {/* здесь живут страницы с DirtyProvider */}
  //     </DirtyGuardProvider>
  //   )
  // }
  