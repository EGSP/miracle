import { Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { AppConfigService } from '../../config/app-config.service.js';
import { formatUnknown } from '../../common/effect-errors.js';
import { ConvertError, convertError } from '../errors.js';

const CONVERT_TIMEOUT_MS = 120_000;
const ERROR_FRAGMENT_MAX = 500;

/**
 * HTTP-адаптер сервиса конвертации legacy `.doc` → `.docx` (LibreOffice unoserver REST API).
 * Контракт: POST `/request`, multipart `file` + `convert-to`, ответ — бинарь сконвертированного файла.
 *
 * Kreuzberg извлекает `.doc` некорректно (кириллица → CJK, обрыв текста, потеря таблиц), поэтому
 * `.doc` конвертируется в `.docx` до Kreuzberg — дальше работает полноценный OOXML-парсер.
 */
@Injectable()
export class LibreOfficeHttpConverter {
    constructor(private readonly config: AppConfigService) {}

    /** Конвертирует байты `.doc` в байты `.docx`. */
    convert(bytes: Uint8Array, fileName: string): Effect.Effect<Uint8Array<ArrayBuffer>, ConvertError> {
        return Effect.tryPromise({
            try: () => this.postConvert(bytes, fileName),
            catch: (error) => (error instanceof ConvertError ? error : convertError(formatUnknown(error))),
        });
    }

    private async postConvert(bytes: Uint8Array, fileName: string): Promise<Uint8Array<ArrayBuffer>> {
        const form = new FormData();
        // Копия в ArrayBuffer-бэкенд: гарантирует совместимость с BlobPart независимо от бэкенда входа.
        form.append('file', new Blob([new Uint8Array(bytes)]), fileName);
        form.append('convert-to', 'docx');

        const url = `${this.config.libreofficeConvertUrl.replace(/\/$/, '')}/request`;
        const response = await fetch(url, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(CONVERT_TIMEOUT_MS),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw convertError(
                `LibreOffice convert HTTP ${response.status}: ${text.slice(0, ERROR_FRAGMENT_MAX)}`,
            );
        }

        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    }
}
