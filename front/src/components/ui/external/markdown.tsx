import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"
import "@/design/markdown.css"

export type MarkdownProps = {
  /** Markdown-текст для рендера. */
  children: string
  className?: string
}

/**
 * Кастомные рендереры элементов markdown.
 * Таблицу оборачиваем в скроллируемый контейнер: широкие таблицы (много колонок)
 * прокручиваются по горизонтали, а не ужимаются под ширину родителя.
 */
const components: Components = {
  table: ({ node: _node, ...props }) => (
    <div className="markdown-table-wrap">
      <table {...props} />
    </div>
  ),
}

/**
 * Рендер markdown через `react-markdown` + GFM.
 * Блок занимает 100% ширины и высоты родителя; при переполнении скроллится внутри себя.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn("markdown", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
