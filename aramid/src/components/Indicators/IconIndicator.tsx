import React from 'react'
import { clsx } from 'clsx'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Circle,
  CircleCheck,
  CircleDashed,
  Clock,
  HelpCircle,
  Info,
  Loader2,
  XCircle,
} from 'lucide-react'
import { Text } from '../Text'
import './aramid-icon-indicator.css'

/** Допустимые варианты индикатора (как в Carbon `IconIndicator`). */
export const IconIndicatorKinds = [
  'failed',
  'caution-major',
  'caution-minor',
  'undefined',
  'succeeded',
  'normal',
  'in-progress',
  'incomplete',
  'not-started',
  'pending',
  'unknown',
  'informative',
] as const

const iconByKind: Record<(typeof IconIndicatorKinds)[number], LucideIcon> = {
  failed: XCircle,
  'caution-major': AlertTriangle,
  'caution-minor': AlertTriangle,
  undefined: HelpCircle,
  succeeded: CircleCheck,
  normal: Circle,
  'in-progress': Loader2,
  incomplete: CircleDashed,
  'not-started': CircleDashed,
  pending: Clock,
  unknown: HelpCircle,
  informative: Info,
}

/** Ссылка на токен иконки по виду (`color.indicator.*` → `--aramid-color-indicator-*`). */
const iconColorVarByKind: Record<(typeof IconIndicatorKinds)[number], string> = {
  failed: 'var(--aramid-color-indicator-failed)',
  'caution-major': 'var(--aramid-color-indicator-caution-major)',
  'caution-minor': 'var(--aramid-color-indicator-caution-minor)',
  undefined: 'var(--aramid-color-indicator-undefined)',
  succeeded: 'var(--aramid-color-indicator-succeeded)',
  normal: 'var(--aramid-color-indicator-normal)',
  'in-progress': 'var(--aramid-color-indicator-in-progress)',
  incomplete: 'var(--aramid-color-indicator-incomplete)',
  'not-started': 'var(--aramid-color-indicator-not-started)',
  pending: 'var(--aramid-color-indicator-pending)',
  unknown: 'var(--aramid-color-indicator-unknown)',
  informative: 'var(--aramid-color-indicator-informative)',
}

export type IconIndicatorKind = (typeof IconIndicatorKinds)[number]

export interface IconIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Дополнительный класс корня. */
  className?: string

  /** Вид индикатора (иконка и цвет по токену `color.indicator.<kind>`). */
  kind: IconIndicatorKind

  /** Подпись рядом с иконкой (типографика `Text`, компактное тело как в Carbon). */
  label: string

  /** Размер иконки в px (по умолчанию 16; при 20 включается экспрессивный компактный текст `-02`). */
  size?: 16 | 20
}

export const IconIndicator = React.forwardRef<HTMLDivElement, IconIndicatorProps>(
  ({ className, kind, label, size = 16, style, ...rest }, ref) => {
    const Icon = iconByKind[kind]
    if (!Icon) {
      return null
    }

    const rootStyle: React.CSSProperties = {
      ['--indicator-icon-color' as string]: iconColorVarByKind[kind],
      ...style,
    }

    return (
      <div ref={ref} className={clsx('aramid-icon-indicator', className)} style={rootStyle} {...rest}>
        <Icon
          size={size}
          className={clsx(
            'aramid-icon-indicator__icon',
            kind === 'in-progress' && 'aramid-icon-indicator__icon--spin'
          )}
          aria-hidden
        />
        <Text as="span" compact expressive={size === 20} className="aramid-icon-indicator__label">
          {label}
        </Text>
      </div>
    )
  }
)

IconIndicator.displayName = 'IconIndicator'
