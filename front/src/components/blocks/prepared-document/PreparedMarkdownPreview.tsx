import { useState } from "react"
import { Stack, Text } from "@miracle/aramid"

import { Checkbox } from "@/components/ui/ds/checkbox"
import { Markdown } from "@/components/ui/external/markdown"

/**
 * Режимы предпросмотра:
 * - `markdown` — только итоговый markdown;
 * - `native`  — split: итоговый | исходный Kreuzberg;
 * - `marked`  — split: итоговый | маркированный (дедуп-места помечены ~~зачёркиванием~~).
 */
type PreviewMode = "markdown" | "native" | "marked"

type PreparedMarkdownPreviewProps = {
  /** Итоговый markdown (после постпроцесса/дедупа). */
  markdown: string
  /** Исходный markdown Kreuzberg до дедупа (meta.nativeMarkdown). Нет — режим «исходник» недоступен. */
  nativeMarkdown?: string
  /** Маркированный markdown с подсветкой дедупа (meta.dedup.markedMarkdown). Нет — режим недоступен. */
  markedMarkdown?: string
}

/**
 * Предпросмотр markdown подготовленного документа с эксклюзивным переключателем режима.
 * Если соответствующей разметки нет (дедуп не применялся), её режим недоступен,
 * а вид падает обратно на «Только markdown».
 */
export function PreparedMarkdownPreview({
  markdown,
  nativeMarkdown,
  markedMarkdown,
}: PreparedMarkdownPreviewProps) {
  const hasNative = typeof nativeMarkdown === "string" && nativeMarkdown.length > 0
  const hasMarked = typeof markedMarkdown === "string" && markedMarkdown.length > 0
  const [mode, setMode] = useState<PreviewMode>("markdown")

  const available: Record<PreviewMode, boolean> = {
    markdown: true,
    native: hasNative,
    marked: hasMarked,
  }
  const effectiveMode: PreviewMode = available[mode] ? mode : "markdown"

  return (
    <Stack gap={2}>
      {/* Эксклюзивный выбор: чекбоксы ведут себя как radio — клик выбирает режим,
          снять выделение «в пусто» нельзя. Режимы со split недоступны без своей разметки. */}
      <Checkbox.Group label="Режим предпросмотра" direction="horizontal">
        <Checkbox.Item
          label="Только markdown"
          checked={effectiveMode === "markdown"}
          onChange={() => setMode("markdown")}
        />
        <Checkbox.Item
          label="Markdown + исходник"
          checked={effectiveMode === "native"}
          disabled={!hasNative}
          warn={hasNative ? undefined : "Исходный markdown Kreuzberg недоступен"}
          onChange={() => setMode("native")}
        />
        <Checkbox.Item
          label="Markdown + разметка дедупа"
          checked={effectiveMode === "marked"}
          disabled={!hasMarked}
          warn={hasMarked ? undefined : "Разметка дедупа недоступна"}
          onChange={() => setMode("marked")}
        />
      </Checkbox.Group>

      {effectiveMode === "markdown" ? (
        <div className="markdown-host">
          <Markdown>{markdown}</Markdown>
        </div>
      ) : (
        <div className="markdown-split">
          <Stack gap={1}>
            <Text.Label as="span">Markdown (после дедупа)</Text.Label>
            <div className="markdown-host">
              <Markdown>{markdown}</Markdown>
            </div>
          </Stack>
          <Stack gap={1}>
            <Text.Label as="span">
              {effectiveMode === "native" ? "Исходный (Kreuzberg)" : "Разметка дедупа"}
            </Text.Label>
            <div className="markdown-host">
              <Markdown>
                {(effectiveMode === "native" ? nativeMarkdown : markedMarkdown) as string}
              </Markdown>
            </div>
          </Stack>
        </div>
      )}
    </Stack>
  )
}
