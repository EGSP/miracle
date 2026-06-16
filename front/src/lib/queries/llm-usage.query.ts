import { useQuery } from "@tanstack/react-query"
import { analytics } from "@/lib/generated/analytics.client"

/** Последние завершённые записи расхода токенов (старые слева, новые справа) для дашборда статистики. */
export function useLlmUsageRecent() {
  return useQuery({
    queryKey: ["analytics", "llm-usage", "recent"],
    queryFn: () => analytics.recent(),
  })
}

/** Суммарный расход по каждому заказу за всё время (карточки с pie-чартами). */
export function useLlmUsageByOrder() {
  return useQuery({
    queryKey: ["analytics", "llm-usage", "by-order"],
    queryFn: () => analytics.byOrder(),
  })
}

/** Суммарный расход по типам джоб внутри одного заказа (pie «какая джоба сколько съела»). */
export function useLlmUsageByJob(orderId: string) {
  return useQuery({
    queryKey: ["analytics", "llm-usage", "by-job", orderId],
    queryFn: () => analytics.byJob(orderId),
  })
}
