/**
 * Копирует текст в буфер обмена через `document.execCommand('copy')`.
 *
 * Намеренно без Clipboard API: приложение часто открывают по HTTP в LAN,
 * где `navigator.clipboard` недоступен (см. комментарий в `lib/uuid.ts`).
 *
 * Вызывать синхронно из обработчика клика пользователя.
 */
export function copyTextWithExecCommand(text: string): boolean {
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.left = "-9999px"
  textarea.style.top = "0"
  document.body.appendChild(textarea)
  textarea.select()

  try {
    return document.execCommand("copy")
  } finally {
    document.body.removeChild(textarea)
  }
}
