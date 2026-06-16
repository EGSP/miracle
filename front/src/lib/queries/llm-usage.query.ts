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
