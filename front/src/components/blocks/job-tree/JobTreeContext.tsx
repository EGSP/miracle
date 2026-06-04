import { createContext, type ReactNode, useContext, useEffect, useRef } from "react"
import { useStore } from "zustand"
import { createJobTreeStore, type JobTreeState, type JobTreeStore } from "./job-tree.store"

const JobTreeStoreContext = createContext<JobTreeStore | null>(null)

export function useJobTreeStoreApi(): JobTreeStore {
  const store = useContext(JobTreeStoreContext)
  if (!store) throw new Error("useJobTreeStore must be used within JobTreeProvider")
  return store
}

export function useJobTreeStore<T>(selector: (state: JobTreeState) => T): T {
  return useStore(useJobTreeStoreApi(), selector)
}

export type JobTreeProviderProps = {
  rootId: string
  /** Предвыбранный узел (для deep-link по URL). */
  initialRunId?: string | null
  children: ReactNode
}

/**
 * Один стор на выбранный корень. Монтируется с `key={rootId}` на странице, поэтому при смене
 * корня стор пересоздаётся — без глобальных реестров. И дерево, и карточка читают этот стор.
 */
export function JobTreeProvider({ rootId, initialRunId, children }: JobTreeProviderProps) {
  const storeRef = useRef<JobTreeStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = createJobTreeStore(rootId)
  }
  const store = storeRef.current

  useEffect(() => {
    if (initialRunId) store.getState().select(initialRunId)
  }, [initialRunId, store])

  return <JobTreeStoreContext.Provider value={store}>{children}</JobTreeStoreContext.Provider>
}
