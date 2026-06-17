import { useEffect } from "react"

const APP_NAME = "Miracle"

/**
 * Устанавливает заголовок вкладки браузера в формате `«title» — Miracle`.
 * При размонтировании страницы сбрасывает заголовок к базовому `Miracle`.
 *
 * @param title - Заголовок страницы. Если `undefined` или `null` — используется только имя приложения.
 *
 * @example
 * // Фиксированный заголовок
 * usePageTitle("Файлы")
 *
 * @example
 * // Динамический заголовок (например, имя файла из запроса)
 * const fileName = files[0]?.name
 * usePageTitle(fileName)
 */
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME
    return () => {
      document.title = APP_NAME
    }
  }, [title])
}
