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

/** Описания источников каждого варианта markdown — показываются над превью. */
const SOURCE_DESCRIPTION = {
  markdown: "Итоговый markdown после постпроцесса (дедуп горизонтальных дублей ячеек).",
  native: "Исходный markdown из Kreuzberg до постпроцесса.",
  marked: "Итоговый markdown с подсветкой мест дедупа (зачёркивание).",
} as const

type PreparedMarkdownPreviewProps = {
  /** Итоговый markdown (после постпроцесса/дедупа). */
  markdown: string
  /** Исходный markdown Kreuzberg до дедупа (meta.nativeMarkdown). Нет — режим «исходник» недоступен. */
  nativeMarkdown?: string
  /** Маркированный markdown с подсветкой дедупа (meta.dedup.markedMarkdown). Нет — режим недоступен. */
  markedMarkdown?: string
}

/** Превью одного варианта markdown: заголовок + описание источника + счётчик символов. */
function PreviewPane({
  title,
  description,
  content,
}: {
  title: string
  description: string
  content: string
}) {
  return (
    <Stack gap={1}>
      <div>
        <Text.Label as="span">{title}</Text.Label>
        <Text.Helper as="p">
          {description} · символов: {content.length.toLocaleString("ru-RU")}
        </Text.Helper>
      </div>
      <div className="markdown-host">
        <Markdown>{content}</Markdown>
      </div>
    </Stack>
  )
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
        <PreviewPane
          title="Markdown"
          description={SOURCE_DESCRIPTION.markdown}
          content={markdown}
        />
      ) : (
        <div className="markdown-split">
          <PreviewPane
            title="Markdown (после дедупа)"
            description={SOURCE_DESCRIPTION.markdown}
            content={markdown}
          />
          {effectiveMode === "native" ? (
            <PreviewPane
              title="Исходный (Kreuzberg)"
              description={SOURCE_DESCRIPTION.native}
              content={nativeMarkdown as string}
            />
          ) : (
            <PreviewPane
              title="Разметка дедупа"
              description={SOURCE_DESCRIPTION.marked}
              content={markedMarkdown as string}
            />
          )}
        </div>
      )}
    </Stack>
  )
}
