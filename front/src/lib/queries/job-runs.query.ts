import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/generated/jobs.client"

const ROOTS_POLL_MS = 3000

export function useJobRunsList() {
  return useQuery({
    queryKey: ["jobs", "roots"],
    // Серверный фильтр корней — без выкачки всего лога прогонов.
    queryFn: () => jobs.list({ sort: "desc", onlyRoots: true }),
    refetchInterval: ROOTS_POLL_MS,
  })
}

export function useJobRunTree(rootId: string | null) {
  return useQuery({
    queryKey: ["jobs", "tree", rootId],
    queryFn: () => {
      if (rootId == null) throw new Error("rootId required")
      return jobs.tree(rootId)
    },
    enabled: rootId != null,
  })
}
