import { Text } from "@miracle/aramid"
import type { YandexBalance } from "@miracle/types"
import { useYandexBalance } from "@/lib/queries/billing.query"
import "@/design/balance-header.css"

/** Форматирует баланс в валюте аккаунта (для проекта — рубли). */
function formatBalance({ balance, currency }: YandexBalance): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: currency || "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(balance)
}

/**
 * Шапка с балансом биллинг-аккаунта Yandex Cloud. Значение кешируется на бэке (TTL 2 мин),
 * фронт держит тот же `staleTime` — см. {@link useYandexBalance}.
 */
export function BalanceHeader() {
  const { data, isLoading, error } = useYandexBalance()

  const value = isLoading ? "…" : error || !data ? "—" : formatBalance(data)
  const isLow = !!data && data.balance <= 0

  return (
    <div className="balance-header" data-slot="balance-header">
      <Text.Helper as="span" className="balance-header__label">
        Баланс Yandex Cloud
      </Text.Helper>
      <Text
        as="span"
        compact
        className={`balance-header__value${isLow ? " balance-header__value--low" : ""}`}
      >
        {value}
      </Text>
    </div>
  )
}
