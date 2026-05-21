import React, { forwardRef } from 'react';
import { clsx } from 'clsx';

import { aramidLayerClass } from '../../internal/layoutClassNames';
import { PolymorphicComponentPropWithRef } from '../../internal/PolymorphicProps';
import './aramid-layer.css';
import { LayerLevelContext, useLayer } from './LayerContext';
import { clampLayerLevel, type LayerLevel } from './layerTokens';

export interface LayerBaseProps {
  children?: React.ReactNode;
  className?: string;
  /**
   * Явный уровень слоя (0…3). Перебивает авто-инкремент от родительского `Layer`.
   */
  level?: LayerLevel;
}

export type LayerProps<C extends React.ElementType = 'div'> = PolymorphicComponentPropWithRef<
  C,
  LayerBaseProps
>;

type LayerComponent = <C extends React.ElementType = 'div'>(
  props: LayerProps<C>,
) => React.ReactElement | null;

/**
 * Поверхность слоя Carbon g10: задаёт уровень в Context и `--layer-background`.
 * Токены полей — через `useLayerTokens` в Input, Textarea и т.д.
 */
export const Layer: LayerComponent = forwardRef(function Layer<C extends React.ElementType = 'div'>(
  { as, children, className, level: levelProp, style, ...rest }: LayerProps<C>,
  ref: React.Ref<Element>,
) {
  const BaseComponent = (as ?? 'div') as React.ElementType;
  const { level: parentLevel } = useLayer();

  const level =
    levelProp !== undefined ? clampLayerLevel(levelProp) : clampLayerLevel(parentLevel + 1);

  const layerStyle = {
    ...style,
    '--layer-level': String(level),
    '--layer-background': `var(--aramid-layer-${level}-background)`,
  } as React.CSSProperties;

  const classNames = clsx(aramidLayerClass, className);

  return (
    <LayerLevelContext.Provider value={level}>
      <BaseComponent
        {...rest}
        ref={ref}
        className={classNames}
        style={layerStyle}
        data-layer={level}
      >
        {children}
      </BaseComponent>
    </LayerLevelContext.Provider>
  );
}) as LayerComponent;

(Layer as { displayName?: string }).displayName = 'Layer';
