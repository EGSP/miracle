import React from 'react'
import { clsx } from 'clsx'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import bash from 'highlight.js/lib/languages/bash'
import xml from 'highlight.js/lib/languages/xml'
import 'highlight.js/styles/ascetic.css'
import { TextCode } from '../Text/Text.Code'
import { aramidTextBaseClass, textUtilitySuffix } from '../Text/textClassNames'
import './aramid-code-snippet.css'

hljs.registerLanguage('json', json)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)

export type CodeSnippetLanguage = 'json' | 'typescript' | 'javascript' | 'bash' | 'xml' | 'html'

export interface CodeSnippetBaseProps {
  /**
   * `true` — стиль **expressive** (`code-02`): крупнее, для заметных фрагментов кода.
   * `false` — **productive** (`code-01`): мелкие блоки кода.
   */
  expressive?: boolean

  /**
   * Язык для подсветки синтаксиса (highlight.js).
   * Если не передан — содержимое отображается как plain text.
   */
  language?: CodeSnippetLanguage

  /**
   * Ограничивает высоту блока и включает вертикальный скролл.
   * `'md'` — 160 px, `'lg'` — 320 px (те же токены, что у `Text.Area`).
   */
  variant?: 'md' | 'lg'

  /**
   * Включает горизонтальный скролл и отключает перенос строк.
   * По умолчанию `false` — длинные строки переносятся.
   */
  scrollX?: boolean

  /** Дочерний контент. При использовании `language` должен быть строкой. */
  children?: React.ReactNode

  /** Дополнительный CSS-класс корня. */
  className?: string
}

function codeSnippetContainerClass({
  variant,
  scrollX,
  className,
}: {
  variant?: 'md' | 'lg'
  scrollX?: boolean
  className?: string
}) {
  return clsx(
    'aramid-code-snippet',
    variant && `aramid-code-snippet--${variant}`,
    scrollX && 'aramid-code-snippet--scroll-x',
    className,
  )
}

/**
 * Блок кода с опциональной подсветкой синтаксиса и ограничением высоты.
 *
 * Для моноширинного текста без подсветки и скролла используйте `Text.Code`.
 */
export const CodeSnippet = React.forwardRef<
  HTMLElement,
  CodeSnippetBaseProps & { as?: React.ElementType } & React.HTMLAttributes<HTMLElement>
>(({ as: BaseComponent = 'pre', expressive = false, language, variant, scrollX = false, className, children, ...rest }, ref) => {
  const containerClass = codeSnippetContainerClass({ variant, scrollX, className })

  if (language && typeof children === 'string') {
    const highlighted = hljs.highlight(children, { language })
    const suffix = textUtilitySuffix(expressive)
    return (
      <BaseComponent
        ref={ref}
        className={clsx(aramidTextBaseClass, `aramid-text-code-${suffix}`, containerClass)}
        dangerouslySetInnerHTML={{ __html: highlighted.value }}
        {...rest}
      />
    )
  }

  return (
    <TextCode ref={ref} as={BaseComponent} expressive={expressive} className={containerClass} {...rest}>
      {children}
    </TextCode>
  )
})

CodeSnippet.displayName = 'CodeSnippet'
