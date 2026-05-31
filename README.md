# Miracle

## Документация

- Про устройство JSON DB и различия `Stored<T>` / `StoredEntity<T>`: `back-nest/src/database/` (коллекции и сервисы)

## Быстрый старт

- Скопировать конфиг: `cp .env.example .env` (Windows: скопировать файл вручную) и при необходимости поправить значения
- Установить зависимости: `npm run install:all`
- Запустить backend в dev (`back-nest`): `npm run launch:back`
- Запустить frontend в dev: `npm run launch:front`
- Запустить вместе: `npm run launch:full`

## Отладка

### VS Code / Cursor (F5)

Используйте compound-конфигурацию `Full: Back + Front` из `.vscode/launch.json`.

- `Back: Debug` подключается к `back-nest` (`nest start --debug 9230 --watch` через task `back:dev`)
  - `restart: true` позволяет дебаггеру переподключаться после рестарта процесса
  - Логи backend идут в терминал задачи; готовность — строка `[back-nest] http://...`
- `Front: Browser` запускает браузерный debug adapter и поднимает Vite через task `front:dev`
  - Логи Vite идут в терминал задачи
  - Frontend код отлаживается в браузерном Call Stack

### Hot reload

- Backend hot reload: `nest start --watch` в `back-nest` (сборка в `dist` с корректным DI)
- Frontend hot reload: встроенный Vite HMR

Это исключает ситуацию, когда в debug запускается устаревшая сборка backend.

## Работа с ошибками

### Формат ошибок backend

Роуты возвращают единый формат `RouteError`:

```ts
{
  ok: false,
  status: number,
  code: string,
  message: string,
  details?: unknown
}
```

Если роут возвращает `RouteError`, клиент всегда получает `message`.  
Непойманные исключения проходят через `errorMiddleware` и возвращаются как `500` с `err.internal(message)`.

### Логирование ошибок backend

На backend используется `winston` (`back-nest/src/logger/`):

- Цветной вывод в консоль
- Уровни: `error`, `warn`, `info`, `http`
- `errorMiddleware` логирует все непойманные ошибки
- Роут-обработчик логирует HTTP-результаты (`method + path + status`)

### Как фронт видит ошибки (Axios)

**Что происходит за кулисами:**

1. Backend возвращает HTTP 4xx/5xx с телом `RouteError`
2. Axios бросает `AxiosError` — raw-объект, в котором `message` стандартное сетевое, а не от сервера:

```
AxiosError {
  message: "Request failed with status code 404",   // сообщение Axios, не сервера
  response: {
    status: 404,
    data: {
      ok: false,
      status: 404,
      code: "not_found",
      message: 'User "bob" not found'                // вот реальное сообщение
    }
  }
}
```

3. Response interceptor в `api.ts` перехватывает это и **конвертирует** `RouteError`-ответы в обычный `Error`:

```
Error {
  message: 'User "bob" not found',   // теперь message правильный
  status: 404,
  code: "not_found"
}
```

После этой конвертации для RouteErrors `error.message` уже содержит правильное сообщение.

---

## Аутентификация через куки

Токены (`accessToken`, `refreshToken`) передаются как `httpOnly`-куки — JS на фронте их не видит.

### Требования к стеку

| Сторона | Что нужно | Где |
|---|---|---|
| Backend | `@fastify/cookie` зарегистрирован при старте | `back-nest/src/main.ts` |
| Backend | CORS с `credentials: true` | `back-nest/src/main.ts` |
| Frontend | Axios-инстанс с `withCredentials: true` | `front/src/lib/api.ts` |

Все три условия обязательны одновременно. Без любого из них куки не будут устанавливаться или отправляться.

### Как работает авторизация

1. `POST /auth/login` — сервер генерирует пару токенов, кладёт их в `Set-Cookie` и возвращает `{ status: 'success' }`
2. Браузер автоматически прикладывает куки к каждому последующему запросу
3. `authMiddleware` читает `accessToken` из `req.cookies`, верифицирует его и кладёт `user` в `res.locals`
4. При `401` с кодом просроченного токена — `POST /auth/refresh-tokens` выдаёт новый `accessToken`, оставляя `refreshToken` прежним
5. `POST /auth/logout` — сервер очищает куки через `res.clearCookie`

### Lifetime токенов

Настраивается через переменные окружения (`.env`):

```
ACCESS_TOKEN_LIFETIME=15m
REFRESH_TOKEN_LIFETIME=7d
```

Дефолты — `15m` и `7d`. Значения парсятся библиотекой `ms`.

---

### getApiErrorMessage — зачем нужен, если message уже есть

В TypeScript catch-блок получает `error: unknown`. Прямой доступ к `error.message` не компилируется без приведения типов:

```ts
// Без хелпера — нужно вручную проверять тип:
} catch (error) {
  const message = error instanceof Error
    ? error.message
    : 'Request failed';               // а вдруг это строка? объект? null?
  setErrorText(message);
}
```

Кроме того, interceptor не покрывает все случаи. Если запрос сделан в обход `api` (другой axios-инстанс) или ошибка пришла до ответа сервера (обрыв сети, таймаут), тело `RouteError` всё ещё лежит в `error.response.data`, но уже не конвертировано.

`getApiErrorMessage` единым вызовом обрабатывает все варианты:

```ts
} catch (error) {
  // error может быть: конвертированным Error, сырым AxiosError, строкой, undefined
  setErrorText(getApiErrorMessage(error));
}
```

**Что вернёт в каждом случае:**

| Сценарий | Что прилетело | Результат |
|---|---|---|
| Обычная RouteError (после interceptor) | `Error { message: 'Login "x" is already taken' }` | `'Login "x" is already taken'` |
| Сетевая ошибка / таймаут | `AxiosError { message: 'Network Error' }` | `'Network Error'` |
| Сырой AxiosError с RouteError в теле | `AxiosError { response.data: { message: '...' } }` | сообщение из `response.data.message` |
| Неизвестный формат | `{}`, `null`, `"string"` | `'Request failed'` |
