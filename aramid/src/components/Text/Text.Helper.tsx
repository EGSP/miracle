import React from 'react'
import { clsx } from 'clsx'
import { aramidTextBaseClass, textUtilitySuffix } from './textClassNames'

export interface TextHelperBaseProps {
  /**
   * `true` — стиль **expressive** (`helper-text-02`), `false` — **productive** (`helper-text-01`).
   *
   * @see https://carbondesignsystem.com/elements/typography/type-sets/ — Utility styles, helper text.
   */
  expressive?: boolean

  /** Дочерний контент. */
  children?: React.ReactNode

  /** Дополнительный CSS-класс корня. */
  className?: string
}

/**
 * Поясняющий текст под заголовком поля внутри компонента (стили Carbon `helper-text-*`).
 *
 * **Назначение по Carbon:** пояснительный текст, который появляется **под заголовком поля** (field title) внутри компонента.
 *
 * @see https://carbondesignsystem.com/elements/typography/type-sets/
 */
export const TextHelper = React.forwardRef<
  HTMLElement,
  TextHelperBaseProps & { as?: React.ElementType } & React.HTMLAttributes<HTMLElement>
>(({ as: BaseComponent = 'p', expressive = false, className, children, ...rest }, ref) => {
  const suffix = textUtilitySuffix(expressive)
  return (
    <BaseComponent
      ref={ref}
      className={clsx(aramidTextBaseClass, `aramid-text-helper-${suffix}`, className)}
      {...rest}
    >
      {children}
    </BaseComponent>
  )
})

TextHelper.displayName = 'Text.Helper'
