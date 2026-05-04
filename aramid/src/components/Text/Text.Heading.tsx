import React from 'react'
import { clsx } from 'clsx'
import { aramidTextBaseClass, textHeadingVariantClass, type TextHeadingVariant } from './textClassNames'

export interface TextHeadingBaseProps {
  /**
   * Уровень фиксированного заголовка (в коде Aramid — только **productive**-масштаб Carbon: `heading-compact-01` … `heading-07`).
   *
   * Смысл уровней по Carbon (фиксированные заголовки, размер не меняется по breakpoint):
   * - `compact-01` — заголовки компонентов и макета; сочетается с `body-compact-01`.
   * - `compact-02` — более мелкие заголовки макета; сочетается с `body-compact-02`.
   * - `01` — заголовки компонентов и макета; сочетается с `body-01`.
   * - `02` — более мелкие заголовки макета; сочетается с `body-02`.
   * - `03` … `07` — заголовки макета по возрастающей иерархии (размеры как у Carbon `heading-03` … `heading-07`).
   *
   * Политика доступности: задайте `as` (`h1`–`h6`) в соответствии со структурой страницы, а не только по визуальному размеру.
   *
   * @see https://carbondesignsystem.com/elements/typography/type-sets/ — Fixed heading styles.
   */
  variant: TextHeadingVariant

  /** Дочерний контент. */
  children?: React.ReactNode

  /** Дополнительный CSS-класс корня. */
  className?: string
}

/**
 * Фиксированные заголовки (масштаб Carbon **fixed headings**, в Aramid без fluid-вариантов).
 *
 * **Назначение по Carbon:** плотные продуктовые страницы с контейнерами; размер текста постоянный при любых breakpoint.
 * Для веб-страниц в Carbon также используют мелкие фиксированные заголовки `-01` / `-02` там, где нужна компактность.
 *
 * @see https://carbondesignsystem.com/elements/typography/type-sets/
 */
export const TextHeading = React.forwardRef<
  HTMLElement,
  TextHeadingBaseProps & { as?: React.ElementType } & React.HTMLAttributes<HTMLElement>
>(({ as: BaseComponent = 'h2', variant, className, children, ...rest }, ref) => {
  const variantClass = textHeadingVariantClass(variant)
  return (
    <BaseComponent ref={ref} className={clsx(aramidTextBaseClass, variantClass, className)} {...rest}>
      {children}
    </BaseComponent>
  )
})

TextHeading.displayName = 'Text.Heading'
