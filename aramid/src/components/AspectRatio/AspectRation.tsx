import React, { ReactElement } from 'react';
import { clsx } from 'clsx';
import styles from './aspect-ratio.module.css';
import { PolymorphicComponentPropWithRef } from '../../internal/PolymorphicProps';

type AspectRatioValue =
  | '1x1'
  | '2x3'
  | '3x2'
  | '3x4'
  | '4x3'
  | '1x2'
  | '2x1'
  | '9x16'
  | '16x9';

export interface AspectRatioProps {
  /**
   * Соотношение сторон контейнера.
   */
  ratio?: AspectRatioValue;
}

export type AspectRatioComponentProps<T extends React.ElementType> =
  PolymorphicComponentPropWithRef<T, AspectRatioProps>;

export interface AspectRatioComponent {
  <T extends React.ElementType>(
    props: AspectRatioComponentProps<T>,
    context?: any
  ): ReactElement | null;
}

function ratioToCssValue(ratio: AspectRatioValue): string {
  const [width, height] = ratio.split('x');
  return `${width} / ${height}`;
}

/**
 * Контейнер, который удерживает заданное соотношение сторон для контента.
 */
const AspectRatio = React.forwardRef<
  any,
  AspectRatioComponentProps<React.ElementType>
>(({ as, className: customClassName, children, ratio = '1x1', style: customStyle, ...rest }, ref) => {
  const BaseComponent = as || 'div';
  const style: React.CSSProperties & Record<string, string> = {
    '--aspect-ratio': ratioToCssValue(ratio),
    ...customStyle,
  } as React.CSSProperties & Record<string, string>;

  return (
    <BaseComponent className={clsx(styles.aspectRatio, customClassName)} style={style} ref={ref} {...rest}>
      {children}
    </BaseComponent>
  );
});

AspectRatio.displayName = 'AspectRatio';

export default AspectRatio as AspectRatioComponent;