import React, { ReactElement } from 'react'
import { clsx } from 'clsx'
import styles from './column.module.css'
import { PolymorphicComponentPropWithRef } from '../../internal/PolymorphicProps';

type ColumnSpanRange = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

type ColumnSpanPercent = '25%' | '50%' | '75%' | '100%';

type ColumnSpanSimple<T extends ColumnSpanRange> = boolean | T | ColumnSpanPercent;

export interface ColumnSpanComplex<T extends ColumnSpanRange> {
  span?: ColumnSpanSimple<T>;

  offset?: number;

  start?: number;

  end?: number;
}

export type ColumnSpan<T extends ColumnSpanRange> = ColumnSpanSimple<T> | ColumnSpanComplex<T>;

export interface ColumnBaseProps {
  /**
   * Контент, который будет отображён внутри `Column`.
   */
  children?: React.ReactNode;

  /**
   * Кастомный класс для применения к `Column`.
   */
  className?: string;

  /**
   * Настройки позиции и размера колонки.
   * Поддерживает `span`, `start`, `end`, `offset`.
   */
  span?: ColumnSpan<ColumnSpanRange>;
}

export type ColumnProps<T extends React.ElementType> =
  PolymorphicComponentPropWithRef<T, ColumnBaseProps>


export interface ColumnComponent {
  <T extends React.ElementType>(
    props: ColumnProps<T>,
    context?: any
  ): ReactElement | null;
}

type StyleWithVars = React.CSSProperties & Record<string, string | number>;

const normalizeColumnSpan = (
  value: ColumnSpan<ColumnSpanRange> | undefined
): ColumnSpanComplex<ColumnSpanRange> | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'object' && value !== null) {
    return value as ColumnSpanComplex<ColumnSpanRange>;
  }

  return { span: value };
};

const setColumnStyle = (style: StyleWithVars, value: ColumnSpan<ColumnSpanRange> | undefined) => {
  const normalized = normalizeColumnSpan(value);

  if (!normalized) {
    return;
  }

  const { span, start, end, offset } = normalized;
  const resolvedStart = start ?? (offset !== undefined ? offset + 1 : undefined);

  if (span !== undefined) {
    style['--col-span'] = String(span);
  }

  if (resolvedStart !== undefined) {
    style['--col-start'] = resolvedStart;
  }

  if (end !== undefined) {
    style['--col-end'] = end;
  }
};

const getColumnInlineStyle = ({ span }: Pick<ColumnBaseProps, 'span'>): React.CSSProperties => {
  const style: StyleWithVars = {};

  setColumnStyle(style, span);

  return style;
};

const Column = React.forwardRef<
  any,
  ColumnBaseProps & {
    as?: React.ElementType;
  } & React.HTMLAttributes<HTMLDivElement>
>(
  (
    { as, children, className: customClassName, span, style: customStyle, ...rest },
    ref
  ) => {
    const BaseComponent = as || 'div';

    const inlineStyle = getColumnInlineStyle({ span });
    const style = {
      ...inlineStyle,
      ...customStyle,
    };

    return (
      <BaseComponent className={clsx(styles.column, customClassName)} style={style} ref={ref} {...rest}>
        {children}
      </BaseComponent>
    );
  }
);

Column.displayName = 'Column';

export default Column as ColumnComponent;