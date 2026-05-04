import React from 'react'
import { clsx } from 'clsx'
import { aramidTextBaseClass, textBodyVariantClass } from './textClassNames'

export interface TextBaseProps {
  /**
   * Набор типов **expressive** (-02): более крупная базовая кегль и воздушнее межстрочный интервал (в терминах Carbon — база 16px).
   * При `false` — **productive** (-01), плотный интерфейс (база 14px в Carbon).
   *
   * @see https://carbondesignsystem.com/elements/typography/type-sets/ — раздел Overview (type sets).
   */
  expressive?: boolean

  /**
   * Компактный вариант тела (`body-compact-*`): короткие абзацы **не более четырёх строк**, типично внутри компонентов.
   * При `false` — «длинное» тело (`body-01` / `body-02`): длинные абзацы, аккордеоны, структурированные списки.
   *
   * @see https://carbondesignsystem.com/elements/typography/type-sets/ — Body styles.
   */
  compact?: boolean

  /** Дочерний контент. */
  children?: React.ReactNode

  /** Дополнительный CSS-класс корня. */
  className?: string
}

/**
 * Основной текст (стили Carbon `body-compact-*` и `body-*`).
 *
 * **Назначение по Carbon:**
 * - **Компактный продуктивный** (`body-compact-01`): короткие абзацы не более четырёх строк, часто в компонентах.
 * - **Компактный экспрессивный** (`body-compact-02`): то же по длине; в Carbon — для экспрессивных компонентов (например кнопка, ссылка).
 * - **Длинный продуктивный** (`body-01`): более высокий межстрочный интервал, чем у компактного; длинные абзацы, аккордеон, structured list.
 * - **Длинный экспрессивный** (`body-02`): длинные абзацы в экспрессивных макетах (четыре строки и более).
 *
 * @see https://carbondesignsystem.com/elements/typography/type-sets/
 */
export const Text = React.forwardRef<
  HTMLElement,
  TextBaseProps & { as?: React.ElementType } & React.HTMLAttributes<HTMLElement>
>(
  (
    {
      as: BaseComponent = 'p',
      expressive = false,
      compact = false,
      className,
      children,
      ...rest
    },
    ref
  ) => {
    const variantClass = textBodyVariantClass({ expressive, compact })
    return (
      <BaseComponent ref={ref} className={clsx(aramidTextBaseClass, variantClass, className)} {...rest}>
        {children}
      </BaseComponent>
    )
  }
)

Text.displayName = 'Text'
