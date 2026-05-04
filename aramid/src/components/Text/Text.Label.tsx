import React from 'react'
import { clsx } from 'clsx'
import { aramidTextBaseClass, textUtilitySuffix } from './textClassNames'

export interface TextLabelBaseProps {
  /**
   * `true` — стиль **expressive** (`label-02`), `false` — **productive** (`label-01`).
   *
   * @see https://carbondesignsystem.com/elements/typography/type-sets/ — Utility styles, label.
   */
  expressive?: boolean

  /** Дочерний контент. */
  children?: React.ReactNode

  /** Дополнительный CSS-класс корня. */
  className?: string
}

/**
 * Подписи к полям, подписи к элементам, сообщения об ошибках, подписи-снимки (стили Carbon `label-*`).
 *
 * **Назначение по Carbon:** универсальный стиль для подписей полей в компонентах, сообщений об ошибках и подписей (captions).
 * **Не использовать** для основного абзацного текста (body copy).
 *
 * @see https://carbondesignsystem.com/elements/typography/type-sets/
 */
export const TextLabel = React.forwardRef<
  HTMLElement,
  TextLabelBaseProps & { as?: React.ElementType } & React.HTMLAttributes<HTMLElement>
>(({ as: BaseComponent = 'span', expressive = false, className, children, ...rest }, ref) => {
  const suffix = textUtilitySuffix(expressive)
  return (
    <BaseComponent
      ref={ref}
      className={clsx(aramidTextBaseClass, `aramid-text-label-${suffix}`, className)}
      {...rest}
    >
      {children}
    </BaseComponent>
  )
})

TextLabel.displayName = 'Text.Label'
