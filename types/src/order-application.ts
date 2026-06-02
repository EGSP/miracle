/**
 * Приложение к заказу. К одному заказу может быть прикреплено несколько приложений
 * (несколько источников). Все приложения равноправны.
 *
 * Полезная нагрузка хранится в `data` дискриминированным юнионом по `type`:
 * файл (ссылка на {@link FileModel}) либо произвольный текст.
 */
export type ApplicationData =
    | { type: 'file'; fileId: string }
    | { type: 'text'; text: string };

export type ApplicationType = ApplicationData['type'];

export type OrderApplication = {
    orderId: string;
    authorId: string;
    data: ApplicationData;
};

export type OrderApplicationQuery = {
    id?: string;
    orderId?: string;
    authorId?: string;
};
