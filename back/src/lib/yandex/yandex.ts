import { Session } from '@yandex-cloud/nodejs-sdk';
import { getYandexConfig, type YandexConfig } from './yandex.config.js';

class Yandex {
    private config?: YandexConfig;
    private session?: Session;

    /**
     * Возвращает и кэширует конфигурацию Yandex Cloud.
     * Первый вызов читает переменные окружения через getYandexConfig(),
     * последующие — возвращают уже подготовленный объект.
     */
    getConfig(): YandexConfig {
        if (!this.config) {
            this.config = getYandexConfig();
        }

        return this.config;
    }

    /**
     * Возвращает и кэширует singleton-сессию SDK.
     * Сессия создается лениво при первом обращении и затем переиспользуется
     * всеми воркерами/сервисами в рамках процесса.
     */
    getSession(): Session {
        if (!this.session) {
            const { apiKey } = this.getConfig();
            this.session = new Session({
                iamToken: '',
                headers: {
                    Authorization: `Api-Key ${apiKey}`,
                },
            });
        }

        return this.session;
    }
}

export const yandex = new Yandex();
