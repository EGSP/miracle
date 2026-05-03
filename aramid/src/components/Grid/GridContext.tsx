import React from 'react';

export interface GridSettingContext {
  /**
   * Вложенный `Grid` рендерится как subgrid по отношению к родительской сетке.
   */
  subgrid?: boolean;
}

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
