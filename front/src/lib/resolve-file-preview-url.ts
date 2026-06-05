import type { FileWithMeta } from "@miracle/types"

import { frontConfig } from "@/lib/config"

/** URL бинарного содержимого файла для `<img>` / `<iframe>` (страница Files, приложения заказа). */
export function resolveFilePreviewUrl(file: FileWithMeta): string {
  return `${frontConfig.API_URL}/files/${encodeURIComponent(file.id)}/content`
}

/** URL скачивания файла (Content-Disposition: attachment). */
export function resolveFileDownloadUrl(file: FileWithMeta): string {
  return `${resolveFilePreviewUrl(file)}?download=1`
}
