/**
 * Баланс биллинг-аккаунта Yandex Cloud — общий контракт фронта и бэкенда.
 *
 * Бэкенд кеширует значение (см. `YandexBillingService`), поэтому `fetchedAt` — это момент
 * фактического обращения к Yandex, а не времени ответа клиенту: по нему видно «свежесть» баланса.
 */
export type YandexBalance = {
    /** ID биллинг-аккаунта Yandex Cloud. */
    accountId: string;
    /** Текущий баланс в валюте аккаунта (Yandex отдаёт строкой — здесь уже число). */
    balance: number;
    /** Валюта аккаунта: `RUB` / `USD` / `KZT`. */
    currency: string;
    /** ISO-метка момента обращения к Yandex (свежесть кешированного значения). */
    fetchedAt: string;
};
