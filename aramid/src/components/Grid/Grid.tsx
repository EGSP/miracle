import React from 'react';
import { clsx } from 'clsx';
import './aramid-grid.css';
import { aramidGridClass, aramidSubgridClass } from '../../internal/layoutClassNames';
import { PolymorphicComponentPropWithRef } from '../../internal/PolymorphicProps';
import { GridColsContext, GridSettings, useGridSettings } from './GridContext';

type SubgridMode = 'wide' | 'narrow' | 'condensed';

export interface GridBaseProps {
  /**
   * Выравнивание сетки в горизонтальном потоке страницы (`start`, `center`, `end`).
   * По умолчанию — `center` (как в Carbon).
   */
  align?: 'start' | 'center' | 'end';

  /**
   * Контент внутри компонента `Grid`.
   */
  children?: React.ReactNode;

  /**
   * Дополнительный `className` к системному классу сетки (`aramid-grid` / `aramid-subgrid`).
   */
  className?: string;

  /**
   * Режим «condensed»: узкий межколоночный зазор (как в Carbon).
   */
  condensed?: boolean;

  /**
   * Растянуть сетку на всю ширину родителя без ограничения `max-width`.
   */
  fullWidth?: boolean;

  /**
   * Режим «narrow»: без горизонтальных отступов у контейнера сетки.
   */
  narrow?: boolean;

  /**
   * Межстрочный зазор по величине совпадает с текущим межколоночным зазором.
   * Если проп не передан, межстрочный зазор выключен (`0`).
   */
  withRowGap?: boolean;
}

export type GridProps<T extends React.ElementType> = PolymorphicComponentPropWithRef<
  T,
  GridBaseProps
>;

export interface GridComponent {
  <T extends React.ElementType = 'div'>(props: GridProps<T>): React.ReactElement | null;
  displayName?: string;
}

type StyleWithVars = React.CSSProperties & Record<string, string | number>;

/** Совпадает с токеном `grid.cols` (tokens/grid/base.json). */
const GRID_COLS = '16';

function resolveMode(narrow: boolean, condensed: boolean): SubgridMode {
  if (narrow) return 'narrow';
  if (condensed) return 'condensed';
  return 'wide';
}

function gutterForMode(mode: SubgridMode): string {
  return mode === 'condensed'
    ? 'var(--aramid-grid-gutter-condensed)'
    : 'var(--aramid-grid-gutter)';
}

function paddingInlineForMode(mode: SubgridMode): string {
  return mode === 'narrow' ? '0' : 'var(--aramid-grid-margin)';
}

function alignMargins(align?: GridBaseProps['align']): Pick<
  StyleWithVars,
  '--grid-margin-inline-start' | '--grid-margin-inline-end'
> {
  if (align === 'start') {
    return { '--grid-margin-inline-start': '0', '--grid-margin-inline-end': 'auto' };
  }
  if (align === 'end') {
    return { '--grid-margin-inline-start': 'auto', '--grid-margin-inline-end': '0' };
  }
  return { '--grid-margin-inline-start': 'auto', '--grid-margin-inline-end': 'auto' };
}

/**
 * CSS-переменные для корневой сетки (без префикса пакета у прокидываемых значений).
 * Токены по умолчанию — в `aramid-grid.css` через `--aramid-*`.
 */
function rootGridVariables(
  props: Pick<GridBaseProps, 'condensed' | 'narrow' | 'fullWidth' | 'align' | 'withRowGap'>
): React.CSSProperties {
  const narrow = props.narrow ?? false;
  const condensed = props.condensed ?? false;
  const mode = resolveMode(narrow, condensed);
  const gutter = gutterForMode(mode);
  const rowGap = props.withRowGap ? gutter : '0px';

  const vars: StyleWithVars = {
    '--grid-cols': GRID_COLS,
    '--grid-column-gap': gutter,
    '--grid-row-gap': rowGap,
    '--grid-padding-inline': paddingInlineForMode(mode),
    '--grid-max-width': props.fullWidth ? '100%' : 'var(--aramid-grid-max-width, 1584px)',
    ...alignMargins(props.align),
  };

  return vars;
}

function subgridVariables(
  mode: SubgridMode,
  withRowGap?: boolean
): React.CSSProperties {
  const gutter = gutterForMode(mode);
  const vars: StyleWithVars = {
    '--subgrid-column-gap': gutter,
    '--subgrid-row-gap': withRowGap ? gutter : '0px',
  };
  return vars;
}

function Grid<T extends React.ElementType>(props: GridProps<T>) {
  return <CSSGrid {...props} />;
}

const CSSGrid = React.forwardRef<
  any,
  GridBaseProps & {
    as?: React.ElementType;
  } & React.HTMLAttributes<HTMLDivElement>
>(
  (
    {
      align,
      as,
      children,
      className: customClassName,
      condensed = false,
      fullWidth = false,
      narrow = false,
      withRowGap,
      style: userStyle,
      ...rest
    },
    ref?
  ) => {
    const { subgrid } = useGridSettings();
    const mode = resolveMode(narrow, condensed);

    const layoutProps = {
      condensed,
      narrow,
      fullWidth,
      align,
      withRowGap,
    };

    const BaseComponent = as || 'div';

    if (subgrid) {
      const style = { ...subgridVariables(mode, withRowGap), ...userStyle };
      return (
        <GridSettings subgrid>
          <BaseComponent
            ref={ref}
            className={clsx(aramidSubgridClass, customClassName)}
            style={style}
            {...rest}>
            {children}
          </BaseComponent>
        </GridSettings>
      );
    }

    const style = { ...rootGridVariables(layoutProps), ...userStyle };
    return (
      <GridSettings subgrid>
        <GridColsContext.Provider value={16}>
          <BaseComponent className={clsx(aramidGridClass, customClassName)} ref={ref} style={style} {...rest}>
            {children}
          </BaseComponent>
        </GridColsContext.Provider>
      </GridSettings>
    );
  }
) as GridComponent;

const GridAsGridComponent = Grid as GridComponent;
GridAsGridComponent.displayName = 'Grid';
CSSGrid.displayName = 'CSSGrid';

export { GridAsGridComponent as Grid };
