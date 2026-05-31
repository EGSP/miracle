import type { FileWithMeta, Order } from "@miracle/types"
import { useMemo } from "react"
import { useAuthContext } from "@/contexts/AuthContext"

export type OrderFilters = {
  myOrdersOnly: boolean
  withFileOnly: boolean | undefined
}

export function useFilteredOrders<T extends Order>(
  orders: T[] | undefined,
  filters: OrderFilters,
  filesById: Map<string, FileWithMeta>,
): T[] {
  const { userId } = useAuthContext()

  return useMemo(() => {
    if (!orders) {
      return []
    }

    let result = orders

    if (filters.myOrdersOnly) {
      result = result.filter((order) => order.authorId === userId)
    }

    if (filters.withFileOnly === true) {
      result = result.filter((order) => {
        if (!order.fileId) return false
        return filesById.get(order.fileId)?.meta?.available === true
      })
    } else if (filters.withFileOnly === false) {
      result = result.filter((order) => {
        if (!order.fileId) return true
        return filesById.get(order.fileId)?.meta?.available !== true
      })
    }

    return result
  }, [orders, filters.myOrdersOnly, filters.withFileOnly, userId, filesById])
}
