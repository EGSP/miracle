import React from 'react'
import { clsx } from 'clsx'
import { aramidTextBaseClass, textBodyVariantClass } from './textClassNames'

export interface TextAreaBaseProps {
  /**
   * Вариант высоты области:
   * - `'md'` — фиксированная высота `--aramid-spacing-13` (160px). При `resizable` — минимальная.
   * - `'lg'` — фиксированная высота `--aramid-spacing-13 * 2` (320px). При `resizable` — минимальная.
   * - не передан — высота определяется содержимым.
   */
  variant?: 'md' | 'lg'

  /**
   * Разрешает растягивание области вверх за ручку.
   * Пользователь может увеличить высоту, но не уменьшить ниже значения `variant`
   * (или ниже начальной высоты содержимого, если `variant` не задан).
   */
  resizable?: boolean

  /**
   * Набор типов **expressive** (`body-02`): более крупная кегль и воздушнее межстрочный интервал.
   * При `false` — **productive** (`body-01`).
   */
  expressive?: boolean

  /** Текстовое содержимое. Переносы строк сохраняются (`white-space: pre-wrap`). */
  children: string

  /** Дополнительный CSS-класс корня. */
  className?: string
}

/**
 * Прокручиваемый контейнер для отображения текстового содержимого.
 *
 * Предназначен для случаев, когда нужно ограничить или зафиксировать область отображения текста:
 * лог-вьювер, блок документа, многострочный вывод. Не является полем ввода.
 *
 * Поведение высоты:
 * - без `variant` — высота по содержимому, скролл не активен.
 * - `variant="md"/"lg"` — фиксированная высота, скролл при переполнении.
 * - `variant` + `resizable` — заданный размер становится минимальным, пользователь тянет вверх.
 */
export const TextArea = React.forwardRef<
  HTMLDivElement,
  TextAreaBaseProps & React.HTMLAttributes<HTMLDivElement>
>(({ variant, resizable = false, expressive = false, className, children, ...rest }, ref) => {
  const typographyClass = textBodyVariantClass({ expressive, compact: false })

  return (
    <div
      ref={ref}
      className={clsx(
        aramidTextBaseClass,
        typographyClass,
        'aramid-text-area',
        variant && `aramid-text-area--${variant}`,
        resizable && 'aramid-text-area--resizable',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
})

TextArea.displayName = 'Text.Area'
