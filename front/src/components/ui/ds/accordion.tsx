/**
 * Accordion — раскрывающиеся секции (адаптация Carbon Accordion v11 под Aramid).
 *
 * Композиция: <Accordion> оборачивает набор <Accordion.Item>. Каждый Item управляет
 * своим раскрытием — неконтролируемо (`defaultOpen`) либо контролируемо (`open` + `onOpenChange`).
 *
 * a11y (WAI-ARIA Accordion): заголовок — `<button aria-expanded aria-controls>` внутри
 * элемента-заголовка (`<h3>` по умолчанию, уровень настраивается через `headingLevel`);
 * панель — `role="region" aria-labelledby`, скрыта через `hidden`, когда свёрнута.
 */

import type { ReactNode } from "react"
import { useId, useState } from "react"
import { cn } from "@/lib/utils"
import "@/design/accordion.css"

export type AccordionProps = {
  children: ReactNode
  /** Выравнивание шеврона: `end` (по умолчанию, как в Carbon) — справа, `start` — слева. */
  align?: "start" | "end"
  /** Компактный режим: секции ниже по высоте (меньше паддинги заголовков). */
  compact?: boolean
  className?: string
}

function Accordion({ children, align = "end", compact = false, className }: AccordionProps) {
  return (
    <div
      data-slot="accordion"
      data-align={align}
      data-compact={compact || undefined}
      className={cn("accordion", className)}
    >
      {children}
    </div>
  )
}

export type AccordionItemProps = {
  /** Заголовок секции. */
  title: ReactNode
  children: ReactNode
  /** Начальное состояние при неконтролируемом использовании. */
  defaultOpen?: boolean
  /** Контролируемое состояние раскрытия. Если задано — компонент контролируемый. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  /** Уровень заголовка для семантики (`h2`…`h6`). По умолчанию 3. */
  headingLevel?: 2 | 3 | 4 | 5 | 6
  className?: string
}

function AccordionItem({
  title,
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  disabled = false,
  headingLevel = 3,
  className,
}: AccordionItemProps) {
  const id = useId()
  const triggerId = `${id}-trigger`
  const panelId = `${id}-panel`

  const [openInternal, setOpenInternal] = useState(defaultOpen)
  const isControlled = openProp !== undefined
  const isOpen = isControlled ? openProp : openInternal

  const toggle = () => {
    if (disabled) return
    const next = !isOpen
    if (!isControlled) setOpenInternal(next)
    onOpenChange?.(next)
  }

  const Heading = `h${headingLevel}` as const

  return (
    <div
      data-slot="accordion-item"
      className={cn("accordion-item", isOpen && "accordion-item--open", className)}
    >
      <Heading className="accordion-item__heading">
        <button
          type="button"
          id={triggerId}
          className="accordion-item__trigger"
          aria-expanded={isOpen}
          aria-controls={panelId}
          disabled={disabled}
          onClick={toggle}
        >
          <span className="accordion-item__title">{title}</span>
          <span
            className={cn("accordion-item__chevron", isOpen && "accordion-item__chevron--open")}
            aria-hidden="true"
          />
        </button>
      </Heading>
      <section
        id={panelId}
        aria-labelledby={triggerId}
        className="accordion-item__panel"
        hidden={!isOpen}
      >
        <div className="accordion-item__content">{children}</div>
      </section>
    </div>
  )
}

const AccordionRoot = Object.assign(Accordion, { Item: AccordionItem })

export { AccordionItem, AccordionRoot as Accordion }
