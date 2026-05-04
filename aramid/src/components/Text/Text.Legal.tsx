import React from 'react'
import { clsx } from 'clsx'
import { aramidTextBaseClass, textUtilitySuffix } from './textClassNames'

export interface TextLegalBaseProps {
  /**
   * `true` — стиль **expressive** (`legal-02`), `false` — **productive** (`legal-01`).
   *
   * @see https://carbondesignsystem.com/elements/typography/type-sets/ — Utility styles, legal.
   */
  expressive?: boolean

  /** Дочерний контент. */
  children?: React.ReactNode

  /** Дополнительный CSS-класс корня. */
  className?: string
}

/**
 * Юридический и мелкий служебный текст (стили Carbon `legal-*`).
 *
 * **Назначение по Carbon:**
 * - **productive** (`legal-01`): юридический текст на **продуктовых** страницах.
 * - **expressive** (`legal-02`): юридический текст на **веб-страницах**.
 *
 * @see https://carbondesignsystem.com/elements/typography/type-sets/
 */
export const TextLegal = React.forwardRef<
  HTMLElement,
  TextLegalBaseProps & { as?: React.ElementType } & React.HTMLAttributes<HTMLElement>
>(({ as: BaseComponent = 'p', expressive = false, className, children, ...rest }, ref) => {
  const suffix = textUtilitySuffix(expressive)
  return (
    <BaseComponent
      ref={ref}
      className={clsx(aramidTextBaseClass, `aramid-text-legal-${suffix}`, className)}
      {...rest}
    >
      {children}
    </BaseComponent>
  )
})

TextLegal.displayName = 'Text.Legal'
