import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"
import "@/design/markdown.css"

export type MarkdownProps = {
  /** Markdown-текст для рендера. */
  children: string
  className?: string
}

/**
 * Рендер markdown через `react-markdown` + GFM.
 * Блок занимает 100% ширины и высоты родителя; при переполнении скроллится внутри себя.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn("markdown", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
