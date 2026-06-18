import { Injectable, type OnModuleInit } from '@nestjs/common';
import { billingAccountService } from '@yandex-cloud/nodejs-sdk/billing-v1';
import type { YandexBalance } from '@miracle/types';
import { Duration, Effect } from 'effect';
import { AppConfigService } from '../config/app-config.service.js';
import { YandexAuthService } from './yandex-auth.service.js';
import {
    YandexBillingConfigError,
    YandexBillingEmptyError,
    YandexBillingTransportError,
    type BillingClient,
    type YandexBillingError,
} from './yandex-billing.types.js';

/**
 * TTL кеша баланса. Значение «обнуляется» (перечитывается из Yandex) не чаще раза в 2 минуты —
 * остальные запросы в этом окне отдают кешированное значение, не дёргая биллинг-API.
 */
const BALANCE_CACHE_TTL = Duration.minutes(2);

/**
 * Биллинговая часть Yandex-сервиса: текущий баланс аккаунта.
 *
 * Баланс берётся через нативный SDK (`BillingAccountService`, эндпоинт `billing.api.cloud.yandex.net`)
 * на общей IAM-сессии из {@link YandexAuthService} (Billing принимает только IAM-токен, не API-ключ).
 *
 * Чтобы не ходить в Yandex на каждый запрос фронта, значение мемоизируется через
 * {@link Effect.cachedWithTTL} с {@link BALANCE_CACHE_TTL}: параллельные вызовы дедуплицируются,
 * а реальный gRPC-запрос уходит не чаще TTL.
 */
@Injectable()
export class YandexBillingService implements OnModuleInit {
    private client?: BillingClient;

    /**
     * Мемоизированный effect баланса с TTL. Инициализируется в {@link onModuleInit}, потому что сам
     * `cachedWithTTL` — effectful: его нужно один раз выполнить, чтобы получить кеширующий effect.
     */
    private cachedBalance!: Effect.Effect<YandexBalance, YandexBillingError>;

    constructor(
        private readonly appConfig: AppConfigService,
        private readonly auth: YandexAuthService,
    ) {}

    async onModuleInit(): Promise<void> {
        this.cachedBalance = await Effect.runPromise(
            Effect.cachedWithTTL(this.fetchBalance(), BALANCE_CACHE_TTL),
        );
    }

    /** Текущий баланс биллинг-аккаунта из кеша (TTL 2 мин). К Yandex ходит не чаще TTL. */
    getBalance(): Effect.Effect<YandexBalance, YandexBillingError> {
        return this.cachedBalance;
    }

    /** Реальное обращение к Yandex Billing. Кешируется в {@link cachedBalance}. */
    private fetchBalance(): Effect.Effect<YandexBalance, YandexBillingError> {
        const self = this;
        return Effect.gen(function* () {
            const client = yield* self.billingClient();
            const configuredId = self.appConfig.yandexBillingAccountId;

            const account = configuredId
                ? yield* Effect.tryPromise({
                      try: () =>
                          client.get(
                              billingAccountService.GetBillingAccountRequest.fromPartial({ id: configuredId }),
                          ),
                      catch: (cause) => new YandexBillingTransportError({ operation: 'get', cause }),
                  })
                : yield* self.firstAccount(client);

            return {
                accountId: account.id,
                // Yandex отдаёт баланс строкой; NaN маловероятен, но подстрахуемся нулём.
                balance: Number.isFinite(Number(account.balance)) ? Number(account.balance) : 0,
                currency: account.currency,
                fetchedAt: new Date().toISOString(),
            } satisfies YandexBalance;
        });
    }

    /** Первый доступный биллинг-аккаунт — fallback, когда id не задан в конфиге. */
    private firstAccount(
        client: BillingClient,
    ): Effect.Effect<Awaited<ReturnType<BillingClient['get']>>, YandexBillingError> {
        return Effect.gen(function* () {
            const response = yield* Effect.tryPromise({
                try: () => client.list(billingAccountService.ListBillingAccountsRequest.fromPartial({ pageSize: 1 })),
                catch: (cause) => new YandexBillingTransportError({ operation: 'list', cause }),
            });
            const account = response.billingAccounts[0];
            if (!account) {
                return yield* new YandexBillingEmptyError({
                    message: 'У текущего аккаунта Yandex нет доступных биллинг-аккаунтов',
                });
            }
            return account;
        });
    }

    /**
     * Лениво создаёт промисифицированный биллинг-клиент на общей IAM-сессии. Ошибку конфигурации
     * сессии (нет ключа сервис-аккаунта) приводим к {@link YandexBillingConfigError}, чтобы тип
     * ошибок биллинга оставался замкнут на свой union.
     */
    private billingClient(): Effect.Effect<BillingClient, YandexBillingConfigError> {
        const self = this;
        return Effect.gen(function* () {
            if (!self.client) {
                const session = yield* self.auth
                    .getSession()
                    .pipe(Effect.mapError((error) => new YandexBillingConfigError({ message: error.message })));
                self.client = session.client(
                    billingAccountService.BillingAccountServiceClient,
                ) as unknown as BillingClient;
            }
            return self.client;
        });
    }
}
