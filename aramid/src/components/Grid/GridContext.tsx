import React from 'react';

export interface GridSettingContext {
  /**
   * Вложенный `Grid` рендерится как subgrid по отношению к родительской сетке.
   */
  subgrid?: boolean;
}

/** Число колонок текущей сетки — устанавливается Grid (root) и Column (при известном span). */
const GridColsContext = React.createContext<number>(16);

export { GridColsContext };

/** Читает число колонок ближайшей охватывающей сетки или колонки. */
export const useGridCols = () => React.useContext(GridColsContext);

const GridSettingsContext = React.createContext<GridSettingContext>({
  subgrid: false,
});

export interface GridSettingsProps {
  /**
   * Дочерние элементы провайдера настроек сетки.
   */
  children?: React.ReactNode;

  /**
   * Для всех потомков следующий рендер `Grid` считается вложенной сеткой.
   */
  subgrid?: boolean;
}

export const GridSettings = ({ children, subgrid = false }: GridSettingsProps) => {
  const value = React.useMemo(
    () => ({
      subgrid,
    }),
    [subgrid]
  );
  return <GridSettingsContext.Provider value={value}>{children}</GridSettingsContext.Provider>;
};

/** Доступ к настройкам сетки (вложенность subgrid). */
export const useGridSettings = () => {
  return React.useContext(GridSettingsContext);
};
