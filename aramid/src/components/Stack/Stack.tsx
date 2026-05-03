import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import './aramid-stack.css';
import { aramidStackClass } from '../../internal/layoutClassNames';

const SPACING_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

export interface StackProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Пользовательский тип элемента, который будет отрисован корневым узлом.
   * По умолчанию используется `div`.
   */
  as?: (() => React.ReactNode) | string | React.ElementType;

  /**
   * Дочерние элементы внутри `Stack`.
   */
  children?: React.ReactNode;

  /**
   * Дополнительный класс для корневого элемента.
   */
  className?: string;

  /**
   * Отступ между элементами:
   * - число из шкалы spacing (`1..13`);
   * - либо любое валидное CSS-значение (например `12px`, `1rem`).
   */
  gap?: string | (typeof SPACING_STEPS)[number];

  /**
   * Направление расположения элементов.
   */
  orientation?: 'horizontal' | 'vertical';
}

/**
 * Простой layout-компонент для вертикального/горизонтального стека.
 * `Stack` не использует внешние отступы у детей, а управляет расстоянием через `gap`.
 */
export const Stack = forwardRef<HTMLElement, StackProps>((props, ref) => {
  const {
    as: BaseComponent = 'div',
    children,
    className: customClassName,
    gap,
    orientation = 'vertical',
    ...rest
  } = props;
  const className = clsx(aramidStackClass, customClassName);
  const style: React.CSSProperties & Record<string, string> = { ...rest.style } as React.CSSProperties &
    Record<string, string>;

  style['--stack-direction'] = orientation === 'horizontal' ? 'row' : 'column';

  if (typeof gap === 'number') {
    style['--stack-gap'] = `var(--aramid-spacing-${gap})`;
  } else if (typeof gap === 'string') {
    style['--stack-gap'] = gap;
  }

  return (
    <BaseComponent {...rest} ref={ref} className={className} style={style}>
      {children}
    </BaseComponent>
  );
});

Stack.displayName = 'Stack';