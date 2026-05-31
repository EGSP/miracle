import axios, { type AxiosError, type AxiosRequestConfig } from "axios"
import { frontConfig } from "./config"
import { auth } from "./generated"
import type { AuthSuccessResponse } from "./generated/models"
import { useAuthStore } from "./stores/auth.store"

const api = axios.create({
  baseURL: frontConfig.API_URL,
  withCredentials: true,
})

export const customInstance = async <T>(config: AxiosRequestConfig): Promise<T> => {
  const response = await api.request<T>(config)
  return response.data
}

type ApiRouteError = {
  ok: false
  status: number
  code: string
  message: string
  details?: unknown
}

type ClientApiError = Error & {
  status?: number
  code?: string
  details?: unknown
}

function isApiRouteError(value: unknown): value is ApiRouteError {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    (value as Record<string, unknown>).ok === false &&
    typeof (value as Record<string, unknown>).message === "string"
  )
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    isApiRouteError((error as { response?: { data?: unknown } }).response?.data)
  ) {
    return (error as { response: { data: ApiRouteError } }).response.data.message
  }

  return "Request failed"
}

export default api

/// Перехватчик обновления refresh-токена

// Этот promise используется для запуска refreshTokenPair в единственном экземпляре.
let sharedRefreshPromise: Promise<AuthSuccessResponse> | null = null

/**
 * Проверяет необходимость обновления, запускает refresh и обновляет authState.
 * Можно вызывать из interceptor при 401 и из refreshTokenMutation.
 * @returns Новый accessToken
 * @throws При ошибке обновления — вызывает logout и пробрасывает ошибку
 */
export async function refreshTokenPair(): Promise<AuthSuccessResponse> {
  const authState = useAuthStore.getState()

  if (authState.status === "unauthorized") {
    throw new Error("Cannot refresh: already unauthorized")
  }

  if (sharedRefreshPromise) {
    return sharedRefreshPromise
  }

  sharedRefreshPromise = (async () => {
    try {
      // Этот вызов post перейдет внутри себя в интерсептор,
      // если ответ будет с ошибкой (например 401).
      // Поэтому в интерсепторе мы учитываем конкретный api-путь /api/v1/auth/refresh.
      // чтобы не зациклиться на обновлении токена при вызове refreshTokenPair.
      const refreshTokensResponse: AuthSuccessResponse = await auth.refreshTokens()

      if (refreshTokensResponse.status !== "success") throw new Error("Failed to refresh tokens")

      authState.setStatus("valid")

      return refreshTokensResponse
    } catch (error) {
      console.warn("Refresh token failed")
      authState.setStatus("unauthorized")

      throw error
    } finally {
      sharedRefreshPromise = null
    }
  })()

  return sharedRefreshPromise
}

// Обрабатываем 401 ошибку:
// Если токен просрочен, то пытаемся обновить токен
// Если обновление токена успешно, то повторяем запрос с новым токеном
// Если обновление токена неуспешно, то явно разлогиниваемся и возвращаем ошибку
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const { response, config } = error
    const routeErrorPayload = response?.data

    console.log("routeErrorPayload", routeErrorPayload)

    if (isApiRouteError(routeErrorPayload)) {
      const apiError = new Error(routeErrorPayload.message) as ClientApiError
      apiError.status = routeErrorPayload.status
      apiError.code = routeErrorPayload.code
      apiError.details = routeErrorPayload.details
      if (routeErrorPayload.status !== 401) {
        return Promise.reject(apiError)
      }
    }

    console.log("continue to refresh")

    const authState = useAuthStore.getState()

    if (!response || response.status !== 401 || !config || authState.status === "unauthorized") {
      console.log(authState.status)
      return Promise.reject(error)
    }

    // Это важная проверка, чтобы не зациклиться на обновлении токена при вызове refreshTokenPair
    if (config.url?.includes("/auth/refresh")) throw error

    try {
      console.log("Trying to refresh token")
      await refreshTokenPair()

      return api(config)
    } catch (refreshError) {
      return Promise.reject(refreshError)
    }
  },
)
