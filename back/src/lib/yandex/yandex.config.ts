import { logger } from "../../logger/logger.js";

export interface YandexConfig {
    apiKey: string;
    folderId: string;
}

export function getYandexConfig(): YandexConfig {
    const apiKey = process.env.YANDEX_CLOUD_API_KEY!;
    const folderId = process.env.YANDEX_CLOUD_FOLDER_ID!;

    const config: YandexConfig = {
        apiKey,
        folderId,
    };

    if (!apiKey || !folderId) {
        logger.warn(`Конфиг Yandex Cloud: ${JSON.stringify(config)}`);
        
        throw new Error('Yandex Cloud API-ключ или идентификатор папки не задан');
    }else{
        logger.env('YANDEX_CLOUD_API_KEY', apiKey);
        logger.env('YANDEX_CLOUD_FOLDER_ID', folderId);
    }

    return config;
}