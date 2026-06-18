/**
 * Типы и ошибки биллинговой части Yandex-сервиса.
 *
 * Как и у LLM-клиента (см. `yandex-sdk.types.ts`), .d.ts биллинг-клиента описывают callback-API
 * (gRPC-стандарт), хотя в рантайме `session.client()` промисифицирует unary-методы. Поэтому клиент
 * приводится к промисифицированному типу через `as unknown as BillingClient`.
 */

import { Data } from 'effect';
import type { billingAccount, billingAccountService } from '@yandex-cloud/nodejs-sdk/billing-v1';
import { formatUnknown } from '../common/effect-errors.js';

/**
 * Промисифицированный клиент `BillingAccountService`.
 *
 * Оригинал: `billingAccountService.BillingAccountServiceClient`.
 *
 * Unary-методы:
 * - `get` — возвращает один аккаунт по id;
 * - `list` — возвращает страницу доступных аккаунтов.
 */
export type BillingClient = {
    get(request: billingAccountService.GetBillingAccountRequest): Promise<billingAccount.BillingAccount>;
    list(
        request: billingAccountService.ListBillingAccountsRequest,
    ): Promise<billingAccountService.ListBillingAccountsResponse>;
};

/** Yandex Cloud не сконфигурирован (нет API-ключа). */
export class YandexBillingConfigError extends Data.TaggedError('YandexBillingConfigError')<{
    readonly message: string;
}> {}

/** Сбой gRPC-вызова биллинг-сервиса. */
export class YandexBillingTransportError extends Data.TaggedError('YandexBillingTransportError')<{
    readonly operation: 'get' | 'list';
    readonly cause: unknown;
}> {
    override get message(): string {
        return `Yandex Billing ${this.operation}: ${formatUnknown(this.cause)}`;
    }
}

/** У текущего аккаунта нет доступных биллинг-аккаунтов (пустой `list`). */
export class YandexBillingEmptyError extends Data.TaggedError('YandexBillingEmptyError')<{
    readonly message: string;
}> {}

export type YandexBillingError =
    | YandexBillingConfigError
    | YandexBillingTransportError
    | YandexBillingEmptyError;
