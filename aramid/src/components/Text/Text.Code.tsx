import React from 'react'
import { clsx } from 'clsx'
import { aramidTextBaseClass, textUtilitySuffix } from './textClassNames'

export interface TextCodeBaseProps {
  /**
   * `true` — стиль **expressive** (`code-02`): крупнее, для заметных фрагментов кода.
   * `false` — **productive** (`code-01`): мелкие инлайн-вставки.
   *
   * @see https://carbondesignsystem.com/elements/typography/type-sets/ — Utility styles, code.
   */
  expressive?: boolean

  /** Дочерний контент. */
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
 * @see https://carbondesignsystem.com/elements/typography/type-sets/
 */
export const TextCode = React.forwardRef<
  HTMLElement,
  TextCodeBaseProps & { as?: React.ElementType } & React.HTMLAttributes<HTMLElement>
>(({ as: BaseComponent = 'code', expressive = false, className, children, ...rest }, ref) => {
  const suffix = textUtilitySuffix(expressive)
  return (
    <BaseComponent
      ref={ref}
      className={clsx(aramidTextBaseClass, `aramid-text-code-${suffix}`, className)}
      {...rest}
    >
      {children}
    </BaseComponent>
  )
})

TextCode.displayName = 'Text.Code'
