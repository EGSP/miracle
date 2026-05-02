import React from 'react'
import { clsx } from 'clsx'
import styles from './grid.module.css'

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Убирает горизонтальные отступы (поля) сетки по умолчанию */
  narrow?: boolean
  /** Сжимает все промежутки между колонками до 1px */
  condensed?: boolean
  /** Убирает ограничение максимальной ширины */
  fullWidth?: boolean
}

export const Grid: React.FC<GridProps> = ({
  children,
  className,
  narrow,
  condensed,
  fullWidth,
  ...rest
}) => {
  return (
    <div
      className={clsx(
        styles.grid,
        narrow && styles.gridNarrow,
        condensed && styles.gridCondensed,
        fullWidth && styles.gridFullWidth,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

Grid.displayName = 'Grid'
