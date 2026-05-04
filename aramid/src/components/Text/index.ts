/**
 * Типографика Aramid в духе [Carbon type sets](https://carbondesignsystem.com/elements/typography/type-sets/):
 * тело (`Text`), фиксированные заголовки (`Text.Heading`), утилиты (`Text.Label`, `Text.Helper`, `Text.Legal`, `Text.Code`).
 *
 * Подробные правила применения и формулировки из Carbon — в `README.md` в этой папке.
 *
 * Имена идентификаторов в коде — на английском; пользовательские описания — на русском ([CARBON_DESIGN_ADOPTION.md](../../../CARBON_DESIGN_ADOPTION.md), [AGENTS.md](../../../AGENTS.md)).
 */
import './aramid-text.css'

import { Text as TextRoot } from './Text'
import { TextHeading } from './Text.Heading'
import { TextLabel } from './Text.Label'
import { TextHelper } from './Text.Helper'
import { TextLegal } from './Text.Legal'
import { TextCode } from './Text.Code'

/** Корневой `Text` с подкомпонентами `Heading`, `Label`, `Helper`, `Legal`, `Code`. */
export const Text = Object.assign(TextRoot, {
  Heading: TextHeading,
  Label: TextLabel,
  Helper: TextHelper,
  Legal: TextLegal,
  Code: TextCode,
})

export type { TextBaseProps } from './Text'
export type { TextHeadingBaseProps } from './Text.Heading'
export type { TextHeadingVariant } from './textClassNames'
export type { TextLabelBaseProps } from './Text.Label'
export type { TextHelperBaseProps } from './Text.Helper'
export type { TextLegalBaseProps } from './Text.Legal'
export type { TextCodeBaseProps } from './Text.Code'

export { aramidTextBaseClass, textBodyVariantClass, textHeadingVariantClass, textUtilitySuffix } from './textClassNames'
