import { Injectable } from '@nestjs/common';
import { Session } from '@yandex-cloud/nodejs-sdk';
import { Effect } from 'effect';
import { importPKCS8, SignJWT } from 'jose';
import { AppConfigService } from '../config/app-config.service.js';
import { YandexAuthError, YandexConfigError } from './yandex.types.js';

/** Эндпоинт обмена JWT на IAM-токен (REST). */
const IAM_TOKENS_URL = 'https://iam.api.cloud.yandex.net/iam/v1/tokens';

/** Алгоритм подписи JWT, который требует Yandex (RSASSA-PSS + SHA-256). Совместим с ключом RSA_2048. */
const JWT_ALG = 'PS256';

/** Срок жизни подписанного JWT (не самого IAM-токена) — Yandex принимает не больше часа. */
const JWT_TTL = '1h';

/** Перевыпускаем IAM-токен заранее, за этот зазор до заявленного `expiresAt` (токен живёт ~12 ч). */
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

/** Фолбэк-TTL кеша токена, если ответ IAM не содержит `expiresAt`. */
const DEFAULT_TOKEN_TTL_MS = 50 * 60 * 1000;

/** Учётные данные авторизованного ключа сервис-аккаунта (после нормализации PEM). */
type ServiceAccountCredentials = {
    /** Идентификатор ключа (`id` из authorized_key.json) → `kid` JWT и `accessKeyId` для SDK. */
    readonly keyId: string;
    /** Идентификатор сервис-аккаунта (`service_account_id`) → `iss` JWT. */
    readonly serviceAccountId: string;
    /** Приватный ключ PEM PKCS8 с реальными переносами строк. */
    readonly privateKey: string;
};

/** Закешированный IAM-токен и момент, после которого его пора перевыпускать. */
type CachedToken = { readonly token: string; readonly expiresAtMs: number };

/**
 * Единая точка аутентификации в Yandex Cloud по авторизованному ключу сервис-аккаунта.
 *
 * Здесь сходятся оба способа, которые нужны проекту, потому что у них разный механизм обновления
 * IAM-токена:
 *
 * - {@link getSession} — `Session({ serviceAccountJson })` для нативных gRPC-клиентов (LLM-async,
 *   биллинг, OCR). Обмен JWT→IAM и фоновое обновление токена SDK делает сам внутри сессии; наружу
 *   токен не отдаётся.
 * - {@link getIamToken} — готовая строка IAM-токена для OpenAI-совместимого HTTP-пути (vision):
 *   ему нужен `Authorization: Bearer <token>`, а внутренний токен сессии недоступен. Поэтому токен
 *   получаем сами (подпись JWT через {@link https://github.com/panva/jose | jose} + REST-обмен) и
 *   кешируем до истечения.
 *
 * Эти два токена независимы и не переопределяют друг друга: IAM выпускает на каждый обмен новый
 * самостоятельный токен (старые остаются валидны до своего `expiresAt`), а хранятся они в разных
 * объектах (внутри `Session` и в поле этого сервиса).
 */
@Injectable()
export class YandexAuthService {
    /** Ленивая сессия для нативных gRPC-клиентов; токен внутри обновляет сам SDK. */
    private session?: Session;

    /** Кеш IAM-токена для HTTP-пути. */
    private cachedToken?: CachedToken;

    /** In-flight обмен токена — дедуплицирует параллельные запросы при протухшем кеше. */
    private inflight?: Promise<CachedToken>;

    constructor(private readonly appConfig: AppConfigService) {}

    /**
     * Общая {@link Session} на учётных данных сервис-аккаунта для нативных gRPC-клиентов. Создаётся
     * лениво и переиспользуется; обновление IAM-токена берёт на себя SDK.
     */
    getSession(): Effect.Effect<Session, YandexConfigError> {
        const self = this;
        return Effect.gen(function* () {
            const creds = yield* self.credentials();
            if (!self.session) {
                self.session = new Session({
                    serviceAccountJson: {
                        serviceAccountId: creds.serviceAccountId,
                        accessKeyId: creds.keyId,
                        privateKey: creds.privateKey,
                    },
                });
            }
            return self.session;
        });
    }

