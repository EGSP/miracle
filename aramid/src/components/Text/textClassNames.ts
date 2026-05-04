/** Базовый класс корня типографики Aramid (сброс margin и общая привязка к стеку через модификаторы). */
export const aramidTextBaseClass = 'aramid-text' as const

/**
 * Возвращает класс варианта тела (`body-compact-*` / `body-*`) по флагам Carbon-наборов.
 *
 * @param options.expressive — экспрессивный (-02) или продуктивный (-01) набор.
 * @param options.compact — компактное тело (короткие блоки) или «длинное».
 */
export function textBodyVariantClass(options: {
  expressive: boolean
  compact: boolean
}): string {
  const { expressive, compact } = options
  if (compact) {
    return expressive ? 'aramid-text-body-compact-02' : 'aramid-text-body-compact-01'
  }
  return expressive ? 'aramid-text-body-02' : 'aramid-text-body-01'
}

/**
 * Уровень фиксированного заголовка (только productive в Aramid).
 *
 * - `compact-01` / `compact-02` — компактные заголовки компонента и макета.
 * - `01` … `07` — ступени `heading-01` … `heading-07` в терминах Carbon.
 */
export type TextHeadingVariant =
  | 'compact-01'
  | 'compact-02'
  | '01'
  | '02'
  | '03'
  | '04'
  | '05'
  | '06'
  | '07'

const headingVariantToClass: Record<TextHeadingVariant, string> = {
  'compact-01': 'aramid-text-heading-compact-01',
  'compact-02': 'aramid-text-heading-compact-02',
  '01': 'aramid-text-heading-01',
  '02': 'aramid-text-heading-02',
  '03': 'aramid-text-heading-03',
  '04': 'aramid-text-heading-04',
  '05': 'aramid-text-heading-05',
  '06': 'aramid-text-heading-06',
  '07': 'aramid-text-heading-07',
}

/** CSS-класс фиксированного заголовка по значению `variant`. */
export function textHeadingVariantClass(variant: TextHeadingVariant): string {
  return headingVariantToClass[variant]
}

/** Суффикс токена Carbon `-01` (productive) или `-02` (expressive) для utility-стилей. */
export function textUtilitySuffix(expressive: boolean): '01' | '02' {
  return expressive ? '02' : '01'
}
