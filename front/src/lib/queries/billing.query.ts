import { useQuery } from "@tanstack/react-query"
import { billing } from "@/lib/generated/billing.client"

/**
 * Баланс биллинг-аккаунта Yandex Cloud для шапки страниц статистики.
 *
 * Бэкенд уже кеширует значение на 2 минуты, поэтому здесь держим тот же `staleTime` — лишних
 * запросов к API не делаем, в это окно отдаётся кешированное значение.
 */
export function useYandexBalance() {
  return useQuery({
    queryKey: ["billing", "balance"],
    queryFn: () => billing.balance(),
    staleTime: 2 * 60 * 1000,
  })
}
