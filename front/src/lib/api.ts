import axios, { AxiosError, AxiosResponse, type AxiosRequestConfig } from "axios";
import { frontConfig } from "./config";
import { auth } from "./generated";
import { RefreshTokensResponse } from "./generated/models";
import { useAuthStore } from "./stores/auth.store";

const api = axios.create({
    baseURL: frontConfig.API_URL,
});

export const customInstance = async <T>(config: AxiosRequestConfig): Promise<T> => {
    const response = await api.request<T>(config);
    return response.data;
};

export default api;



/// REFRESH TOKEN INTERCEPTOR

// Этот promise используется для запуска refreshTokenPair в единственном экземпляре.
let sharedRefreshPromise: Promise<string> | null = null;

/**
 * Проверяет необходимость обновления, запускает refresh и обновляет authState.
 * Можно вызывать из interceptor при 401 и из refreshTokenMutation.
 * @returns Новый accessToken
 * @throws При ошибке обновления — вызывает logout и пробрасывает ошибку
 */
export async function refreshTokenPair(): Promise<string> {
    const authState = useAuthStore.getState();

    if (authState.status === 'unauthorized') {
        throw new Error('Cannot refresh: already unauthorized');
    }

    if (sharedRefreshPromise) {
        return sharedRefreshPromise;
    }

    sharedRefreshPromise = (async () => {
        try {
            // Этот вызов post перейдет внутри себя в интерсептор,
            // если ответ будет с ошибкой (например 401).
            // Поэтому в интерсепторе мы учитываем конкретный api-путь /api/v1/auth/refresh.
            // чтобы не зациклиться на обновлении токена при вызове refreshTokenPair.
            const { status }: RefreshTokensResponse = await auth.refreshTokens();

            if (status !== 'success') throw new Error('Failed to refresh tokens');

            authState.setStatus('valid');

            return 'success';
        } catch (error) {
            console.warn('Refresh token failed');
            authState.setStatus('unauthorized');

            throw error;
        } finally {
            sharedRefreshPromise = null;
        }
    })();

    return sharedRefreshPromise;
}

// Обрабатываем 401 ошибку:
// Если токен просрочен, то пытаемся обновить токен
// Если обновление токена успешно, то повторяем запрос с новым токеном
// Если обновление токена неуспешно, то явно разлогиниваемся и возвращаем ошибку
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const { response, config } = error;
        const authState = useAuthStore.getState();

        if (!response || response.status !== 401 || !config || authState.status === 'unauthorized') throw error;

        // Это важная проверка, чтобы не зациклиться на обновлении токена при вызове refreshTokenPair
        if (config.url?.includes('/auth/refresh')) throw error;

        try {
            const accessToken = await refreshTokenPair();

            config.headers.Authorization = `Bearer ${accessToken}`;
            return api(config);
        } catch (refreshError) {
            return Promise.reject(refreshError);
        }
    },
);