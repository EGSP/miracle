import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/generated/jobs.client"
import { isJobStatusActive } from "@/components/blocks/job-tree/job-tree.utils"

const ROOTS_POLL_MS = 3000

export function useJobRunsList() {
  return useQuery({
    queryKey: ["jobs", "roots"],
    // Серверный фильтр корней — без выкачки всего лога прогонов.
    queryFn: () => jobs.list({ sort: "desc", onlyRoots: true }),
    refetchInterval: (query) => {
      const roots = query.state.data
      if (!roots?.some((root) => isJobStatusActive(root.status))) return false
      return ROOTS_POLL_MS
    },
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
