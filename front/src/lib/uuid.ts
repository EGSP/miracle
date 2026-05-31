import { v4 as uuidv4 } from "uuid"

/**
 * Генерирует UUID v4 для клиентских сущностей (правила ТУ, шаблоны отображения и т.п.).
 *
 * На фронтенде не используем `crypto.randomUUID()`: в браузере она доступна только
 * в secure context (HTTPS или localhost). После деплоя приложение часто открывают
 * по HTTP с IP другой машины в LAN — там `crypto.randomUUID` отсутствует или падает,
 * и UI ломается при добавлении элементов с новым id.
 *
 * Пакет `uuid` работает в любом контексте и даёт тот же формат идентификатора.
 * На бэкенде по-прежнему используется `randomUUID` из Node `crypto`.
 */
export function createUuid(): string {
  return uuidv4()
}
