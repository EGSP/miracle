import React from 'react'
import { clsx } from 'clsx'
import styles from './grid.module.css'

export interface ColumnProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Number of grid columns to span on small screens (1–4).
   * Defaults to full width.
   */
  sm?: 1 | 2 | 3 | 4
  /**
   * Number of grid columns to span on medium screens (1–8).
   * Defaults to full width.
   */
  md?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  /**
   * Number of grid columns to span on large screens (1–16).
   * Defaults to full width.
   */
  lg?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16
}

export const Column: React.FC<ColumnProps> = ({
  children,
  className,
  sm,
  md,
  lg,
  style,
  ...rest
}) => {
  const inlineStyle: React.CSSProperties = {
    ...(sm !== undefined && { '--col-span-sm': sm } as React.CSSProperties),
    ...(md !== undefined && { '--col-span-md': md } as React.CSSProperties),
    ...(lg !== undefined && { '--col-span-lg': lg } as React.CSSProperties),
    ...style,
  }

  return (
    <div
      className={clsx(styles.column, className)}
      style={inlineStyle}
      {...rest}
    >
      {children}
    </div>
  )
}

Column.displayName = 'Column'
