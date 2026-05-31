import { createParamDecorator } from '@nestjs/common';

/**
 * Маркер загрузки файла для client-generator-nest.
 * Рантайм по-прежнему читает файл через `req.file()` — декоратор не извлекает данные.
 */
export const UploadedFile = createParamDecorator(() => undefined);
