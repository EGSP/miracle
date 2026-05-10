import React from 'react'
import { clsx } from 'clsx'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import bash from 'highlight.js/lib/languages/bash'
import xml from 'highlight.js/lib/languages/xml'
import 'highlight.js/styles/ascetic.css'
import { aramidTextBaseClass, textUtilitySuffix } from './textClassNames'

hljs.registerLanguage('json', json)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)

export interface TextCodeBaseProps {
  /**
   * `true` — стиль **expressive** (`code-02`): крупнее, для заметных фрагментов кода.
   * `false` — **productive** (`code-01`): мелкие инлайн-вставки.
   *
   * @see https://carbondesignsystem.com/elements/typography/type-sets/ — Utility styles, code.
   */
  expressive?: boolean

  /**
   * Язык для подсветки синтаксиса (highlight.js).
   * Поддерживаемые значения: `'json'`, `'typescript'`, `'javascript'`, `'bash'`, `'xml'`, `'html'`.
   * Если не передан — содержимое отображается как plain text.
   */
  language?: 'json' | 'typescript' | 'javascript' | 'bash' | 'xml' | 'html'

  /** Дочерний контент. При использовании `language` должен быть строкой. */
  children?: React.ReactNode

  /** Дополнительный CSS-класс корня. */
  className?: string
}

/**
 * Моноширинный текст для кода (стили Carbon `code-*`).
 *
 * **Назначение по Carbon:**
 * - **productive** (`code-01`): инлайн-фрагменты кода и **мелкие** элементы кода.
 * - **expressive** (`code-02`): **крупные** фрагменты кода и более заметные куски кода.
 *
 * При передаче пропа `language` применяется подсветка синтаксиса (highlight.js, тема `ascetic`).
 * В этом случае `children` должен быть строкой; для блочного отображения используйте `as="pre"`.
 *
 * @see https://carbondesignsystem.com/elements/typography/type-sets/
 */
export const TextCode = React.forwardRef<
  HTMLElement,
  TextCodeBaseProps & { as?: React.ElementType } & React.HTMLAttributes<HTMLElement>
>(({ as: BaseComponent = 'code', expressive = false, language, className, children, ...rest }, ref) => {
  const suffix = textUtilitySuffix(expressive)
  const baseClass = clsx(aramidTextBaseClass, `aramid-text-code-${suffix}`, className)

  if (language && typeof children === 'string') {
    const highlighted = hljs.highlight(children, { language })
    return (
      <BaseComponent
        ref={ref}
        className={baseClass}
        dangerouslySetInnerHTML={{ __html: highlighted.value }}
        {...rest}
      />
    )
  }

  return (
    <BaseComponent ref={ref} className={baseClass} {...rest}>
      {children}
    </BaseComponent>
  )
})

TextCode.displayName = 'Text.Code'