    /**
     * Свежий IAM-токен для OpenAI-совместимого пути. Отдаёт значение из кеша, пока оно не близко к
     * истечению; иначе перевыпускает (с дедупликацией параллельных запросов).
     */
    getIamToken(): Effect.Effect<string, YandexConfigError | YandexAuthError> {
        const self = this;
        return Effect.gen(function* () {
            const creds = yield* self.credentials();
            const cached = yield* Effect.tryPromise({
                try: () => self.ensureToken(creds),
                catch: (cause) => new YandexAuthError({ cause }),
            });
            return cached.token;
        });
    }

    /**
     * Возвращает валидный токен из кеша или запускает обмен. Параллельные промахи разделяют один
     * in-flight запрос, чтобы не плодить лишние обмены (на корректность не влияет — токены аддитивны).
     */
    private async ensureToken(creds: ServiceAccountCredentials): Promise<CachedToken> {
        if (this.cachedToken && Date.now() < this.cachedToken.expiresAtMs) {
            return this.cachedToken;
        }
        if (!this.inflight) {
            this.inflight = this.requestIamToken(creds).finally(() => {
                this.inflight = undefined;
            });
        }
        this.cachedToken = await this.inflight;
        return this.cachedToken;
    }

    /**
     * Подписывает JWT приватным ключом сервис-аккаунта и обменивает его на IAM-токен на эндпоинте
     * {@link IAM_TOKENS_URL}. Это тот же документированный поток, что выполняет `yc iam create-token`.
     */
    private async requestIamToken(creds: ServiceAccountCredentials): Promise<CachedToken> {
        const key = await importPKCS8(creds.privateKey, JWT_ALG);
        const jwt = await new SignJWT({})
            .setProtectedHeader({ alg: JWT_ALG, kid: creds.keyId, typ: 'JWT' })
            .setIssuer(creds.serviceAccountId)
            .setAudience(IAM_TOKENS_URL)
            .setIssuedAt()
            .setExpirationTime(JWT_TTL)
            .sign(key);

        const res = await fetch(IAM_TOKENS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jwt }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`IAM tokens HTTP ${res.status}: ${body}`);
        }

        const data = (await res.json()) as { iamToken?: string; expiresAt?: string };
        if (!data.iamToken) {
            throw new Error('IAM tokens: ответ без поля iamToken');
        }
        const expiresAtMs = data.expiresAt
            ? Date.parse(data.expiresAt) - TOKEN_REFRESH_SKEW_MS
            : Date.now() + DEFAULT_TOKEN_TTL_MS;
        return { token: data.iamToken, expiresAtMs };
    }

    /**
     * Читает учётные данные сервис-аккаунта из окружения и нормализует PEM (экранированные `\n` →
     * реальные переносы). Падает с {@link YandexConfigError}, если ключ не сконфигурирован полностью.
     */
    private credentials(): Effect.Effect<ServiceAccountCredentials, YandexConfigError> {
        const self = this;
        return Effect.gen(function* () {
            const keyId = self.appConfig.yandexIamKeyId;
            const serviceAccountId = self.appConfig.yandexServiceAccountId;
            const rawKey = self.appConfig.yandexPrivateKey;
            if (!keyId || !serviceAccountId || !rawKey) {
                return yield* new YandexConfigError({
                    message:
                        'Yandex Cloud не сконфигурирован: задайте YANDEX_CLOUD_IAM_ID, ' +
                        'YANDEX_CLOUD_IAM_SERVICE_ID и YANDEX_CLOUD_IAM_PRIVATE_KEY',
                });
            }
            return { keyId, serviceAccountId, privateKey: rawKey.replace(/\\n/g, '\n') };
        });
    }
}
